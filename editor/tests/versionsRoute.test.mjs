// Имя каждого теста повторяет формулировку правила.
// Ручки ленты версий проверяются поведением: что ответил сервер, а не что написано в коде.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {versionsRoute} from '../src/adapters/versionsRoute.mjs';
import {saveSnapshot} from '../src/adapters/draftStore.mjs';
import {historyFolder} from '../src/core/history.mjs';

const НАСТРОЙКИ = {
  хранение: {папкаЧерновиков: '.drafts', папкаСнимков: '.history', черновикЖивётДней: 14, снимковНаВерсию: 50},
  ошибкиСервера: {плохойЗапрос: 'неверный запрос', нетСтатьи: 'нет такой статьи', нетВерсии: 'нет такой версии статьи'},
};

const RU = 'i18n/ru/docs/a/index.mdx';
const EN = 'docs/a/index.mdx';
const СТАТЬЯ = '---\ntitle: A\n---\n\nтекст статьи\n';

const песочницы = [];
function песочница(имя) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), имя));
  песочницы.push(dir);
  return dir;
}

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

function среда() {
  const repo = песочница('editor-repo-');
  const editorDir = песочница('editor-store-');

  for (const rel of [RU, EN]) {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), СТАТЬЯ, 'utf8');
  }

  return {repo, editorDir};
}

/** Один запрос к ручке. Возвращает то, чем сервер ответил. */
async function запрос(с, pathname, params) {
  const ответы = [];
  const url = {pathname, searchParams: new URLSearchParams(params)};

  const взято = await versionsRoute({
    req: {method: 'GET'},
    res: {},
    url,
    repo: с.repo,
    editorDir: с.editorDir,
    settings: НАСТРОЙКИ,
    insideRepo: (target) => path.resolve(target).startsWith(с.repo + path.sep),
    send: (res, code, data) => ответы.push({code, data}),
  });

  return {взято, ...ответы[0]};
}

const снимок = (с, rel, текст, автор, iso) => saveSnapshot(с.editorDir, НАСТРОЙКИ, rel, текст, автор, iso);

describe('лента версий', () => {
  it('снимков нет — лента пуста, а не ошибка', async () => {
    const ответ = await запрос(среда(), '/api/versions', {path: RU});

    expect(ответ.code).toBe(200);
    expect(ответ.data.сеансы).toEqual([]);
  });

  it('подряд идущие сохранения одного автора собраны в одну отметку', async () => {
    const с = среда();
    снимок(с, RU, 'раз', 'я', '2026-08-04T10:00:00.000Z');
    снимок(с, RU, 'два', 'я', '2026-08-04T10:05:00.000Z');
    снимок(с, RU, 'три', 'Неизвестный', '2026-08-04T10:10:00.000Z');

    const {data} = await запрос(с, '/api/versions', {path: RU});

    expect(data.сеансы.map((сеанс) => сеанс.author)).toEqual(['я', 'Неизвестный']);
    expect(data.сеансы[0].snapshots).toHaveLength(2);
  });

  it('посторонний файл в папке снимков в ленту не попадает и её не роняет', async () => {
    const с = среда();
    снимок(с, RU, 'раз', 'я', '2026-08-04T10:00:00.000Z');
    fs.writeFileSync(path.join(с.editorDir, '.history', historyFolder(RU), 'заметка.txt'), 'мусор', 'utf8');

    const {code, data} = await запрос(с, '/api/versions', {path: RU});

    expect(code).toBe(200);
    expect(data.сеансы[0].snapshots).toHaveLength(1);
  });

  it('лента показывает версии открытой языковой версии, а не всех языков сразу', async () => {
    const с = среда();
    снимок(с, RU, 'русская', 'я', '2026-08-04T10:00:00.000Z');
    снимок(с, EN, 'английская', 'я', '2026-08-04T10:00:00.000Z');
    снимок(с, EN, 'английская вторая', 'я', '2026-08-04T11:00:00.000Z');

    const {data} = await запрос(с, '/api/versions', {path: RU});

    expect(data.сеансы[0].snapshots).toHaveLength(1);
  });

  it('нет такой статьи — 404, а не пустая лента', async () => {
    const {code, data} = await запрос(среда(), '/api/versions', {path: 'docs/нет/index.mdx'});

    expect(code).toBe(404);
    expect(data.error).toBe(НАСТРОЙКИ['ошибкиСервера']['нетСтатьи']);
  });

  it('путь вне репозитория — плохой запрос', async () => {
    const {code, data} = await запрос(среда(), '/api/versions', {path: '../секрет.mdx'});

    expect(code).toBe(400);
    expect(data.error).toBe(НАСТРОЙКИ['ошибкиСервера']['плохойЗапрос']);
  });
});

