// Имя каждого теста повторяет формулировку правила.
// Ручка автосохранения проверяется поведением: что осталось на диске после запроса.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {draftRoute} from '../src/adapters/draftRoute.mjs';
import {loadDraft} from '../src/adapters/draftStore.mjs';

const НАСТРОЙКИ = {
  хранение: {папкаЧерновиков: '.drafts', папкаСнимков: '.history', черновикЖивётДней: 14, снимковНаВерсию: 50},
  ошибкиСервера: {плохойЗапрос: 'неверный запрос', нетСтатьи: 'нет такой статьи'},
};

const REL = 'docs/a/index.mdx';
// Файл на диске в windows-виде: именно так лежат статьи, правленные в Windows.
const ФАЙЛ = '---\r\ntitle: A\r\n---\r\n\r\nтекст статьи\r\n';

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
  fs.mkdirSync(path.join(repo, path.dirname(REL)), {recursive: true});
  fs.writeFileSync(path.join(repo, REL), ФАЙЛ, 'utf8');
  return {repo, editorDir};
}

/** Один запрос к ручке черновика. Возвращает ответ сервера. */
async function запрос(с, payload, последняяПравка = new Map()) {
  const ответы = [];

  await draftRoute({
    req: {method: 'POST'},
    res: {},
    url: {pathname: '/api/draft'},
    repo: с.repo,
    editorDir: с.editorDir,
    settings: НАСТРОЙКИ,
    тело: async () => payload,
    insideRepo: () => true,
    send: (res, code, data) => ответы.push({code, data}),
    последняяПравка,
  });

  return ответы[0];
}

describe('автосохранение черновика', () => {
  it('черновик, отличающийся от файла только переводами строк, на диске не остаётся', () => {
    // Окно держит текст в unix-виде, а файл на диске — в windows: точное сравнение выдавало бы
    // одинаковые тексты за разные (SPEC 3.6). Тогда после возврата к версии, равной файлу,
    // на диске оставался бы черновик, которого человек не делал, и он всплывал бы при открытии.
    const с = среда();

    return запрос(с, {
      path: REL,
      body: '\nтекст статьи\n',
      frontmatterRaw: 'title: A',
      отпечатокБазы: 'ОТП1',
      правкаОт: '2026-08-06T10:00:00.000Z',
    }).then((ответ) => {
      expect(ответ.code).toBe(200);
      expect(ответ.data['совпадаетСФайлом']).toBe(true);
      expect(loadDraft(с.editorDir, НАСТРОЙКИ, REL)).toBeNull();
    });
  });

  it('правка, отличная от файла, в черновик записывается', () => {
    const с = среда();

    return запрос(с, {
      path: REL,
      body: '\nдругой текст\n',
      frontmatterRaw: 'title: A',
      отпечатокБазы: 'ОТП1',
      правкаОт: '2026-08-06T10:00:00.000Z',
    }).then((ответ) => {
      expect(ответ.data['автосохранено']).toBeTruthy();
      expect(loadDraft(с.editorDir, НАСТРОЙКИ, REL)['body']).toBe('\nдругой текст\n');
    });
  });

  it('тело запроса не объект — плохой запрос, а не падение ручки', () => {
    const с = среда();

    return запрос(с, null).then((ответ) => {
      expect(ответ.code).toBe(400);
      expect(loadDraft(с.editorDir, НАСТРОЙКИ, REL)).toBeNull();
    });
  });

  it('запоздавшая правка не затирает уже записанную свежую', () => {
    const с = среда();
    const память = new Map();
    const общее = {path: REL, frontmatterRaw: 'title: A', отпечатокБазы: 'ОТП1'};

    return запрос(с, {...общее, body: '\nсвежая\n', правкаОт: '2026-08-06T10:00:05.000Z'}, память)
      .then(() => запрос(с, {...общее, body: '\nстарая\n', правкаОт: '2026-08-06T10:00:01.000Z'}, память))
      .then((ответ) => {
        expect(ответ.data['устарел']).toBe(true);
        expect(loadDraft(с.editorDir, НАСТРОЙКИ, REL)['body']).toBe('\nсвежая\n');
      });
  });
});
