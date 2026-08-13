// Сервер редактора. Без сборки: запускается напрямую через node.
// Отвечает только за внешний мир — файлы, git, картинки. Правил показа здесь нет.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer as createVite} from 'vite';
import {simpleGit} from 'simple-git';

import {обложкаСайта} from './src/core/siteConfig.mjs';
import {editTimes, listArticles, опубликованные} from './src/adapters/library.mjs';
import {errorResponse, readBody} from './src/adapters/httpBody.mjs';
import {draftRoute} from './src/adapters/draftRoute.mjs';
import {assetRoute} from './src/adapters/assets.mjs';
import {versionsRoute} from './src/adapters/versionsRoute.mjs';
import {deleteRoute} from './src/adapters/deleteRoute.mjs';
import {articleRoute} from './src/adapters/articleRoute.mjs';
import {createRoute} from './src/adapters/createRoute.mjs';
import {saveRoute} from './src/adapters/saveRoute.mjs';
import {prepareRoute} from './src/adapters/prepareRoute.mjs';
import {releaseRoute} from './src/adapters/releaseRoute.mjs';
import {publishRoute} from './src/adapters/publishRoute.mjs';
import {detectPublishedRef} from './src/adapters/gitFile.mjs';
import {фиксироватьВнешнюю} from './src/adapters/externalVersion.mjs';

const EDITOR_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(EDITOR_DIR, '..');
// Настройки читаются заново на каждый запрос: поправили settings.json — обновили страницу, готово.
const readSettings = () => JSON.parse(fs.readFileSync(path.join(EDITOR_DIR, 'settings.json'), 'utf8'));
const PORT = readSettings()['сервер']['порт'];
const git = simpleGit(REPO);

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

/** Весь свод статей: файлы с диска, собранные в статьи, с временами правок и фактом публикации. */
async function articles() {
  const settings = readSettings();
  const [times, ветка] = await Promise.all([
    editTimes(REPO, git, EDITOR_DIR, settings),
    опубликованные(git, publishedRef),
  ]);
  веткаПрочитана = ветка.известна;
  return listArticles(REPO, settings, times, ветка.файлы);
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

  // Удаление статьи — тоже отдельным модулем. Опубликованную ветку ручка получает функцией:
  // на момент запуска сервера она ещё не определена, а к запросу уже известна.
  if (await deleteRoute({
    req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), git,
    publishedRef: () => publishedRef, тело, insideRepo, send, articles,
  })) return;

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

  // Подготовка статьи — отдельным модулем. Ручка только читает: файлы человека она не трогает.
  if (await prepareRoute({
    req, res, url, repo: REPO, settings: readSettings(), тело, insideRepo, send, articles,
  })) return;

  // Предварительный выпуск: состав файлов статьи и полная сборка сайта. Git не трогается ничем.
  if (await releaseRoute({
    req, res, url, repo: REPO, settings: readSettings(), тело, insideRepo, send,
  })) return;

  // Коммит статьи — единственная ручка, меняющая git. Отправки в ней нет.
  if (await publishRoute({
    req, res, url, repo: REPO, settings: readSettings(), git, тело, insideRepo, send,
  })) return;

  // Автосохранение — отдельным модулем: сервер иначе выходит за лимит размера файла.
  if (await draftRoute({
    req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(),
    тело, insideRepo, send, последняяПравка,
  })) return;

  // Картинки статьи — отдельным модулем: сервер иначе выходит за лимит размера файла.
  if (await assetRoute({req, res, url, repo: REPO, settings: readSettings(), тело, insideRepo, send})) return;

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
