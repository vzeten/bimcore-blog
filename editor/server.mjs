// Сервер редактора. Без сборки: запускается напрямую через node.
// Отвечает только за внешний мир — файлы, git, картинки. Правил показа здесь нет.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer as createVite} from 'vite';

import {обложкаСайта} from './src/core/siteConfig.mjs';
import {editTimes, listArticles, опубликованные, черновыеПравки} from './src/adapters/library.mjs';
import {errorResponse, readBody} from './src/adapters/httpBody.mjs';
import {draftRoute} from './src/adapters/draftRoute.mjs';
import {assetRoute} from './src/adapters/assets.mjs';
import {assetReformatRoute} from './src/adapters/assetReformat.mjs';
import {assetIntakeRoute} from './src/adapters/assetIntake.mjs';
import {productsRoute} from './src/adapters/productsRoute.mjs';
import {versionsRoute} from './src/adapters/versionsRoute.mjs';
import {deleteRoute} from './src/adapters/deleteRoute.mjs';
import {trashRoute} from './src/adapters/trashRoute.mjs';
import {articleRoute} from './src/adapters/articleRoute.mjs';
import {createRoute} from './src/adapters/createRoute.mjs';
import {localeRoute} from './src/adapters/localeRoute.mjs';
import {saveRoute} from './src/adapters/saveRoute.mjs';
import {prepareRoute} from './src/adapters/prepareRoute.mjs';
import {refineRoute} from './src/adapters/refineRoute.mjs';
import {releaseRoute} from './src/adapters/releaseRoute.mjs';
import {publishRoute} from './src/adapters/publishRoute.mjs';
import {pushRoute} from './src/adapters/pushRoute.mjs';
import {detectPublishedRef, видимостьВВетке, расхождениеССайтом} from './src/adapters/gitFile.mjs';
import {путиЗаВидимостью} from './src/core/localeSigns.mjs';
import {дверьGit} from './src/adapters/gitEnv.mjs';
import {фиксироватьВнешнюю} from './src/adapters/externalVersion.mjs';

const EDITOR_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(EDITOR_DIR, '..');
// Настройки читаются заново на каждый запрос: поправили settings.json — обновили страницу, готово.
const readSettings = () => JSON.parse(fs.readFileSync(path.join(EDITOR_DIR, 'settings.json'), 'utf8'));
const PORT = readSettings()['сервер']['порт'];
// Дверь к git одна на всю программу, и среду ей чистит одно правило: переменные вроде
// GIT_PAGER или GIT_CONFIG_GLOBAL либо роняют команду, либо молча меняют её ответ, а на этих
// ответах держатся основа публикации, состав, происхождение коммита и решение об отправке.
const git = дверьGit(REPO);

/**
 * Общая картинка сайта из его конфига. Читается текстом, без исполнения: импорт конфига
 * потянул бы плагины и чтение секретов — побочные действия внутри программы правки статей.
 * Конфига нет или значение не найдено — `null`, и окно скажет об этом словами.
 */
function обложкаСайтаИзКонфига() {
  try {
    return обложкаСайта(fs.readFileSync(path.join(REPO, 'docusaurus.config.js'), 'utf8'));
  } catch (error) {
    console.error(error);
    return null;
  }
}

let publishedRef = 'HEAD';

/**
 * Время последней принятой правки по каждой статье. Живёт в памяти намеренно: нужно только,
 * чтобы отличить задержавшийся старый запрос от нового, а после перезапуска таких запросов нет.
 */
const последняяПравка = new Map();

/** Фиксация внешней правки: одна дверь на все три места, где программа читает и пишет статью. */
const фиксировать = (rel, обязательно) => фиксироватьВнешнюю({
  editorDir: EDITOR_DIR, repo: REPO, settings: readSettings(), git, ref: publishedRef, rel, обязательно,
});

// Удалось ли прочитать опубликованную ветку при последней сборке свода. Держится рядом со
// сводом, а не спрашивается вторым запросом: дерево ветки читается один раз, и «не знаю»
// про публикацию должно быть одно на всю программу.
let веткаПрочитана = true;