describe('содержимое одной версии', () => {
  it('содержимое версии приходит разобранным: шапка отдельно, тело отдельно', async () => {
    const с = среда();
    снимок(с, RU, '---\ntitle: Старое\n---\n\nстарый текст\n', 'я', '2026-08-04T10:00:00.000Z');
    const {data: лента} = await запрос(с, '/api/versions', {path: RU});
    const имя = лента.сеансы[0].snapshots[0].имя;

    const {code, data} = await запрос(с, '/api/version', {path: RU, имя});

    expect(code).toBe(200);
    expect(data.frontmatterRaw).toBe('title: Старое');
    expect(data.body).toBe('\nстарый текст\n');
  });

  it('имя версии вне списка известных не отдаёт файл', async () => {
    const с = среда();
    снимок(с, RU, 'раз', 'я', '2026-08-04T10:00:00.000Z');

    for (const имя of ['../../../secret.mdx', 'нет-такого.mdx', '', '..']) {
      const {code} = await запрос(с, '/api/version', {path: RU, имя});
      expect(code, имя).toBe(404);
    }
  });

  it('посторонний файл из папки снимков по прямому запросу не отдаётся', async () => {
    // В ленту он не попадает, но и открыть его в обход ленты нельзя: что считается версией,
    // решает одно правило, а не два.
    const с = среда();
    снимок(с, RU, 'раз', 'я', '2026-08-04T10:00:00.000Z');
    fs.writeFileSync(path.join(с.editorDir, '.history', historyFolder(RU), 'заметка.txt'), 'мусор', 'utf8');

    const {code} = await запрос(с, '/api/version', {path: RU, имя: 'заметка.txt'});

    expect(code).toBe(404);
  });

  it('снимок с несуществующей датой в имени версией не считается', async () => {
    const с = среда();
    fs.mkdirSync(path.join(с.editorDir, '.history', historyFolder(RU)), {recursive: true});
    fs.writeFileSync(path.join(с.editorDir, '.history', historyFolder(RU), '2026-02-30T10-00-00-000Z__я.mdx'), 'текст', 'utf8');

    const лента = await запрос(с, '/api/versions', {path: RU});
    const одна = await запрос(с, '/api/version', {path: RU, имя: '2026-02-30T10-00-00-000Z__я.mdx'});

    expect(лента.data.сеансы).toEqual([]);
    expect(одна.code).toBe(404);
  });

  it('версия другой языковой версии по имени не открывается', async () => {
    const с = среда();
    снимок(с, EN, 'английская', 'я', '2026-08-04T10:00:00.000Z');
    const {data: лента} = await запрос(с, '/api/versions', {path: EN});

    const {code} = await запрос(с, '/api/version', {path: RU, имя: лента.сеансы[0].snapshots[0].имя});

    expect(code).toBe(404);
  });

  it('снимок исчез между показом ленты и открытием — понятная ошибка', async () => {
    const с = среда();
    снимок(с, RU, 'раз', 'я', '2026-08-04T10:00:00.000Z');
    const {data: лента} = await запрос(с, '/api/versions', {path: RU});
    const имя = лента.сеансы[0].snapshots[0].имя;
    fs.rmSync(path.join(с.editorDir, '.history', historyFolder(RU), имя));

    const {code, data} = await запрос(с, '/api/version', {path: RU, имя});

    expect(code).toBe(404);
    expect(data.error).toBe(НАСТРОЙКИ['ошибкиСервера']['нетВерсии']);
  });

  it('чужой запрос ручка не перехватывает', async () => {
    expect((await запрос(среда(), '/api/articles', {})).взято).toBe(false);
  });
});
