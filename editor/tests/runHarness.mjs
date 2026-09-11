// Общая обвязка сквозных проверок хода публикации: ход окна разговаривает с НАСТОЯЩИМИ ручками
// сервера, а те — с настоящим git во временном репозитории и настоящим «сервером сайта» рядом.
//
// Подставлены только две вещи, к делу не относящиеся: полная сборка сайта (иначе проверка шла бы
// минуты) и правила подготовки (у них свои проверки). Всё остальное — тот самый код, который
// работает в окне.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

import {поставитьЗависимости} from './depsFixture.mjs';

import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {срезОднойВерсии} from '../src/adapters/prepareStamp.mjs';
import {закреплённаяОснова} from '../src/adapters/publishBase.mjs';
import {готовыйПлан} from '../src/adapters/publishFacts.mjs';
import {отпечатокПлана} from '../src/adapters/planBytes.mjs';
import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {pushRoute} from '../src/adapters/pushRoute.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

export const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
export const EN = 'docs/lessons/proba/index.mdx';
export const ES = 'i18n/es/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
// **Пробная статья обязана быть годной к выпуску по-настоящему.** Сервер доказывает зелёную
// подготовку сам, а не верит окну, и статья без описания до записи больше не доходит. У прежней
// пробной статьи описания не было вовсе: подготовка в этой обвязке подставлена, и этого не видел
// ни один сквозной набор.
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
 * Местный репозиторий со статьёй на сайте и «сервер сайта» рядом.
 *
 * `файлы` — что лежит на диске; `вКоммите` — что из них уезжает в опубликованную ветку. По
 * умолчанию все три языка уже на сайте: обычный набор про ход публикации, а не про заглушки.
 */