/**
 * Весь свод статей: файлы с диска, собранные в статьи, с временами правок и фактом публикации.
 * Готовность «Опубликована» доказывается совпадением содержимого с опубликованной веткой
 * (SPEC 4.5.2), и спрашивается оно тем же путём сравнения, что и у публикации, одним заходом по
 * корням контента; не удалось спросить — `null`, и совпадение не считается доказанным.
 */
async function articles() {
  const settings = readSettings();
  const [times, ветка, расхождение] = await Promise.all([
    editTimes(REPO, git, EDITOR_DIR, settings),
    опубликованные(git, publishedRef),
    расхождениеССайтом(git, publishedRef, settings['контент'].map((root) => root['папка'])),
  ]);
  веткаПрочитана = ветка.известна;
  // Черновики автосохранения — часть свода, а не отдельное знание окна: работа, принятая сервером,
  // для сайта такое же неопубликованное изменение версии, как правка самого файла.
  const черновики = черновыеПравки(REPO, EDITOR_DIR, settings);
  const расходятся = расхождение === null ? null : new Set(расхождение);
  // Видимость на сайте берётся у самой ветки, а не у файла на диске: значок «только по ссылке»
  // обещает поведение живой страницы, и местная смена `unlisted` до публикации его не касается.
  // Кого об этом спрашивать, решает правило: у версии, совпадающей с веткой, ответ уже на диске,
  // поэтому чтений здесь столько, сколько версий сейчас расходится с сайтом, а не сколько статей.
  const скрытыеВВетке = await видимостьВВетке(git, publishedRef, путиЗаВидимостью(ветка.файлы, расходятся));

  return listArticles(
    REPO, settings, times, ветка.файлы,
    расходятся, ветка.известна, черновики, скрытыеВВетке,
  );
}

function send(res, code, data, type = 'application/json; charset=utf-8') {
  res.writeHead(code, {'Content-Type': type});
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}

// Тело запроса читаем с пределом размера из настроек: картинки приходят base64, но не бесконечные.
// Тексты ошибок чтения — тоже из настроек, в коде их нет.
const тело = (req) => {
  const settings = readSettings();
  return readBody(req, settings['сервер']['пределТелаМБ'] * 1024 * 1024, settings['ошибкиСервера']);
};

function insideRepo(target) {
  const resolved = path.resolve(target);
  return resolved.startsWith(REPO + path.sep);
}

