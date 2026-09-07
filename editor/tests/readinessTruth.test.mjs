// Имя каждого теста повторяет формулировку правила.
// Готовность по SPEC 4.5.2 на настоящем временном git: «Опубликована» доказывается совпадением
// содержимого версии с опубликованной веткой и никогда не пишется в файл состояния.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

import {listArticles, опубликованные, readinessOf} from '../src/adapters/library.mjs';
import {расхождениеССайтом} from '../src/adapters/gitFile.mjs';
import {articleFacts} from '../src/adapters/articleFacts.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
const ЖДАТЬ_GIT = 30_000;

const RU = 'i18n/ru/docusaurus-plugin-content-blog/proba/index.mdx';
const СОСТОЯНИЕ = 'i18n/ru/docusaurus-plugin-content-blog/proba/_state.json';
const СТАТЬЯ = '---\ntitle: "Проба"\ndescription: "Про пробу."\n---\n\nТекст статьи.\n';
const ЧЕРНОВИК = '{\n  "готовность": "Черновик",\n  "опубликованныйКоммит": null,\n  "нити": []\n}\n';

const папки = [];

afterEach(() => {
  while (папки.length > 0) fs.rmSync(папки.pop(), {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
});

/** Репозиторий, где статья и её состояние «Черновик» уже лежат в `origin/main` и совпадают с диском. */
async function среда() {
  const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-readiness-'));
  папки.push(корень);
  const repo = path.join(корень, 'работа');
  const сервер = path.join(корень, 'сайт.git');

  await simpleGit(корень).raw(['init', '--bare', '--initial-branch=main', сервер]);
  fs.mkdirSync(path.join(repo, path.dirname(RU)), {recursive: true});
  fs.writeFileSync(path.join(repo, RU), СТАТЬЯ, 'utf8');
  fs.writeFileSync(path.join(repo, СОСТОЯНИЕ), ЧЕРНОВИК, 'utf8');

  const git = simpleGit(repo);
  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Проверка');
  await git.addConfig('user.email', 'proverka@example.com');
  await git.addConfig('commit.gpgsign', 'false');
  await git.raw(['remote', 'add', 'origin', сервер]);
  await git.raw(['add', '--', RU, СОСТОЯНИЕ]);
  await git.raw(['commit', '-m', 'статья уже на сайте']);
  await git.raw(['push', 'origin', 'main']);

  return {repo, git};
}

/** Свод тем же порядком, что и сервер: дерево ветки, расхождение по корням контента, сбор статей. */
async function свод(repo, git) {
  const ветка = await опубликованные(git, 'origin/main');
  const расхождение = await расхождениеССайтом(git, 'origin/main', НАСТРОЙКИ['контент'].map((root) => root['папка']));
  return listArticles(repo, НАСТРОЙКИ, new Map(), ветка.файлы, расхождение === null ? null : new Set(расхождение));
}

const готовностьВРеестре = (статьи) => статьи.flatMap((s) => Object.values(s.versions)).find((v) => v.path === RU)?.готовность;

describe('готовность версии выводится из совпадения с опубликованной веткой (SPEC 4.5.2)', () => {
  it('путь есть в ветке и байты равны — «Опубликована» перебивает «Черновик» из файла состояния', async () => {
    const {repo, git} = await среда();
    const статьи = await свод(repo, git);

    expect(готовностьВРеестре(статьи)).toBe('Опубликована');
    // Файл состояния остаётся прежним: «Опубликована» вычисляется, а не записывается.
    expect(fs.readFileSync(path.join(repo, СОСТОЯНИЕ), 'utf8')).toBe(ЧЕРНОВИК);
  }, ЖДАТЬ_GIT);

  it('реестр и шапка открытой статьи получают одно значение из общего расчёта', async () => {
    const {repo, git} = await среда();
    const статьи = await свод(repo, git);

    expect(articleFacts(статьи, RU, НАСТРОЙКИ).готовность).toBe(готовностьВРеестре(статьи));
    expect(articleFacts(статьи, RU, НАСТРОЙКИ).готовность).toBe('Опубликована');
  }, ЖДАТЬ_GIT);

  it('байты отличаются от ветки — остаётся сохранённая стадия, а не ложная «Опубликована»', async () => {
    const {repo, git} = await среда();
    fs.appendFileSync(path.join(repo, RU), 'Местная правка.\n', 'utf8');

    expect(готовностьВРеестре(await свод(repo, git))).toBe('Черновик');

    fs.writeFileSync(path.join(repo, СОСТОЯНИЕ), ЧЕРНОВИК.replace('Черновик', 'Готова к публикации'), 'utf8');
    expect(готовностьВРеестре(await свод(repo, git))).toBe('Готова к публикации');
  }, ЖДАТЬ_GIT);

  it('пути нет в ветке — «Опубликована» не появляется', async () => {
    const {repo, git} = await среда();
    const НОВАЯ = 'i18n/ru/docusaurus-plugin-content-blog/novaya/index.mdx';
    fs.mkdirSync(path.join(repo, path.dirname(НОВАЯ)), {recursive: true});
    fs.writeFileSync(path.join(repo, НОВАЯ), СТАТЬЯ, 'utf8');

    const статьи = await свод(repo, git);
    const новая = статьи.flatMap((s) => Object.values(s.versions)).find((v) => v.path === НОВАЯ);

    expect(новая.готовность).toBe('Черновик');
    expect(новая.опубликован).toBe(false);
    // Соседняя опубликованная статья при этом остаётся опубликованной.
    expect(готовностьВРеестре(статьи)).toBe('Опубликована');
  }, ЖДАТЬ_GIT);

  it('git недоступен — «Опубликована» не появляется и данные не меняются', async () => {
    const {repo, git} = await среда();
    fs.rmSync(path.join(repo, '.git'), {recursive: true, force: true, maxRetries: 10, retryDelay: 100});

    const ветка = await опубликованные(git, 'origin/main');
    const расхождение = await расхождениеССайтом(git, 'origin/main', ['i18n']);
    expect(ветка.известна).toBe(false);
    expect(расхождение).toBeNull();

    expect(готовностьВРеестре(await свод(repo, git))).toBe('Черновик');
    expect(fs.readFileSync(path.join(repo, СОСТОЯНИЕ), 'utf8')).toBe(ЧЕРНОВИК);
  }, ЖДАТЬ_GIT);

  it('ветка прочитана, а сравнение не удалось — совпадение не доказано и «Опубликована» не появляется', async () => {
    const {repo} = await среда();
    const вВетке = new Set([RU, СОСТОЯНИЕ]);

    expect(readinessOf(repo, RU, НАСТРОЙКИ, вВетке, null)).toBe('Черновик');
    expect(readinessOf(repo, RU, НАСТРОЙКИ, вВетке, new Set())).toBe('Опубликована');
    expect(readinessOf(repo, RU, НАСТРОЙКИ, вВетке, new Set([RU]))).toBe('Черновик');
  }, ЖДАТЬ_GIT);
});
