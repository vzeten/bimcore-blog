// Общая обвязка проверок публикации: временный репозиторий с НАСТОЯЩИМ удалённым.
//
// Подставной git здесь не годится ни в одной проверке. Публикация целиком построена на вопросах к
// хранилищу: что лежит в закреплённой ветке, какое дерево даёт индекс, сдвинулась ли ветка. Подмени
// эти ответы — и проверка подтверждала бы сама себя.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

import {поставитьЗависимости} from './depsFixture.mjs';

import {срезОднойВерсии} from '../src/adapters/prepareStamp.mjs';
import {закреплённаяОснова} from '../src/adapters/publishBase.mjs';
import {готовыйПлан} from '../src/adapters/publishFacts.mjs';
import {отпечатокПлана} from '../src/adapters/planBytes.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Настройки берутся настоящие: заглушки, локали и корни контента должны быть теми же, что у людей. */
export const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

/** Те же настройки, но удалённый назван `origin`: в песочнице другого не бывает. */
export const настройкиСервера = (правки = {}) => ({
  ...НАСТРОЙКИ,
  отправка: {...НАСТРОЙКИ['отправка'], удалённый: 'origin'},
  ...правки,
});

export const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
export const EN = 'docs/lessons/proba/index.mdx';
export const ES = 'i18n/es/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';

export const СТАТЬЯ = '---\ntitle: "Проба"\nslug: /lessons/proba\ndescription: "Про пробу."\n---\n\nТекст статьи.\n';

const песочницы = [];

/** Убрать всё созданное проверками. Зовётся из `afterEach` каждого набора. */
export function убратьПесочницы() {
  while (песочницы.length > 0) {
    try {
      fs.rmSync(песочницы.pop(), {recursive: true, force: true});
    } catch (ошибка) {
      console.error(ошибка);
    }
  }
}

/**
 * Временный репозиторий с голой копией рядом и отправленной веткой `main`.
 *
 * `файлы` — что лежит на диске. `вКоммите` — что из них попадает в опубликованную ветку; остальное
 * остаётся незакоммиченной работой человека. По умолчанию в ветку уезжает всё: так проверяется
 * обычная статья, давно живущая на сайте.
 */
export async function среда(файлы = {[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ}, {вКоммите = null, ветка = null} = {}) {
  const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-pub-'));
  песочницы.push(корень);

  const сервер = path.join(корень, 'origin.git');
  const repo = path.join(корень, 'работа');
  const editorDir = path.join(корень, 'редактор');
  fs.mkdirSync(repo, {recursive: true});
  fs.mkdirSync(editorDir, {recursive: true});

  await simpleGit(корень).raw(['init', '--bare', '--initial-branch=main', сервер]);

  const git = simpleGit(repo);
  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Проверка');
  await git.addConfig('user.email', 'proverka@example.com');
  await git.addConfig('commit.gpgsign', 'false');
  await git.raw(['remote', 'add', 'origin', сервер]);

  const положить = (rel, содержимое) => {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), содержимое, 'utf8');
  };

  const вВетку = вКоммите ?? Object.keys(файлы);
  for (const rel of вВетку) положить(rel, файлы[rel] ?? СТАТЬЯ);

  fs.writeFileSync(path.join(repo, 'README.md'), 'начало\n', 'utf8');
  await git.raw(['add', '--', 'README.md', ...вВетку]);
  await git.raw(['commit', '-m', 'начало']);
  await git.raw(['push', 'origin', 'main']);

  // Файлы, которых в ветке быть не должно, кладём уже после коммита: так выглядит незакоммиченная
  // работа человека.
  for (const [rel, содержимое] of Object.entries(файлы)) if (!вВетку.includes(rel)) положить(rel, содержимое);

  поставитьЗависимости(repo);

  const основа = (await git.raw(['rev-parse', 'HEAD'])).trim();

  // Рабочая ветка человека: публикация из неё — обычный случай, а не особый. Заводится ПОСЛЕ
  // отправки `main`, чтобы сайт про неё не знал ничего.
  if (ветка !== null) await git.raw(['checkout', '-b', ветка]);

  return {корень, repo, editorDir, git, сервер, основа, положить};
}

/** SHA ветки на сервере сайта: что там лежит на самом деле. */
export const наСервере = async (место) => (await simpleGit(место.сервер).raw(['rev-parse', 'refs/heads/main'])).trim();

