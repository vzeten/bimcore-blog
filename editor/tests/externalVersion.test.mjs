// Имя каждого теста повторяет формулировку правила.
// Проверка на настоящем диске и настоящем git: внешняя правка обязана оказаться в истории.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {simpleGit} from 'simple-git';

import {фиксироватьВнешнюю} from '../src/adapters/externalVersion.mjs';
import {countSnapshots, latestSnapshot, snapshotText} from '../src/adapters/draftStore.mjs';
import {visibilityRoute} from '../src/adapters/visibilityRoute.mjs';

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

const фиксировать = (среда, обязательно = false) => фиксироватьВнешнюю({
  editorDir: среда.editorDir, repo: среда.repo, settings: НАСТРОЙКИ, git: среда.git, ref: 'HEAD', rel: REL, обязательно,
});

const снимков = (среда) => countSnapshots(среда.editorDir, НАСТРОЙКИ, REL);

function последний(среда) {
  const снимок = latestSnapshot(среда.editorDir, НАСТРОЙКИ, REL);
  return снимок === null ? null : {...снимок, текст: snapshotText(среда.editorDir, НАСТРОЙКИ, REL, снимок['имя'])};
}

describe('версия при изменении файла снаружи', () => {
  it('файл не менялся — новых версий не появляется, сколько бы раз статью ни открывали', async () => {
    const среда = await подготовить();

    for (let раз = 0; раз < 3; раз += 1) expect(await фиксировать(среда)).toBeNull();
    expect(снимков(среда)).toBe(0);
  });

  it('файл изменился снаружи — в истории появляется версия с содержимым файла', async () => {
    const среда = await подготовить();
    const новый = `${СТАТЬЯ}дописал ИИ\n`;
    fs.writeFileSync(среда.файл, новый, 'utf8');

    expect(await фиксировать(среда)).not.toBeNull();
    expect(снимков(среда)).toBe(1);
    expect(последний(среда).текст).toBe(новый);
  });

  it('файл изменён без коммита — автором записывается слово из настроек', async () => {
    const среда = await подготовить();
    fs.writeFileSync(среда.файл, `${СТАТЬЯ}дописал ИИ\n`, 'utf8');

    await фиксировать(среда);

    expect(последний(среда).автор).toBe(НАСТРОЙКИ['реестр']['неизвестныйАвтор']);
  });

  it('автор внешней версии — автор коммита, если правка пришла коммитом', async () => {
    const среда = await подготовить();
    // Сначала программа увидела одно состояние, потом пришёл чужой коммит — так выглядит `git pull`.
    fs.writeFileSync(среда.файл, `${СТАТЬЯ}первая правка\n`, 'utf8');
    await фиксировать(среда);

    fs.writeFileSync(среда.файл, `${СТАТЬЯ}правка коллеги\n`, 'utf8');
    await среда.git.addConfig('user.name', 'Коллега');
    await среда.git.add('.');
    await среда.git.commit('правка коллеги');

    await фиксировать(среда);

    expect(последний(среда).автор).toBe('Коллега');
  });

  it('повторные обращения подряд не плодят одинаковые версии', async () => {
    const среда = await подготовить();
    fs.writeFileSync(среда.файл, `${СТАТЬЯ}дописал ИИ\n`, 'utf8');

    await фиксировать(среда);
    await фиксировать(среда);
    await фиксировать(среда);

    expect(снимков(среда)).toBe(1);
  });

  it('содержимое уже лежит в git, своей истории нет — версия не дублируется', async () => {
    // Так приходит `git pull` по статье, которую в редакторе ещё не открывали: текст целиком
    // хранит сам git с автором и временем, и второе хранилище для него заводить нельзя.
    const среда = await подготовить();
    fs.writeFileSync(среда.файл, `${СТАТЬЯ}правка коллеги\n`, 'utf8');
    await среда.git.addConfig('user.name', 'Коллега');
    await среда.git.add('.');
    await среда.git.commit('правка коллеги');

    expect(await фиксировать(среда)).toBeNull();
    expect(снимков(среда)).toBe(0);
  });

  it('изменилась только шапка — это тоже новая версия', async () => {
    const среда = await подготовить();
    fs.writeFileSync(среда.файл, СТАТЬЯ.replace('title: A', 'title: A\nunlisted: true'), 'utf8');

    await фиксировать(среда);

    expect(снимков(среда)).toBe(1);
  });

  it('изменились только переводы строк — это не новая версия', async () => {
    const среда = await подготовить();
    fs.writeFileSync(среда.файл, СТАТЬЯ.replace(/\n/g, '\r\n'), 'utf8');

    expect(await фиксировать(среда)).toBeNull();
    expect(снимков(среда)).toBe(0);
  });

  it('версия хранит полный текст файла: невидимая метка и шапка на месте', async () => {
    const среда = await подготовить(`﻿${СТАТЬЯ}`);
    const новый = `﻿${СТАТЬЯ}дописал ИИ\n`;
    fs.writeFileSync(среда.файл, новый, 'utf8');

    await фиксировать(среда);

    expect(последний(среда).текст).toBe(новый);
    expect(последний(среда).текст.startsWith('﻿---')).toBe(true);
  });

  it('статьи нет в git и снимков нет — первое обращение сохраняет её содержимое версией', async () => {
    const среда = await подготовить();
    const новая = 'docs/б/index.mdx';
    fs.mkdirSync(path.join(среда.repo, path.dirname(новая)), {recursive: true});
    fs.writeFileSync(path.join(среда.repo, новая), СТАТЬЯ, 'utf8');

    await фиксироватьВнешнюю({
      editorDir: среда.editorDir, repo: среда.repo, settings: НАСТРОЙКИ, git: среда.git, ref: 'HEAD', rel: новая,
    });

    expect(countSnapshots(среда.editorDir, НАСТРОЙКИ, новая)).toBe(1);
  });

  it('фиксация версии не меняет файл статьи', async () => {
    const среда = await подготовить();
    const новый = `${СТАТЬЯ}дописал ИИ\n`;
    fs.writeFileSync(среда.файл, новый, 'utf8');

    await фиксировать(среда);

    expect(fs.readFileSync(среда.файл, 'utf8')).toBe(новый);
  });

  it('статьи нет на диске — фиксировать нечего, программа не падает', async () => {
    const среда = await подготовить();
    fs.rmSync(среда.файл);

    expect(await фиксировать(среда, true)).toBeNull();
  });
});

describe('сбой хранилища версий', () => {
  /** Хранилище, куда нельзя записать: на месте папки снимков лежит файл. */
  async function сломанное() {
    const среда = await подготовить();
    fs.writeFileSync(path.join(среда.editorDir, НАСТРОЙКИ['хранение']['папкаСнимков']), 'не папка', 'utf8');
    fs.writeFileSync(среда.файл, `${СТАТЬЯ}дописал ИИ\n`, 'utf8');
    return среда;
  }

  it('не удалось записать версию перед записью файла — это ошибка, а не тихий пропуск', async () => {
    const среда = await сломанное();

    await expect(фиксировать(среда, true)).rejects.toThrow(НАСТРОЙКИ['ошибкиСервера']['неУдалосьЗаписатьВерсию']);
  });

  it('при открытии статьи сбой хранилища версий не мешает открыть статью', async () => {
    const среда = await сломанное();

    expect(await фиксировать(среда, false)).toBeNull();
  });
});

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
      settings: НАСТРОЙКИ,
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
});
