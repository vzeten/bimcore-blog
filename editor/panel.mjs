// Панель экземпляров редактора. Отдельная маленькая программа, а не страница внутри редактора:
// она обязана работать и тогда, когда не поднят ни один экземпляр, — иначе управлять было бы
// нечем ровно в тот момент, когда управление и нужно.
//
// Свой порт (`ПОРТ_ПАНЕЛИ`) пришпилен в коде по тому же доводу, что и `4780` (SPEC 7.1.6): панель
// открывается ярлыком, и её адрес должен быть постоянным. Портом экземпляра он не бывает никогда.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer as createVite} from 'vite';

import {ПОРТ_ПАНЕЛИ} from './src/core/instanceControl.mjs';
import {errorResponse, readBody} from './src/adapters/httpBody.mjs';
import {panelRoute, надписи} from './src/adapters/panelRoute.mjs';

const EDITOR_DIR = path.dirname(fileURLToPath(import.meta.url));
const readSettings = () => JSON.parse(fs.readFileSync(path.join(EDITOR_DIR, 'settings.json'), 'utf8'));

/**
 * Страница панели: свой каркас, потому что окно редактора здесь не поднимается вовсе. Надписи
 * вкладываются прямо в страницу, а не запрашиваются отдельно: панель нужна ровно тогда, когда
 * что-то не работает, и первая же неудача обязана быть словами, а не именем ключа (SPEC 6.10).
 */
const страница = (settings) => `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Экземпляры BIMCORE Editor</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='4' fill='%231c7a45'/%3E%3Ccircle cx='8' cy='8' r='3.4' fill='white'/%3E%3C/svg%3E" />
    <script>window.ПАНЕЛЬ = ${JSON.stringify({
      надписи: надписи(settings), подписи: settings['подписи'],
    }).split('<').join('\\u003c')};</script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/ui/panel/main.tsx"></script>
  </body>
</html>
`;

function send(res, code, data, type = 'application/json; charset=utf-8') {
  res.writeHead(code, {'Content-Type': type});
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}

const тело = (req) => {
  const settings = readSettings();
  return readBody(req, settings['сервер']['пределТелаМБ'] * 1024 * 1024, settings['ошибкиСервера']);
};

/** Ошибка панели видна словами и без стека — тот же стандарт, что у сервера (SPEC 6.3, 6.5). */
function onError(res, error) {
  if (!(error?.name === 'ApiError')) console.error(error);
  const {status, payload} = errorResponse(error, readSettings()['ошибкиСервера']['внутренняя']);
  send(res, status, payload);
}

let vite;
const сервер = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://localhost:${ПОРТ_ПАНЕЛИ}`);
  } catch {
    return send(res, 400, {error: readSettings()['ошибкиСервера']['неверныйАдрес']});
  }

  // Панель называет себя так же, как экземпляр: по этому ответу ярлык видит, что на порту она,
  // а не посторонняя программа, и не открывает вслепую чужое окно.
  if (url.pathname === '/api/panel/whoami') {
    return send(res, 200, {panel: true, port: ПОРТ_ПАНЕЛИ, code: EDITOR_DIR});
  }

  if (url.pathname.startsWith('/api/')) {
    panelRoute({req, res, url, settings: readSettings(), тело, send})
      .then((взято) => {
        if (!взято) send(res, 404, {error: readSettings()['ошибкиСервера']['неизвестныйЗапрос']});
      })
      .catch((error) => onError(res, error));
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    vite.transformIndexHtml(url.pathname, страница(readSettings()))
      .then((готовая) => send(res, 200, готовая, 'text/html; charset=utf-8'))
      .catch((error) => onError(res, error));
    return;
  }

  vite.middlewares(req, res);
});

vite = await createVite({
  root: EDITOR_DIR,
  appType: 'custom',
  server: {middlewareMode: true, hmr: {server: сервер}},
  esbuild: {jsx: 'automatic'},
});

сервер.listen(ПОРТ_ПАНЕЛИ, () => {
  console.log(`Панель экземпляров BIMCORE Editor: http://localhost:${ПОРТ_ПАНЕЛИ}`);
  console.log(`  код панели: ${EDITOR_DIR}`);
});

// Порт панели занят — говорим словами. Чужую программу панель не трогает даже на своём номере.
сервер.on('error', (error) => {
  if (error?.code !== 'EADDRINUSE') throw error;
  console.error(`${readSettings()['материалы']['порт']['занят']}: ${ПОРТ_ПАНЕЛИ}`);
  process.exit(1);
});
