// Сервер редактора. Без сборки: запускается напрямую через node.
// Отвечает только за внешний мир — файлы, git, картинки. Правил показа здесь нет.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer as createVite} from 'vite';
import {simpleGit} from 'simple-git';

import {buildHead, joinArticle, nothingChanged, readField, splitArticle} from './src/core/articleFile.mjs';
import {articlePlace, safeFrontmatter} from './src/core/frontmatterRules.mjs';
import {versionStates} from './src/core/articles.mjs';
import {afterEdit} from './src/core/articleState.mjs';
import {editTimes, listArticles, loadState, publishedFiles, saveState} from './src/adapters/library.mjs';
import {badPath, errorResponse, readBody} from './src/adapters/httpBody.mjs';
import {draftDecision, newDraft} from './src/core/drafts.mjs';
import {dropDraft, fingerprint, loadDraft, saveDraft, saveSnapshot} from './src/adapters/draftStore.mjs';
import {assetRoute} from './src/adapters/assets.mjs';
import {visibilityRoute} from './src/adapters/visibilityRoute.mjs';

const EDITOR_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(EDITOR_DIR, '..');
// Настройки читаются заново на каждый запрос: поправили settings.json — обновили страницу, готово.
const readSettings = () => JSON.parse(fs.readFileSync(path.join(EDITOR_DIR, 'settings.json'), 'utf8'));
const PORT = readSettings()['сервер']['порт'];
const git = simpleGit(REPO);

// Где лежат статьи — в настройках. Код об этом не знает.
const roots = () => readSettings()['контент'];

let publishedRef = 'HEAD';

async function detectPublishedRef() {
  try {
    await git.revparse(['--verify', 'origin/main']);
    publishedRef = 'origin/main';
  } catch {
    publishedRef = 'HEAD';
  }
}

/** Весь свод статей: файлы с диска, собранные в статьи, с временами правок и фактом публикации. */
async function articles() {
  const [times, published] = await Promise.all([editTimes(REPO, git), publishedFiles(git, publishedRef)]);
  return listArticles(REPO, readSettings(), times, published);
}

async function articleOf(rel) {
  const settings = readSettings();
  const article = (await articles())
    .find((item) => Object.values(item.versions).some((v) => v.path === rel));

  if (!article) return {versions: {}, states: {}, category: '', нетНаСайте: false, служебная: false, готовность: null};

  const times = Object.fromEntries(
    Object.entries(article.versions).map(([locale, version]) => [locale, version.когда]),
  );

  // Готовность и скрытость открытой версии — как у её файла, а не всегда «первый статус».
  const своя = article.versions[articlePlace(rel, settings['контент']).locale];

  return {
    versions: Object.fromEntries(Object.entries(article.versions).map(([l, v]) => [l, v.path])),
    states: versionStates(article, times, settings),
    category: article.category,
    нетНаСайте: article.нетНаСайте,
    служебная: article.служебная,
    готовность: своя?.готовность ?? null,
    скрыта: своя?.скрыта ?? false,
  };
}

/** Кто автор снимка. Нет имени в git — снимок всё равно нужен, просто без автора. */
async function gitAuthor() {
  try {
    return (await git.raw(['config', 'user.name'])).trim() || null;
  } catch {
    return null;
  }
}

