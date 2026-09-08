// Общая обвязка для проверок признаков локали: настоящий временный git с тремя языковыми
// версиями одной статьи, свод тем же порядком, каким его собирает сервер, и признаки так, как их
// берёт реестр. Вынесено из проверок, чтобы каждый файл держался в пределе размера (SPEC 4.9);
// правил здесь нет — они в `core/localeSigns.mjs`.
import {afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

import {listArticles, опубликованные} from '../src/adapters/library.mjs';
import {расхождениеССайтом, шапкиВВетке} from '../src/adapters/gitFile.mjs';
import {articleFacts} from '../src/adapters/articleFacts.mjs';
import {признакиЛокали, путиЗаОпубликованнойШапкой} from '../src/core/localeSigns.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
export const ЖДАТЬ_GIT = 30_000;

export const ПУТИ = {
  ru: 'i18n/ru/docusaurus-plugin-content-blog/proba/index.mdx',
  en: 'blog/proba/index.mdx',
  es: 'i18n/es/docusaurus-plugin-content-blog/proba/index.mdx',
};

export const статья = (шапка, тело) => `---\ntitle: "Проба"\ndescription: "Про пробу."\n${шапка}---\n\n${тело}\n`;
const ЗАГЛУШКА_ES = НАСТРОЙКИ['заглушкиПеревода']['es']['тело'];

const папки = [];

afterEach(() => {
  while (папки.length > 0) fs.rmSync(папки.pop(), {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
});

export function положить(repo, rel, текст) {
  fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
  fs.writeFileSync(path.join(repo, rel), текст, 'utf8');
}

/**
 * Репозиторий с тремя языковыми версиями одной статьи. Все три уехали в `origin/main`, после чего
 * английская изменена на диске: ровно то сочетание, которое владелец увидел одним словом.
 */
export async function среда({шапкаRu = '', шапкаEs = ''} = {}) {
  const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-signs-'));
  папки.push(корень);
  const repo = path.join(корень, 'работа');
  const сервер = path.join(корень, 'сайт.git');

  await simpleGit(корень).raw(['init', '--bare', '--initial-branch=main', сервер]);
  положить(repo, ПУТИ.ru, статья(шапкаRu, 'Русский текст.'));
  положить(repo, ПУТИ.en, статья('', 'English text.'));
  положить(repo, ПУТИ.es, статья(шапкаEs, ЗАГЛУШКА_ES));

  const git = simpleGit(repo);
  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Проверка');
  await git.addConfig('user.email', 'proverka@example.com');
  await git.addConfig('commit.gpgsign', 'false');
  await git.raw(['remote', 'add', 'origin', сервер]);
  await git.raw(['add', '--', ...Object.values(ПУТИ)]);
  await git.raw(['commit', '-m', 'все три версии на сайте']);
  await git.raw(['push', 'origin', 'main']);

  return {repo, git};
}

/** Свод тем же порядком, каким его собирает сервер. */
export async function свод(repo, git) {
  const ветка = await опубликованные(git, 'origin/main');
  const расхождение = await расхождениеССайтом(git, 'origin/main', НАСТРОЙКИ['контент'].map((root) => root['папка']));
  const расходятся = расхождение === null ? null : new Set(расхождение);
  const вВетке = await шапкиВВетке(git, 'origin/main', путиЗаОпубликованнойШапкой(ветка.файлы, расходятся));

  return listArticles(
    repo, НАСТРОЙКИ, new Map(), ветка.файлы, расходятся, ветка.известна, new Set(), вВетке,
  );
}

/** Признаки каждой локали так, как их берёт реестр: из свода, правилом ядра. */
export const признакиРеестра = (статьи) => {
  const своя = статьи.find((item) => Object.values(item.versions).some((v) => v.path === ПУТИ.ru));
  return Object.fromEntries(
    Object.keys(НАСТРОЙКИ['локали']).map((код) => [код, признакиЛокали(своя.versions[код] ?? null)]),
  );
};