export async function среда({файлы = {[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ}, вКоммите = null} = {}) {
  const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-run-'));
  песочницы.push(корень);
  const repo = path.join(корень, 'работа');
  const editorDir = path.join(корень, 'редактор');
  fs.mkdirSync(editorDir, {recursive: true});
  const сервер = path.join(корень, 'сайт.git');

  await simpleGit(корень).raw(['init', '--bare', '--initial-branch=main', сервер]);
  fs.mkdirSync(repo, {recursive: true});
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
  await git.raw(['add', '--', ...вВетку]);
  await git.raw(['commit', '-m', 'статья уже на сайте']);
  await git.raw(['push', 'origin', 'main']);

  // Файлы, которых в ветке быть не должно, кладём уже после коммита: так выглядит незакоммиченная
  // работа человека.
  for (const [rel, содержимое] of Object.entries(файлы)) if (!вВетку.includes(rel)) положить(rel, содержимое);

  поставитьЗависимости(repo);

  return {корень, repo, editorDir, сервер, git, положить};
}

/** Что лежит на «сервере сайта» сейчас. */
export async function наСервере(сервер) {
  try {
    return (await simpleGit(сервер).raw(['rev-parse', 'refs/heads/main'])).trim();
  } catch {
    return null;
  }
}

/**
 * Дверь окна к серверу, как её видит ход публикации: тот же адрес, то же тело — но вместо сети
 * прямо вызываются настоящие ручки. Отказ приходит ошибкой с текстом, как из `requestJson`.
 */
export function дверь({repo, editorDir, git}, записка, {безСнимка = false} = {}) {
  // Отпечаток показанного плана, как его помнит окно между шагами хода.
  let показанный = null;
  // Отпечаток входов проверок, как его помнит окно от подготовки и до самой записи.
  let подготовка = null;

  return async (адрес, тело) => {
    записка.push({адрес, тело});

    // Правила подготовки не проверяются этими наборами — у них свои. Ответ здесь чистый.
    //
    // **Но признак среза подставленным успехом не прикрывается.** Ход публикации обязан просить
    // подготовку ОДНОЙ открытой версии: иначе сервер соберёт свод статей и прочтёт соседний
    // перевод, а это запрещено на всём пути решения о публикации. Прежде обвязка отвечала успехом
    // на любой запрос, и потерянный признак ни один сквозной набор не видел.
    if (адрес === '/api/prepare') {
      if (тело['толькоОткрытая'] !== true) {
        throw new Error('подготовка в ходе публикации обязана просить только открытую локаль');
      }

      // Отпечаток входов подготовки считается настоящим правилом, а не выдумывается обвязкой:
      // иначе сквозные наборы не увидели бы разрыва цепочки снимка.
      подготовка = срезОднойВерсии(repo, тело.path, НАСТРОЙКИ)?.отпечаток ?? null;

      return {
        path: тело.path,
        находки: [],
        прошла: true,
        невыполненные: [],
        отпечаток: подготовка,
      };
    }

    // Прямой запрос проверки без снимка обвязка дополняет так же, как это делает ОКНО: берёт
    // отпечаток из ответа предыдущего шага, а не считает его заново. Своё значение в теле
    // подстановка не трогает. Нет запомненного — считает тем же кодом сервера.
    if (!безСнимка && (адрес === '/api/publish/commit' || адрес === '/api/release/build') && тело['отпечаток'] === undefined) {
      тело = {...тело, отпечаток: показанный ?? await отпечатокПоказанного({repo, git, rel: тело.path})};
    }

    // Снимок проверок едет во ВСЕ три ручки — так же, как его везёт окно. Прежде обвязка знала о
    // нём только на шаге состава, и обрыв снимка на сборке и записи ни один набор не поймал бы.
    const соСнимком = адрес === '/api/release' || адрес === '/api/release/build' || адрес === '/api/publish/commit';
    if (!безСнимка && соСнимком && тело['отпечатокПодготовки'] === undefined) {
      тело = {
        ...тело,
        отпечатокПодготовки: подготовка ?? срезОднойВерсии(repo, тело.path, НАСТРОЙКИ)?.отпечаток ?? '',
      };
    }

    const ответы = [];
    const общее = {
      req: {method: 'POST'},
      res: {},
      url: {pathname: адрес},
      repo,
      editorDir,
      settings: {...НАСТРОЙКИ, отправка: {...НАСТРОЙКИ['отправка'], удалённый: 'origin'}},
      git,
      тело: async () => тело,
      insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
      send: (res, status, payload) => ответы.push({status, payload}),
      // Полная сборка сайта подставлена: она идёт минуты и здесь ничего не доказывает. Подмена —
      // тем же способом, каким её ждёт сам сборщик: вызовом ответа без ошибки.
      запуск: (_путь, _ключи, _настройки, ответ) => {
        ответ(null, 'сборка подставлена', '');

        return {on: () => undefined};
      },
    };

    const взято = await releaseRoute(общее) || await publishRoute(общее) || await pushRoute(общее);
    if (!взято) throw new Error(`ручки нет: ${адрес}`);

    const {status, payload} = ответы[0];
    if (status >= 200 && status < 300) {
      if (адрес === '/api/release') показанный = payload['отпечаток'] ?? null;

      return payload;
    }

    throw Object.assign(new Error(payload.error), {статус: status, ответ: payload});
  };
}

/** Ход окна: пишущих действий, кроме самих ручек, нет — сохранять здесь нечего. */
export function ход(дверьСервера, шаги) {
  return {
    запрос: дверьСервера,
    сохранить: async () => true,
    шаг: (шаг) => шаги.push(шаг),
    жива: () => true,
  };
}

/** Отпечаток плана, который окно получило бы от `/api/release`. Считается тем же кодом сервера. */
export async function отпечатокПоказанного({repo, git, rel}) {
  const settings = {...НАСТРОЙКИ, отправка: {...НАСТРОЙКИ['отправка'], удалённый: 'origin'}};
  // Плана нет — окно бы сюда не дошло: его останавливает `/api/release`. Строка непустая, чтобы
  // заслон «снимка нет» не заслонял собой тот отказ, ради которого проверка и написана.
  const основа = await закреплённаяОснова({git, settings});
  if (основа.ошибка) return 'плана-нет';

  const план = await готовыйПлан({git, repo, settings, rel, основа: основа.основа});
  if (план.ошибка) return 'плана-нет';

  return отпечатокПлана({основа: основа.основа, родитель: основа.основа, записи: план.записи});
}