async function api(req, res, url) {
  // К настройкам редактора добавляются факты самого сайта. Они не настройка: путь общей обложки
  // задан конфигом Docusaurus, и второй его источник в программе разошёлся бы с первым молча.
  if (url.pathname === '/api/settings') {
    return send(res, 200, {...readSettings(), сайт: {обложкаПоУмолчанию: обложкаСайтаИзКонфига()}});
  }

  if (url.pathname === '/api/articles') return send(res, 200, await articles());

  // Лента версий и содержимое одной версии — тоже отдельным модулем, по той же причине.
  if (await versionsRoute({req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), insideRepo, send})) return;

  // Создание статьи — отдельным модулем, как и остальные ручки.
  if (await createRoute({req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), git, тело, send})) return;
  if (await localeRoute({req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), git, тело, send})) return;

  // Удаление статьи — тоже отдельным модулем. Опубликованную ветку ручка получает функцией:
  // на момент запуска сервера она ещё не определена, а к запросу уже известна.
  if (await deleteRoute({
    req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), git,
    publishedRef: () => publishedRef, тело, insideRepo, send, articles, последняяПравка,
  })) return;

  // Корзина: перечень записей и возврат. Просроченные завершённые записи чистятся при обращении.
  if (await trashRoute({req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), тело, send})) return;

  // Открытие статьи — отдельным модулем: сервер иначе выходит за лимит размера файла.
  if (await articleRoute({
    req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), git, publishedRef,
    insideRepo, send, фиксировать, articles, веткаИзвестна: () => веткаПрочитана,
  })) return;

  // Сохранение статьи — тоже отдельным модулем. Вместе с файлом человека оно переключает
  // видимость остальных языковых версий: отдельной ручки видимости в программе нет.
  if (await saveRoute({
    req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), git,
    тело, insideRepo, send, фиксировать, последняяПравка,
  })) return;

  // «Доработать»: план только читает, применение пишет открытую версию и её медиа одной операцией.
  if (await refineRoute({
    req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), git, тело, insideRepo, send, последняяПравка,
  })) return;

  // Подготовка статьи — отдельным модулем. Ручка только читает: файлы человека она не трогает.
  if (await prepareRoute({
    req, res, url, repo: REPO, settings: readSettings(), тело, insideRepo, send, articles,
  })) return;

  // Предварительный выпуск: план публикации и полная сборка его точной копии. Git только читается:
  // ни индекс, ни объектная база до согласия человека не меняются.
  if (await releaseRoute({
    req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), git, тело, insideRepo, send,
  })) return;

  // Запись статьи — единственная ручка, меняющая местный git. Отправки в ней нет.
  if (await publishRoute({
    req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), git, тело, insideRepo, send,
  })) return;

  // Отправка на сайт: сначала показ того, что уедет, и только отдельным заходом сама отправка.
  if (await pushRoute({
    req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), git, тело, insideRepo, send,
  })) return;

  // Автосохранение — отдельным модулем: сервер иначе выходит за лимит размера файла.
  if (await draftRoute({
    req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(),
    тело, insideRepo, send, последняяПравка,
  })) return;

  // Картинки статьи — отдельным модулем: сервер иначе выходит за лимит размера файла.
  if (await assetRoute({req, res, url, repo: REPO, settings: readSettings(), тело, insideRepo, send})) return;

  // Смена формата картинки: новый файл и обновлённая ссылка в статье одной операцией.
  if (await assetReformatRoute({req, res, url, repo: REPO, settings: readSettings(), тело, insideRepo, send})) return;

  // Приём новой картинки в статью: карантин, а затем укладка рядом со статьёй под свободным именем.
  if (await assetIntakeRoute({req, res, url, repo: REPO, settings: readSettings(), тело, insideRepo, send})) return;

  // Каталог товаров и картинка выбранного товара. Ecwid спрашивает только сервер: токен в окно
  // не уезжает, а скачанная картинка идёт в статью той же дорогой, что и файл человека.
  if (await productsRoute({req, res, url, repo: REPO, settings: readSettings(), тело, insideRepo, send})) return;

  return send(res, 404, {error: readSettings()['ошибкиСервера']['неизвестныйЗапрос']});
}

const vite = await createVite({
  root: EDITOR_DIR,
  appType: 'spa',
  server: {middlewareMode: true},
  esbuild: {jsx: 'automatic'},
});

publishedRef = await detectPublishedRef(git);

// Ожидаемую ошибку (нет статьи, битый запрос) отдаём с её кодом и текстом.
// Внутреннюю — пишем стек в консоль сервера, а интерфейсу даём спокойный общий текст из настроек без стека.
function onError(res, error) {
  if (!(error?.name === 'ApiError')) console.error(error);
  const {status, payload} = errorResponse(error, readSettings()['ошибкиСервера']['внутренняя']);
  send(res, status, payload);
}

http
  .createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, `http://localhost:${PORT}`);
    } catch {
      // Неразбираемый адрес — это битый запрос, а не повод падать.
      return send(res, 400, {error: readSettings()['ошибкиСервера']['неверныйАдрес']});
    }
    if (url.pathname.startsWith('/api/')) {
      api(req, res, url).catch((error) => onError(res, error));
      return;
    }
    vite.middlewares(req, res);
  })
  .listen(PORT, () => {
    console.log(`Редактор статей: http://localhost:${PORT}  (версия на сайте: ${publishedRef})`);
  });