/**
 * Снимок репозитория человека: ветка, `HEAD`, индекс, рабочее дерево и местная `main`. Публикация
 * обязана оставить всё это ровно таким же — и при успехе, и при отказе.
 */
export async function снимокРепозитория({git}) {
  return {
    ветка: (await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim(),
    голова: (await git.raw(['rev-parse', 'HEAD'])).trim(),
    индекс: (await git.raw(['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only'])).trim(),
    дерево: (await git.raw(['-c', 'core.quotepath=false', 'status', '--porcelain', '--untracked-files=all'])).trim(),
    main: (await git.raw(['rev-parse', 'refs/heads/main'])).trim(),
  };
}

/** Что лежит в названном коммите: пути, отсортированные для сравнения. */
export const файлыКоммита = async ({git}, sha) => (await git.raw(['-c', 'core.quotepath=false', 'show', '--name-only', '--format=', sha]))
  .split(/\r?\n/).map((строка) => строка.trim()).filter(Boolean).sort();

/** Подставной сборщик: отвечает так же, как `execFile`, но мгновенно. */
export const сборщик = ({ошибка = null, stdout = 'собрано', stderr = ''} = {}) => (файл, аргументы, опции, готово) => {
  setTimeout(() => готово(ошибка, stdout, stderr), 0);
  return {on: () => {}};
};

/**
 * Один запрос к ручке — так, как его делает окно.
 *
 * **Отпечаток снимка обвязка подставляет сама**, если его в теле нет: ровно это делает окно, беря
 * его из ответа предыдущего шага. Считается он настоящими правилами программы, а не выдумывается
 * здесь. Проверке, которая хочет доказать отказ, достаточно положить своё значение в тело —
 * подстановка его не трогает.
 */
export async function запрос(ручка, место, pathname, тело, ещё = {}) {
  const {repo, editorDir, git} = место;
  const ответы = [];
  тело = await соСнимком(место, pathname, тело);
  const взято = await ручка({
    req: {method: 'POST'},
    res: {},
    url: {pathname},
    repo,
    editorDir,
    settings: настройкиСервера(),
    git,
    тело: async () => тело,
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, status, payload) => ответы.push({status, payload}),
    ...ещё,
  });

  return {взято, status: ответы[0]?.status, payload: ответы[0]?.payload ?? {}};
}

/** Тело запроса со снимком: подготовкой для состава, планом — для сборки и записи. */
async function соСнимком({repo, git}, pathname, тело) {
  const settings = настройкиСервера();
  if (typeof тело?.path !== 'string') return тело;

  // Снимок проверок обвязка кладёт во ВСЕ три ручки, как это делает окно: он сопровождает весь
  // маршрут, а не один его шаг.
  if (тело['отпечатокПодготовки'] === undefined
    && (pathname === '/api/release' || pathname === '/api/release/build' || pathname === '/api/publish/commit')) {
    тело = {...тело, отпечатокПодготовки: срезОднойВерсии(repo, тело.path, settings)?.отпечаток ?? ''};
  }

  if ((pathname === '/api/release/build' || pathname === '/api/publish/commit') && тело['отпечаток'] === undefined) {
    return {...тело, отпечаток: await отпечатокПоказанного({repo, git, settings, rel: тело.path})};
  }

  return тело;
}

/**
 * Отпечаток плана, который окно получило бы от `/api/release`. Считается тем же кодом сервера.
 *
 * План может не построиться вовсе — не та ветка, неотправленный коммит, невосстановленный путь.
 * Тогда обвязка кладёт ЗАМЕТНУЮ непустую строку, а не пустую: в жизни окно до записи в таких
 * положениях просто не доходит, его останавливает `/api/release`. Пустая строка означала бы
 * «запрос мимо окна» и заслонила бы собой ровно тот отказ, ради которого проверка и написана.
 * Сам заслон «снимка нет» проверяется отдельно, своими проверками с пустым отпечатком.
 */
async function отпечатокПоказанного({repo, git, settings, rel}) {
  const основа = await закреплённаяОснова({git, settings});
  if (основа.ошибка) return СНИМКА_НЕТ;

  const план = await готовыйПлан({git, repo, settings, rel, основа: основа.основа});
  if (план.ошибка) return СНИМКА_НЕТ;

  return отпечатокПлана({основа: основа.основа, родитель: основа.основа, записи: план.записи});
}

/** Плана нет — окно бы сюда не дошло. Строка непустая: она проверяет отказ, а не заслон снимка. */
const СНИМКА_НЕТ = 'плана-нет';
