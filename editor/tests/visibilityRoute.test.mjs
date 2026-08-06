// Имя каждого теста повторяет формулировку правила.
// Ручка видимости: пишет `unlisted` в файлы языковых версий и кладёт свою запись в историю.
// Отделено от externalVersion.test.mjs, чтобы файл держался в пределе размера (SPEC 4.9).
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {simpleGit} from 'simple-git';

import {visibilityRoute} from '../src/adapters/visibilityRoute.mjs';
import {countSnapshots, latestSnapshot, snapshotText} from '../src/adapters/draftStore.mjs';

const НАСТРОЙКИ = {
  хранение: {папкаЧерновиков: '.drafts', папкаСнимков: '.history', черновикЖивётДней: 14, снимковНаВерсию: 50},
  реестр: {неизвестныйАвтор: 'Неизвестный'},
  ошибкиСервера: {неУдалосьЗаписатьВерсию: 'версия не записана', плохойЗапрос: 'неверный запрос', неверныйАдрес: 'неверный адрес', нетСтатьи: 'нет такой статьи'},
};

const REL = 'docs/a/index.mdx';
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

/** Настоящий репозиторий с одной закоммиченной статьёй и пустым хранилищем редактора. */
async function подготовить(текст = СТАТЬЯ) {
  const repo = песочница('editor-repo-');
  const editorDir = песочница('editor-store-');
  const git = simpleGit(repo);

  await git.init();
  await git.addConfig('user.name', 'Хозяин');
  await git.addConfig('user.email', 'хозяин@example.com');

  fs.mkdirSync(path.join(repo, path.dirname(REL)), {recursive: true});
  fs.writeFileSync(path.join(repo, REL), текст, 'utf8');
  await git.add('.');
  await git.commit('первая версия');

  return {repo, editorDir, git, файл: path.join(repo, REL)};
}

const снимков = (среда) => countSnapshots(среда.editorDir, НАСТРОЙКИ, REL);

function последний(среда) {
  const снимок = latestSnapshot(среда.editorDir, НАСТРОЙКИ, REL);
  return снимок === null ? null : {...снимок, текст: snapshotText(среда.editorDir, НАСТРОЙКИ, REL, снимок['имя'])};
}

describe('переключение видимости', () => {
  it('видимость сначала фиксирует внешнюю правку, потом пишет файл', async () => {
    const среда = await подготовить();
    const внешний = `${СТАТЬЯ}дописал ИИ\n`;
    fs.writeFileSync(среда.файл, внешний, 'utf8');

    const вызовы = [];
    const ответы = [];

    await visibilityRoute({
      req: {method: 'POST'},
      res: {},
      url: {pathname: '/api/visibility'},
      repo: среда.repo,
      editorDir: среда.editorDir,
      settings: НАСТРОЙКИ,
      git: среда.git,
      тело: async () => ({paths: [REL], скрыть: true}),
      insideRepo: () => true,
      send: (res, code, data) => ответы.push({code, data}),
      // Запоминаем, что лежало в файле в момент вызова: фиксация обязана случиться до записи.
      фиксировать: async (rel, обязательно) => {
        вызовы.push({rel, обязательно, файлТогда: fs.readFileSync(path.join(среда.repo, rel), 'utf8')});
      },
    });

    expect(вызовы).toEqual([{rel: REL, обязательно: true, файлТогда: внешний}]);
    expect(ответы[0].code).toBe(200);
    expect(fs.readFileSync(среда.файл, 'utf8')).toContain('unlisted: true');
  });

  /** Один запрос смены видимости на подготовленной среде. Возвращает ответ сервера. */
  async function переключить(среда, скрыть) {
    const ответы = [];

    await visibilityRoute({
      req: {method: 'POST'},
      res: {},
      url: {pathname: '/api/visibility'},
      repo: среда.repo,
      editorDir: среда.editorDir,
      settings: НАСТРОЙКИ,
      git: среда.git,
      тело: async () => ({paths: [REL], скрыть}),
      insideRepo: () => true,
      send: (res, code, data) => ответы.push({code, data}),
      фиксировать: async () => undefined,
    });

    return ответы[0];
  }

  it('смена видимости кладёт свою запись в историю, а не оставляет её чужой правкой', async () => {
    // Без этого следующее обращение видит, что файл разошёлся с последним снимком, и записывает
    // работу самой программы как внешнюю — в ленте появляется версия с автором «Неизвестный».
    const среда = await подготовить();

    await переключить(среда, true);

    expect(снимков(среда)).toBe(1);
    expect(последний(среда).автор).toBe('Хозяин');
    expect(последний(среда).текст).toContain('unlisted: true');
  });

  it('смена видимости возвращает свежий отпечаток записанного файла', async () => {
    // Окно обязано сдвинуть базу сравнения: иначе следующее сохранение получит ложное
    // «файл изменён снаружи», хотя менял его сам редактор.
    const среда = await подготовить();

    const ответ = await переключить(среда, true);

    expect(typeof ответ.data['отпечатки'][REL]).toBe('string');
    expect(ответ.data['отпечатки'][REL]).not.toBe('');
    expect(ответ.data['предупреждения']).toEqual([]);
  });

  it('видимость не «да» и не «нет» — плохой запрос, а не молчаливое «показывать»', async () => {
    // Иначе запрос с опечаткой снял бы `unlisted` со всех языковых версий и получил бы успех.
    const среда = await подготовить();
    const ответы = [];

    await visibilityRoute({
      req: {method: 'POST'},
      res: {},
      url: {pathname: '/api/visibility'},
      repo: среда.repo,
      editorDir: среда.editorDir,
      settings: НАСТРОЙКИ,
      git: среда.git,
      тело: async () => ({paths: [REL], скрыть: 'да'}),
      insideRepo: () => true,
      send: (res, code, data) => ответы.push({code, data}),
      фиксировать: async () => undefined,
    });

    expect(ответы[0].code).toBe(400);
    expect(снимков(среда)).toBe(0);
    expect(fs.readFileSync(среда.файл, 'utf8')).not.toContain('unlisted');
  });

  it('тело запроса не объект — плохой запрос, а не падение ручки', async () => {
    const среда = await подготовить();
    const ответы = [];

    await visibilityRoute({
      req: {method: 'POST'},
      res: {},
      url: {pathname: '/api/visibility'},
      repo: среда.repo,
      editorDir: среда.editorDir,
      settings: НАСТРОЙКИ,
      git: среда.git,
      тело: async () => null,
      insideRepo: () => true,
      send: (res, code, data) => ответы.push({code, data}),
      фиксировать: async () => undefined,
    });

    expect(ответы[0].code).toBe(400);
    expect(снимков(среда)).toBe(0);
  });

  it('видимость уже в нужном состоянии — ни файла, ни лишней версии', async () => {
    const среда = await подготовить();
    await переключить(среда, true);

    const ответ = await переключить(среда, true);

    expect(ответ.data['changed']).toEqual([]);
    expect(снимков(среда)).toBe(1);
  });
});
