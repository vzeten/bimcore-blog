// Имя каждого теста повторяет формулировку правила.
// Ручка коммита проверяется на НАСТОЯЩЕМ git во временном репозитории: это первое место программы,
// которое меняет репозиторий, и подставной git тут ничего не доказал бы.
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {запомнитьСборку} from '../src/adapters/buildMemory.mjs';
import {отпечатокСостава, версииСтатьи} from '../src/adapters/releaseFacts.mjs';
import {составВыпуска} from '../src/core/release.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
const EN = 'docs/lessons/proba/index.mdx';
const СТАТЬЯ = '---\ntitle: "Проба"\nslug: /lessons/proba\n---\n\nТекст статьи.\n';

const песочницы = [];

/** Временный репозиторий с одной статьёй в двух версиях и одним начальным коммитом. */
async function среда({вПервомКоммите = true} = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-publish-'));
  песочницы.push(repo);
  const git = simpleGit(repo);

  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Проверка');
  await git.addConfig('user.email', 'proverka@example.com');
  await git.addConfig('commit.gpgsign', 'false');

  fs.mkdirSync(path.join(repo, 'docs'), {recursive: true});
  fs.writeFileSync(path.join(repo, 'README.md'), 'начало\n', 'utf8');
  await git.raw(['add', '--', 'README.md']);
  await git.raw(['commit', '-m', 'начало']);

  for (const rel of [RU, EN]) {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), СТАТЬЯ, 'utf8');
  }

  if (вПервомКоммите === false) return {repo, git};

  return {repo, git};
}

/** Запомнить зелёную сборку для этой статьи — как это делает ручка сборки. */
function сборкаБыла(repo, rel) {
  const состав = составВыпуска({версии: версииСтатьи(repo, rel, НАСТРОЙКИ)});
  запомнитьСборку({путь: rel, отпечаток: отпечатокСостава(repo, состав.файлы)});
}