async function publishedBody(rel) {
  try {
    const raw = await git.show([`${publishedRef}:${rel}`]);
    return splitArticle(raw).body;
  } catch {
    return null; // статьи ещё нет на сайте
  }
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
  if (url.pathname === '/api/settings') return send(res, 200, readSettings());

  if (url.pathname === '/api/articles') return send(res, 200, await articles());

  // Видимость статьи — отдельным модулем: сервер иначе выходит за лимит размера файла.
  if (await visibilityRoute({req, res, url, repo: REPO, settings: readSettings(), тело, insideRepo, send})) return;

  if (url.pathname === '/api/article') {
    const rel = url.searchParams.get('path');
    const settings = readSettings();
    const file = typeof rel === 'string' && rel !== '' ? path.join(REPO, rel) : null;
    if (!file || !insideRepo(file) || !fs.existsSync(file)) {
      return send(res, 404, {error: settings['ошибкиСервера']['нетСтатьи']});
    }

    const raw = fs.readFileSync(file, 'utf8');
    const {frontmatterRaw, body} = splitArticle(raw);
    const отпечаток = fingerprint(raw);

    // Что открывать: файл или автосохранение. Молча подменять файл нельзя — при конфликте решает человек.
    const draft = loadDraft(EDITOR_DIR, settings, rel);
    const решение = draftDecision({
      draft,
      файл: {frontmatterRaw, body},
      отпечатокФайла: отпечаток,
      сейчас: new Date().toISOString(),
      settings,
    });
    const изЧерновика = решение === 'черновик';

    return send(res, 200, {
      path: rel,
      // При свежем черновике сразу продолжаем работу с него, без вопроса (критерий 4).
      frontmatterRaw: изЧерновика ? draft['frontmatterRaw'] : frontmatterRaw,
      body: изЧерновика ? draft['body'] : body,
      отпечаток,
      черновикРешение: решение,
      // При конфликте отдаём оба варианта: файл выше, автосохранение здесь (критерий 5).
      черновик: решение === 'нет' ? null : {когда: draft['когда'], frontmatterRaw: draft['frontmatterRaw'], body: draft['body']},
      published: await publishedBody(rel),
      title: readField(frontmatterRaw, 'title') || rel,
      state: loadState(REPO, rel, settings),
      ...(await articleOf(rel)),
    });
  }

  // Автосохранение: пишет черновик рядом с редактором и НЕ трогает настоящий .mdx.
  if (url.pathname === '/api/draft' && req.method === 'POST') {
    const payload = await тело(req);
    const settings = readSettings();
    const rel = payload.path;
    const bad = badPath(
      [rel],
      (p) => insideRepo(path.join(REPO, p)),
      (p) => fs.existsSync(path.join(REPO, p)),
      settings['ошибкиСервера'],
    );
    if (bad) return send(res, bad.status, {error: bad.error});

    // Имя «тело» здесь занято чтением запроса, поэтому текст статьи назван иначе.
    const текстЧерновика = String(payload.body ?? '');
    const шапка = String(payload.frontmatterRaw ?? '');

    // Черновик, слово в слово равный файлу, хранить незачем. Заодно это закрывает гонку:
    // запрос, посланный до кнопки «Сохранить», не воскресит черновик уже сохранённой работы.
    const текущий = splitArticle(fs.readFileSync(path.join(REPO, rel), 'utf8'));
    if (текущий.body === текстЧерновика && текущий.frontmatterRaw === шапка) {
      dropDraft(EDITOR_DIR, settings, rel);
      return send(res, 200, {автосохранено: null, совпадаетСФайлом: true});
    }

    const когда = new Date().toISOString();
    saveDraft(EDITOR_DIR, settings, newDraft({
      path: rel,
      frontmatterRaw: шапка,
      body: текстЧерновика,
      отпечатокБазы: String(payload.отпечатокБазы ?? ''),
      когда,
    }));

    return send(res, 200, {автосохранено: когда});
  }

  if (url.pathname === '/api/article/save' && req.method === 'POST') {
    const payload = await тело(req);
    const file = path.join(REPO, payload.path);
    if (!insideRepo(file) || !fs.existsSync(file)) return send(res, 404, {error: readSettings()['ошибкиСервера']['нетСтатьи']});
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
      dropDraft(EDITOR_DIR, readSettings(), payload.path);
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

    // Настоящее сохранение оставляет версию в истории, а черновик больше не нужен.
    const settings = readSettings();
    saveSnapshot(EDITOR_DIR, settings, payload.path, текст, await gitAuthor(), new Date().toISOString());
    dropDraft(EDITOR_DIR, settings, payload.path);

    // Правка после подготовки возвращает версию в черновик.
    const state = afterEdit(loadState(REPO, payload.path, settings), settings);
    saveState(REPO, payload.path, settings, state);

    return send(res, 200, {saved: true, fixed: safe.fixed, state, отпечаток: fingerprint(текст)});
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

await detectPublishedRef();

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
