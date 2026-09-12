// Имя каждого теста повторяет формулировку правила.
// Владелец видел красную точку у локали, которая на сайте лежит ровно такой же. Папка материалов
// стояла на своей ветке, и её служебное состояние выдавалось за правку человека: `git diff` называл
// «удалённым» файл, лежащий на диске, а `git status` — «новым» тот, что на сайте давно есть.
// Здесь этот случай закреплён на настоящем временном git вместе с настоящими изменениями.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

import {listArticles, опубликованные} from '../src/adapters/library.mjs';
import {расхождениеССайтом} from '../src/adapters/gitFile.mjs';
import {признакиЛокали} from '../src/core/localeSigns.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
const КОРНИ = НАСТРОЙКИ['контент'].map((root) => root['папка']);
const ЖДАТЬ_GIT = 30_000;

const ПУТИ = {
  ru: 'i18n/ru/docusaurus-plugin-content-blog/proba/index.mdx',
  en: 'blog/proba/index.mdx',
  es: 'i18n/es/docusaurus-plugin-content-blog/proba/index.mdx',
};
const МЕДИА = {
  ru: 'i18n/ru/docusaurus-plugin-content-blog/proba/img/pic.png',
  en: 'blog/proba/img/pic.png',
};

const статья = (тело) => `---\ntitle: "Проба"\ndescription: "Про пробу."\n---\n\n${тело}\n`;
// Картинка настоящая по природе: с нулевым байтом внутри. Сравнение обязано работать не только с
// текстом, иначе медиа локали проверялось бы понарошку.
const КАРТИНКА = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x00, 0xff]);
const ДРУГАЯ_КАРТИНКА = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x09, 0x09, 0x00, 0xff]);

const папки = [];

