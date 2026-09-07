// Имя каждого теста повторяет формулировку правила.
// Наблюдение владельца на настоящем временном git: RU опубликована и не изменена, EN опубликована
// и локально изменена, ES — заглушка. Признаки каждой версии считаются по одному своду, реестр и
// шапка берут их оттуда же, а общего слова «Опубликована» о статье больше нет.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

import {listArticles, опубликованные} from '../src/adapters/library.mjs';
import {расхождениеССайтом} from '../src/adapters/gitFile.mjs';
import {articleFacts} from '../src/adapters/articleFacts.mjs';
import {признакиЛокали} from '../src/core/localeSigns.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
const ЖДАТЬ_GIT = 30_000;

const ПУТИ = {
  ru: 'i18n/ru/docusaurus-plugin-content-blog/proba/index.mdx',
  en: 'blog/proba/index.mdx',
  es: 'i18n/es/docusaurus-plugin-content-blog/proba/index.mdx',
};

const статья = (шапка, тело) => `---\ntitle: "Проба"\ndescription: "Про пробу."\n${шапка}---\n\n${тело}\n`;
const ЗАГЛУШКА_ES = НАСТРОЙКИ['заглушкиПеревода']['es']['тело'];

const папки = [];

afterEach(() => {
  while (папки.length > 0) fs.rmSync(папки.pop(), {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
});

function положить(repo, rel, текст) {
  fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
  fs.writeFileSync(path.join(repo, rel), текст, 'utf8');
}

/**
 * Репозиторий с тремя языковыми версиями одной статьи. Все три уехали в `origin/main`, после чего
 * английская изменена на диске: ровно то сочетание, которое владелец увидел одним словом.
 */
async function среда({шапкаRu = '', шапкаEs = ''} = {}) {
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
async function свод(repo, git) {
  const ветка = await опубликованные(git, 'origin/main');
  const расхождение = await расхождениеССайтом(git, 'origin/main', НАСТРОЙКИ['контент'].map((root) => root['папка']));

  return listArticles(
    repo, НАСТРОЙКИ, new Map(), ветка.файлы,
    расхождение === null ? null : new Set(расхождение),
    ветка.известна,
  );
}

/** Признаки каждой локали так, как их берёт реестр: из свода, правилом ядра. */
const признакиРеестра = (статьи) => {
  const своя = статьи.find((item) => Object.values(item.versions).some((v) => v.path === ПУТИ.ru));
  return Object.fromEntries(
    Object.keys(НАСТРОЙКИ['локали']).map((код) => [код, признакиЛокали(своя.versions[код] ?? null)]),
  );
};

describe('состояние каждой локали видно у RU, EN и ES', () => {
  it('RU опубликована и не изменена, EN изменена, ES заглушка — у каждой версии свои признаки', async () => {
    const {repo, git} = await среда();
    fs.appendFileSync(path.join(repo, ПУТИ.en), 'Local edit.\n', 'utf8');

    const признаки = признакиРеестра(await свод(repo, git));

    // RU: обычная опубликованная версия — ни точки, ни цвета, ни значка.
    expect(признаки.ru).toEqual({
      есть: true, черновик: false, неПубликовалась: false, изменена: false, заглушка: false, поСсылке: false,
    });
    // EN: красная точка. Именно её прятало общее слово «Опубликована».
    expect(признаки.en.изменена).toBe(true);
    expect(признаки.en.заглушка).toBe(false);
    // ES: признак заглушки при ней, и правка соседа его не задела.
    expect(признаки.es.заглушка).toBe(true);
    expect(признаки.es.изменена).toBe(false);
  }, ЖДАТЬ_GIT);

  it('признаки не зависят от порядка RU, EN и ES: каждая версия отвечает за себя', async () => {
    const {repo, git} = await среда();
    fs.appendFileSync(path.join(repo, ПУТИ.en), 'Local edit.\n', 'utf8');

    const прямо = признакиРеестра(await свод(repo, git));
    // Тот же свод, собранный из тех же версий в обратном порядке языков.
    const обратно = признакиРеестра((await свод(repo, git)).map((item) => ({
      ...item,
      versions: Object.fromEntries(Object.entries(item.versions).reverse()),
    })));

    expect(обратно).toEqual(прямо);
  }, ЖДАТЬ_GIT);

  it('реестр и шапка показывают одни признаки из общего источника', async () => {
    const {repo, git} = await среда();
    fs.appendFileSync(path.join(repo, ПУТИ.en), 'Local edit.\n', 'utf8');

    const статьи = await свод(repo, git);

    // Шапка спрашивает про открытую RU, а получает признаки всех трёх версий — те же самые.
    expect(articleFacts(статьи, ПУТИ.ru, НАСТРОЙКИ).признакиЛокалей).toEqual(признакиРеестра(статьи));
  }, ЖДАТЬ_GIT);

  it('draft: true окрашивает только свою локаль, а не соседние версии', async () => {
    const {repo, git} = await среда({шапкаRu: 'draft: true\n'});
    const признаки = признакиРеестра(await свод(repo, git));

    expect(признаки.ru.черновик).toBe(true);
    expect(признаки.en.черновик).toBe(false);
    expect(признаки.es.черновик).toBe(false);
  }, ЖДАТЬ_GIT);

  it('draft: false не окрашивает версию так же, как отсутствие поля', async () => {
    const {repo, git} = await среда({шапкаRu: 'draft: false\n'});
    const признаки = признакиРеестра(await свод(repo, git));

    expect(признаки.ru.черновик).toBe(false);
    expect(признаки.en.черновик).toBe(false);
  }, ЖДАТЬ_GIT);

  it('unlisted: true даёт значок ссылки только своей локали и не стирает соседние признаки', async () => {
    const {repo, git} = await среда({шапкаEs: 'unlisted: true\n'});
    fs.appendFileSync(path.join(repo, ПУТИ.en), 'Local edit.\n', 'utf8');

    const признаки = признакиРеестра(await свод(repo, git));

    expect(признаки.es.поСсылке).toBe(true);
    expect(признаки.ru.поСсылке).toBe(false);
    expect(признаки.en.поСсылке).toBe(false);
    // Соседи при этом остались при своём: заглушка и красная точка никуда не делись.
    expect(признаки.es.заглушка).toBe(true);
    expect(признаки.en.изменена).toBe(true);
  }, ЖДАТЬ_GIT);

  it('версии, которой нет в опубликованной ветке, показывается «ещё не публиковалась»', async () => {
    const {repo, git} = await среда();
    const НОВАЯ = 'blog/novaya/index.mdx';
    положить(repo, НОВАЯ, статья('', 'Fresh.'));

    const статьи = await свод(repo, git);
    const новая = статьи.find((item) => Object.values(item.versions).some((v) => v.path === НОВАЯ));

    expect(признакиЛокали(новая.versions.en).неПубликовалась).toBe(true);
    // А у соседней статьи, которая на сайте, синего цвета не появляется.
    expect(признакиРеестра(статьи).en.неПубликовалась).toBe(false);
  }, ЖДАТЬ_GIT);

  it('git недоступен — «ещё не публиковалась» не выдумывается ни одной версии', async () => {
    const {repo, git} = await среда();
    fs.rmSync(path.join(repo, '.git'), {recursive: true, force: true, maxRetries: 10, retryDelay: 100});

    const признаки = признакиРеестра(await свод(repo, git));

    for (const код of Object.keys(НАСТРОЙКИ['локали'])) {
      expect(признаки[код].неПубликовалась).toBe(false);
      expect(признаки[код].изменена).toBe(false);
    }
    // Заглушка от git не зависит и остаётся видна.
    expect(признаки.es.заглушка).toBe(true);
  }, ЖДАТЬ_GIT);
});
