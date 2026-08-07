// Сервер редактора. Без сборки: запускается напрямую через node.
// Отвечает только за внешний мир — файлы, git, картинки. Правил показа здесь нет.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer as createVite} from 'vite';
import {simpleGit} from 'simple-git';

import {buildHead, joinArticle, nothingChanged, splitArticle} from './src/core/articleFile.mjs';
import {safeFrontmatter} from './src/core/frontmatterRules.mjs';
import {afterEdit, состояниеДляОкна} from './src/core/articleState.mjs';
import {editTimes, listArticles, loadState, publishedFiles, saveState} from './src/adapters/library.mjs';
import {badFields, badPath, errorResponse, readBody} from './src/adapters/httpBody.mjs';
import {позже, свежееЧерновика} from './src/core/drafts.mjs';
import {dropDraft, fingerprint, loadDraft, saveSnapshot} from './src/adapters/draftStore.mjs';
import {draftRoute} from './src/adapters/draftRoute.mjs';
import {assetRoute} from './src/adapters/assets.mjs';
import {visibilityRoute} from './src/adapters/visibilityRoute.mjs';
import {versionsRoute} from './src/adapters/versionsRoute.mjs';
import {articleRoute} from './src/adapters/articleRoute.mjs';
import {createRoute} from './src/adapters/createRoute.mjs';
import {detectPublishedRef, gitAuthor, showFile} from './src/adapters/gitFile.mjs';
import {фиксироватьВнешнюю} from './src/adapters/externalVersion.mjs';

const EDITOR_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(EDITOR_DIR, '..');
// Настройки читаются заново на каждый запрос: поправили settings.json — обновили страницу, готово.
const readSettings = () => JSON.parse(fs.readFileSync(path.join(EDITOR_DIR, 'settings.json'), 'utf8'));
const PORT = readSettings()['сервер']['порт'];
const git = simpleGit(REPO);

// Где лежат статьи — в настройках. Код об этом не знает.
const roots = () => readSettings()['контент'];

let publishedRef = 'HEAD';

/**
 * Время последней принятой правки по каждой статье. Живёт в памяти намеренно: нужно только,
 * чтобы отличить задержавшийся старый запрос от нового, а после перезапуска таких запросов нет.
 */
const последняяПравка = new Map();

/**
 * Служебный шаг после того, как файл статьи уже записан. Его сбой пишется в консоль сервера,
 * но не отменяет соседние шаги и не выдаётся человеку за неудачу сохранения: текст на диске.
 */
function безСрыва(шаг, предупреждения, код) {
  try {
    шаг();
  } catch (error) {
    console.error(error);
    // Молчать нельзя: человеку скажут «сохранено», а версия или готовность на диск не легли.
    // Код — внутренний договор сервера и окна; человеческий текст живёт в настройках.
    предупреждения.push(код);
  }
}

/**
 * Убрать черновик после настоящего сохранения — но только если он не новее самого сохранения.
 * Запоздавший запрос иначе стёр бы работу, набранную уже после его отправки.
 * Порог свежести остаётся в памяти и после удаления черновика: без него поздний запрос
 * автосохранения воскресил бы черновик поверх только что сохранённой работы.
 */
function убратьЧерновик(rel, правкаОт) {
  const settings = readSettings();
  const черновик = loadDraft(EDITOR_DIR, settings, rel);
  if (черновик === null || свежееЧерновика(правкаОт, черновик)) dropDraft(EDITOR_DIR, settings, rel);
  последняяПравка.set(rel, позже(правкаОт ?? new Date().toISOString(), последняяПравка.get(rel)));
}

/** Фиксация внешней правки: одна дверь на все три места, где программа читает и пишет статью. */
const фиксировать = (rel, обязательно) => фиксироватьВнешнюю({
  editorDir: EDITOR_DIR, repo: REPO, settings: readSettings(), git, ref: publishedRef, rel, обязательно,
});

/** Весь свод статей: файлы с диска, собранные в статьи, с временами правок и фактом публикации. */
async function articles() {
  const settings = readSettings();
  const [times, published] = await Promise.all([
    editTimes(REPO, git, EDITOR_DIR, settings),
    publishedFiles(git, publishedRef),
  ]);
  return listArticles(REPO, settings, times, published);
}