afterEach(() => {
  while (папки.length > 0) fs.rmSync(папки.pop(), {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
});

function положить(repo, rel, содержимое) {
  fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
  fs.writeFileSync(path.join(repo, rel), содержимое);
}

/**
 * Три языковые версии одной статьи с картинками уехали в `origin/main`, после чего папка материалов
 * переведена на свою ветку, где эти файлы больше не под наблюдением git. На диске они лежат ровно
 * такими же, как на сайте: то самое сочетание, при котором владелец увидел ложную точку.
 */
async function среда({другаяВетка = true} = {}) {
  const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-diff-'));
  папки.push(корень);
  const repo = path.join(корень, 'работа');
  const сервер = path.join(корень, 'сайт.git');

  await simpleGit(корень).raw(['init', '--bare', '--initial-branch=main', сервер]);
  положить(repo, ПУТИ.ru, статья('Русский текст.'));
  положить(repo, ПУТИ.en, статья('English text.'));
  положить(repo, ПУТИ.es, статья('Texto español.'));
  положить(repo, МЕДИА.ru, КАРТИНКА);
  положить(repo, МЕДИА.en, КАРТИНКА);

  const git = simpleGit(repo);
  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Проверка');
  await git.addConfig('user.email', 'proverka@example.com');
  await git.addConfig('commit.gpgsign', 'false');
  await git.raw(['remote', 'add', 'origin', сервер]);
  await git.raw(['add', '--', ...Object.values(ПУТИ), ...Object.values(МЕДИА)]);
  await git.raw(['commit', '-m', 'все версии на сайте']);
  await git.raw(['push', 'origin', 'main']);

  if (другаяВетка) {
    await git.raw(['checkout', '-b', 'своя-ветка']);
    await git.raw(['rm', '--cached', '--', ...Object.values(ПУТИ), ...Object.values(МЕДИА)]);
    await git.raw(['commit', '-m', 'ветка без материалов сайта']);
  }

  return {repo, git};
}

/** Тот же вопрос, который сервер задаёт при сборке свода. */
const расхождение = (git) => расхождениеССайтом(git, 'origin/main', КОРНИ);

/** Признаки каждой локали так, как их берёт реестр: из свода, правилом ядра. */
async function признакиРеестра(repo, git) {
  const ветка = await опубликованные(git, 'origin/main');
  const список = await расхождение(git);
  const статьи = listArticles(
    repo, НАСТРОЙКИ, new Map(), ветка.файлы,
    список === null ? null : new Set(список), ветка.известна, new Set(), new Map(),
  );
  const своя = статьи.find((item) => Object.values(item.versions).some((v) => v.path === ПУТИ.ru));

  return Object.fromEntries(
    Object.keys(НАСТРОЙКИ['локали']).map((код) => [код, признакиЛокали(своя?.versions[код] ?? null)]),
  );
}

describe('расхождение локали с сайтом считается по содержимому, а не по состоянию git', () => {
  it('содержимое локали равно сайту, а папка материалов на другой ветке — расхождения нет', async () => {
    const {repo, git} = await среда();

    // Именно тот случай, который владелец видел на живой папке: файлы на диске байт в байт как на
    // сайте, но своя ветка их не отслеживает.
    expect(await расхождение(git)).toEqual([]);

    const признаки = await признакиРеестра(repo, git);
    for (const код of Object.keys(НАСТРОЙКИ['локали'])) expect(признаки[код].изменена).toBe(false);
  }, ЖДАТЬ_GIT);

  it('содержимое локали равно сайту на своей же ветке — расхождения нет', async () => {
    const {repo, git} = await среда({другаяВетка: false});

    expect(await расхождение(git)).toEqual([]);
    expect((await признакиРеестра(repo, git)).ru.изменена).toBe(false);
  }, ЖДАТЬ_GIT);

  it('изменённый текст локали даёт расхождение только у неё', async () => {
    const {repo, git} = await среда();
    fs.appendFileSync(path.join(repo, ПУТИ.en), 'Local edit.\n', 'utf8');

    expect(await расхождение(git)).toEqual([ПУТИ.en]);

    const признаки = await признакиРеестра(repo, git);
    expect(признаки.en.изменена).toBe(true);
    expect(признаки.ru.изменена).toBe(false);
    expect(признаки.es.изменена).toBe(false);
  }, ЖДАТЬ_GIT);

  it('изменённое медиа локали даёт расхождение только у неё', async () => {
    const {repo, git} = await среда();
    положить(repo, МЕДИА.ru, ДРУГАЯ_КАРТИНКА);

    const список = await расхождение(git);

    expect(список).toEqual([МЕДИА.ru]);
    expect(список).not.toContain(МЕДИА.en);
  }, ЖДАТЬ_GIT);

  it('заменённая картинка версии зажигает точку своей локали, не тронув текст статьи', async () => {
    // Замечание контролёра на первом круге: расхождение медиа находилось, но до признака локали не
    // доходило — красная точка молчала о неуехавшей замене картинки.
    const {repo, git} = await среда();
    const текстДо = fs.readFileSync(path.join(repo, ПУТИ.ru), 'utf8');
    положить(repo, МЕДИА.ru, ДРУГАЯ_КАРТИНКА);

    const признаки = await признакиРеестра(repo, git);

    expect(признаки.ru.изменена).toBe(true);
    expect(признаки.en.изменена).toBe(false);
    expect(признаки.es.изменена).toBe(false);
    // Файл статьи при этом не тронут: точку зажгла именно картинка.
    expect(fs.readFileSync(path.join(repo, ПУТИ.ru), 'utf8')).toBe(текстДо);
  }, ЖДАТЬ_GIT);

  it('служебный файл рядом с версией точку не зажигает: сайт его не собирает', async () => {
    const {repo, git} = await среда();
    положить(repo, 'i18n/ru/docusaurus-plugin-content-blog/proba/_state.json', '{"готовность": "Черновик"}\n');

    const признаки = await признакиРеестра(repo, git);

    expect(признаки.ru.изменена).toBe(false);
    expect(признаки.en.изменена).toBe(false);
  }, ЖДАТЬ_GIT);

  it('вторая статья в той же папке отменяет счёт её картинок: чужое версии не приписывается', async () => {
    const {repo, git} = await среда();
    // Соседняя статья в папке версии: чьи там картинки, по путям больше не видно (`release.mjs`).
    положить(repo, 'i18n/ru/docusaurus-plugin-content-blog/proba/sosed/index.mdx', статья('Сосед.'));
    положить(repo, МЕДИА.ru, ДРУГАЯ_КАРТИНКА);

    const признаки = await признакиРеестра(repo, git);

    expect(признаки.ru.изменена).toBe(false);
  }, ЖДАТЬ_GIT);

  it('удалённый с диска файл локали даёт расхождение', async () => {
    const {repo, git} = await среда();
    fs.rmSync(path.join(repo, ПУТИ.es));

    const список = await расхождение(git);

    expect(список).toEqual([ПУТИ.es]);
    // Удаление одной версии не трогает соседние: их файлы на месте и равны сайту.
    expect(список).not.toContain(ПУТИ.ru);
  }, ЖДАТЬ_GIT);

  it('новый файл локали, которого на сайте нет, даёт расхождение', async () => {
    const {repo, git} = await среда();
    const НОВАЯ = 'i18n/es/docusaurus-plugin-content-blog/novaya/index.mdx';
    положить(repo, НОВАЯ, статья('Nuevo.'));

    expect(await расхождение(git)).toEqual([НОВАЯ]);
  }, ЖДАТЬ_GIT);

  it('посторонний неотслеживаемый файл не создаёт признака чужой локали', async () => {
    const {repo, git} = await среда();
    const ЧУЖАЯ = 'blog/chuzhaya/index.mdx';
    положить(repo, ЧУЖАЯ, статья('Foreign article.'));
    // Незакоммиченный код рядом с материалами: к статьям он отношения не имеет вовсе.
    положить(repo, 'editor/_vremenniy.mjs', 'export const временное = 1;\n');

    const список = await расхождение(git);

    expect(список).toEqual([ЧУЖАЯ]);
    const признаки = await признакиРеестра(repo, git);
    for (const код of Object.keys(НАСТРОЙКИ['локали'])) expect(признаки[код].изменена).toBe(false);
  }, ЖДАТЬ_GIT);
});