afterEach(() => {
  запомнитьСборку(null);
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

beforeEach(() => запомнитьСборку(null));

/** Один запрос к ручке. */
async function запрос({repo, git}, тело) {
  const ответы = [];
  const взято = await publishRoute({
    req: {method: 'POST'},
    res: {},
    url: {pathname: '/api/publish/commit'},
    repo,
    settings: НАСТРОЙКИ,
    git,
    тело: async () => тело,
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, status, payload) => ответы.push({status, payload}),
  });

  return {взято, ...(ответы[0] ?? {})};
}

// `core.quotepath=false` обязателен: без него git экранирует кириллицу в именах файлов, и проверка
// сравнивала бы не пути, а их восьмеричную запись.
const индекс = async (git) => (await git.raw(['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only']))
  .split(/\r?\n/).map((строка) => строка.trim()).filter(Boolean);

describe('ручка коммита статьи', () => {
  it('после зелёной сборки статья фиксируется ровно своими файлами', async () => {
    const с = await среда();
    сборкаБыла(с.repo, RU);

    const {status, payload} = await запрос(с, {path: RU, подтверждено: true});

    expect(status).toBe(200);
    expect(payload.коммит).toMatch(/^[0-9a-f]{7,}$/);
    expect(payload.пути.sort()).toEqual([EN, RU]);

    const вКоммите = (await с.git.raw(['show', '--name-only', '--format=', 'HEAD']))
      .split(/\r?\n/).map((строка) => строка.trim()).filter(Boolean).sort();
    expect(вКоммите).toEqual([EN, RU]);
    expect(await индекс(с.git)).toEqual([]);
  });

  it('без подтверждения человека коммита не бывает', async () => {
    const с = await среда();
    сборкаБыла(с.repo, RU);
    const было = await с.git.revparse(['HEAD']);

    const {status} = await запрос(с, {path: RU});

    expect(status).toBe(400);
    expect(await с.git.revparse(['HEAD'])).toBe(было);
  });

  it('без зелёной сборки коммита не бывает', async () => {
    const с = await среда();
    const было = await с.git.revparse(['HEAD']);

    const {status, payload} = await запрос(с, {path: RU, подтверждено: true});

    expect(status).toBe(409);
    expect(payload.код).toBe('нетЗелёнойСборки');
    expect(await с.git.revparse(['HEAD'])).toBe(было);
  });

  it('статья изменилась после сборки — коммита нет: сборка отвечала за прежний текст', async () => {
    const с = await среда();
    сборкаБыла(с.repo, RU);
    fs.writeFileSync(path.join(с.repo, RU), `${СТАТЬЯ}\nдописано после сборки\n`, 'utf8');

    const {status, payload} = await запрос(с, {path: RU, подтверждено: true});

    expect(status).toBe(409);
    expect(payload.код).toBe('статьяИзменилась');
    expect(await индекс(с.git)).toEqual([]);
  });

  it('репозиторий не на рабочей ветке — коммита нет', async () => {
    const с = await среда();
    await с.git.raw(['checkout', '-b', 'proba']);
    сборкаБыла(с.repo, RU);

    const {status, payload} = await запрос(с, {path: RU, подтверждено: true});

    expect(status).toBe(409);
    expect(payload.код).toBe('неТаВетка');
  });

  it('в индексе лежит чужая работа — отказ до всякой операции, чужое не тронуто', async () => {
    const с = await среда();
    fs.writeFileSync(path.join(с.repo, 'чужое.md'), 'чужая работа\n', 'utf8');
    await с.git.raw(['add', '--', 'чужое.md']);
    сборкаБыла(с.repo, RU);

    const {status, payload} = await запрос(с, {path: RU, подтверждено: true});

    expect(status).toBe(409);
    expect(payload.код).toBe('индексНеПуст');
    // Чужое как лежало в индексе, так и лежит: программа его не снимала.
    expect(await индекс(с.git)).toEqual(['чужое.md']);
  });

  it('в коммит не попадает ни один файл вне состава статьи', async () => {
    const с = await среда();
    fs.writeFileSync(path.join(с.repo, 'постороннее.md'), 'не наше\n', 'utf8');
    fs.writeFileSync(path.join(с.repo, 'docs/lessons/сосед.mdx'), СТАТЬЯ, 'utf8');
    сборкаБыла(с.repo, RU);

    const {status, payload} = await запрос(с, {path: RU, подтверждено: true});

    expect(status).toBe(200);
    expect(payload.пути.sort()).toEqual([EN, RU]);

    // Посторонние файлы остались неотслеженными: их никто не добавлял и не коммитил.
    const состояние = await с.git.raw(['-c', 'core.quotepath=false', 'status', '--porcelain']);
    expect(состояние).toContain('постороннее.md');
    expect(состояние).toContain('docs/lessons/сосед.mdx');
  });

  it('состав не доказан — коммита нет', async () => {
    const с = await среда();
    fs.writeFileSync(path.join(с.repo, path.dirname(RU), 'сосед.mdx'), СТАТЬЯ, 'utf8');
    сборкаБыла(с.repo, RU);

    const {status, payload} = await запрос(с, {path: RU, подтверждено: true});

    expect(status).toBe(409);
    expect(payload.код).toBe('составНеДоказан');
  });

  it('фиксировать нечего — честный отказ, а не пустой коммит', async () => {
    const с = await среда();
    // Статья уже в репозитории и с тех пор не менялась.
    await с.git.raw(['add', '--', RU]);
    await с.git.raw(['add', '--', EN]);
    await с.git.raw(['commit', '-m', 'статья уже тут']);
    const было = await с.git.revparse(['HEAD']);
    сборкаБыла(с.repo, RU);

    const {status, payload} = await запрос(с, {path: RU, подтверждено: true});

    expect(status).toBe(409);
    expect(payload.код).toBe('нечегоФиксировать');
    expect(await с.git.revparse(['HEAD'])).toBe(было);
    expect(await индекс(с.git)).toEqual([]);
  });

  it('картинки статьи, включая вложенную папку, уезжают вместе с ней', async () => {
    const с = await среда();
    fs.mkdirSync(path.join(с.repo, path.dirname(RU), 'img'), {recursive: true});
    fs.writeFileSync(path.join(с.repo, path.dirname(RU), 'img', 'один.jpg'), 'картинка', 'utf8');
    fs.writeFileSync(path.join(с.repo, path.dirname(RU), 'cover.png'), 'обложка', 'utf8');
    сборкаБыла(с.repo, RU);

    const {payload} = await запрос(с, {path: RU, подтверждено: true});

    expect(payload.пути).toContain(`${path.posix.dirname(RU)}/img/один.jpg`);
    expect(payload.пути).toContain(`${path.posix.dirname(RU)}/cover.png`);
  });

  it('рабочие файлы при отказе не трогаются', async () => {
    const с = await среда();
    fs.writeFileSync(path.join(с.repo, RU), `${СТАТЬЯ}\nнесохранённая правка\n`, 'utf8');
    const было = fs.readFileSync(path.join(с.repo, RU), 'utf8');
    сборкаБыла(с.repo, RU);
    // Отпечаток снят уже после правки, поэтому испортим ветку — отказ придёт по другой причине.
    await с.git.raw(['checkout', '-b', 'другая']);

    await запрос(с, {path: RU, подтверждено: true});

    expect(fs.readFileSync(path.join(с.repo, RU), 'utf8')).toBe(было);
  });

  it('после коммита зелёная сборка израсходована: второй коммит требует новой', async () => {
    const с = await среда();
    сборкаБыла(с.repo, RU);
    await запрос(с, {path: RU, подтверждено: true});

    fs.writeFileSync(path.join(с.repo, RU), `${СТАТЬЯ}\nещё правка\n`, 'utf8');
    const {status, payload} = await запрос(с, {path: RU, подтверждено: true});

    expect(status).toBe(409);
    expect(payload.код).toBe('нетЗелёнойСборки');
  });
});