/** Тело статьи в опубликованной версии сайта. `null` — статьи там ещё нет. */
const publishedBody = async (rel) => {
  const raw = await showFile(git, publishedRef, rel);
  return raw === null ? null : splitArticle(raw).body;
};

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
  if (url.pathname === '/api/settings') return send(res, 200, readSettings());

  if (url.pathname === '/api/articles') return send(res, 200, await articles());

  // Видимость статьи — отдельным модулем: сервер иначе выходит за лимит размера файла.
  if (await visibilityRoute({req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), git, тело, insideRepo, send, фиксировать})) return;

  // Лента версий и содержимое одной версии — тоже отдельным модулем, по той же причине.
  if (await versionsRoute({req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), insideRepo, send})) return;

  // Создание статьи — отдельным модулем, как и остальные ручки.
  if (await createRoute({req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), git, тело, send})) return;

  // Открытие статьи — отдельным модулем: сервер иначе выходит за лимит размера файла.
  if (await articleRoute({
    req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), git, publishedRef,
    insideRepo, send, фиксировать, articles, publishedBody,
  })) return;

  // Автосохранение — отдельным модулем: сервер иначе выходит за лимит размера файла.
  if (await draftRoute({
    req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(),
    тело, insideRepo, send, последняяПравка,
  })) return;

  if (url.pathname === '/api/article/save' && req.method === 'POST') {
    const payload = await тело(req);
    // Поля проверяются до работы с путями: без этого не-строка роняет `path.join` внутренней
    // ошибкой вместо понятного «неверный запрос» (SPEC 6.4). Пустое тело — законно, поэтому
    // у него проверяется только тип: статья без текста бывает, статья без пути — нет.
    const тексты = readSettings()['ошибкиСервера'];
    const плохое = badFields(payload, ['path'], тексты)
      ?? (typeof payload.body === 'string' ? null : {status: 400, error: тексты['плохойЗапрос']});
    if (плохое) return send(res, плохое.status, {error: плохое.error});

    const file = path.join(REPO, payload.path);
    if (!insideRepo(file) || !fs.existsSync(file)) return send(res, 404, {error: тексты['нетСтатьи']});

    // До проверки отпечатка и до записи: если файл изменили снаружи, его содержимое обязано лечь
    // в историю. Иначе «Сохранить поверх» затрёт чужую правку насовсем — в git её нет.
    await фиксировать(payload.path, true);

    const raw = fs.readFileSync(file, 'utf8');
    const current = splitArticle(raw);

    // Файл изменился снаружи, пока человек правил: молча затирать чужую правку нельзя.
    // Отдаём 409 и текущее содержимое файла — решение принимает человек (SPEC 6.4).
    // Отпечаток обязателен: без него проверку можно было бы обойти, просто не прислав поле.
    // Единственный способ записать поверх — явное решение человека (`перезаписать`).
    const отпечатокСейчас = fingerprint(raw);
    if (payload.перезаписать !== true) {
      if (typeof payload.отпечатокБазы !== 'string' || payload.отпечатокБазы === '') {
        return send(res, 400, {error: readSettings()['ошибкиСервера']['плохойЗапрос']});
      }

      if (payload.отпечатокБазы !== отпечатокСейчас) {
        return send(res, 409, {
          error: readSettings()['ошибкиСервера']['файлИзменёнСнаружи'],
          конфликт: true,
          файл: {frontmatterRaw: current.frontmatterRaw, body: current.body},
          отпечаток: отпечатокСейчас,
        });
      }
    }

    // Защитные правила применяются здесь: через сохранение проходит любая правка шапки.
    const safe = payload.frontmatterRaw === undefined
      ? {frontmatterRaw: current.frontmatterRaw, fixed: []}
      : safeFrontmatter(payload.path, payload.frontmatterRaw, roots());

    // Ничего не изменилось — файл не трогаем вовсе. Так «открыл и сохранил» не портит статью.
    // Черновик при этом всё равно убираем: продолжать нечего, текст и так совпадает с файлом.
    if (nothingChanged(current, {body: payload.body, frontmatterRaw: safe.frontmatterRaw})) {
      убратьЧерновик(payload.path, payload.правкаОт);
      // Отпечаток возвращаем и здесь: после «сохранить поверх» текст мог совпасть с внешней
      // правкой, и без свежего отпечатка следующая правка дала бы ложный конфликт.
      return send(res, 200, {saved: true, untouched: true, отпечаток: отпечатокСейчас});
    }

    const toEol = (text) => (current.eol === '\r\n'
      ? text.replace(/\r?\n/g, '\r\n')
      : text.replace(/\r\n/g, '\n'));

    const head = buildHead({
      frontmatterRaw: toEol(safe.frontmatterRaw),
      eol: current.eol,
      метка: current.метка,
    });

    const текст = joinArticle({head, body: toEol(payload.body)});
    fs.writeFileSync(file, текст, 'utf8');

    // Файл записан. Дальше идёт служебное: версия в истории, уборка черновика, готовность.
    // Каждый шаг отдельно: сбой одного не отменяет остальные и не превращает удавшееся
    // сохранение в «ничего не сохранилось». Иначе, например, упавший снимок оставлял бы
    // старый черновик, и при следующем открытии человек получал бы ложный выбор со старым текстом.
    // Автор известен: файл пишем мы, и подпись берётся у того, кто работает за программой.
    const settings = readSettings();
    const автор = (await gitAuthor(git)) ?? settings['реестр']['неизвестныйАвтор'];
    const сейчас = new Date().toISOString();
    const state = afterEdit(loadState(REPO, payload.path, settings), settings);

    const предупреждения = [];
    безСрыва(() => saveSnapshot(EDITOR_DIR, settings, payload.path, текст, автор, сейчас), предупреждения, 'история');
    безСрыва(() => убратьЧерновик(payload.path, payload.правкаОт), предупреждения, 'черновик');
    // Правка после подготовки возвращает версию в черновик.
    безСрыва(() => saveState(REPO, payload.path, settings, state), предупреждения, 'состояние');

    // Окну отдаём состояние, только если оно ДЕЙСТВИТЕЛЬНО легло на диск (правило — в ядре).
    const наДиске = состояниеДляОкна(state, предупреждения);

    return send(res, 200, {saved: true, fixed: safe.fixed, state: наДиске, отпечаток: fingerprint(текст), предупреждения});
  }

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
