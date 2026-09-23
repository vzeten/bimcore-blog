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
import {conflictRoute} from './src/adapters/conflictRoute.mjs';
import {assetRoute} from './src/adapters/assets.mjs';
import {assetReformatRoute} from './src/adapters/assetReformat.mjs';
import {assetIntakeRoute} from './src/adapters/assetIntake.mjs';
import {productsRoute} from './src/adapters/productsRoute.mjs';
import {viewsRoute} from './src/adapters/viewsRoute.mjs';
import {analyticsRoute} from './src/adapters/analyticsRoute.mjs';
import {analyticsReadRoute} from './src/adapters/analyticsReadRoute.mjs';
import {versionsRoute} from './src/adapters/versionsRoute.mjs';
import {deleteRoute} from './src/adapters/deleteRoute.mjs';
import {trashRoute} from './src/adapters/trashRoute.mjs';
import {articleRoute} from './src/adapters/articleRoute.mjs';
import {createRoute} from './src/adapters/createRoute.mjs';
import {localeRoute} from './src/adapters/localeRoute.mjs';
import {saveRoute} from './src/adapters/saveRoute.mjs';
import {prepareRoute} from './src/adapters/prepareRoute.mjs';
import {refineRoute} from './src/adapters/refineRoute.mjs';
import {publishRoutes} from './src/adapters/publishRoutes.mjs';
import {слежение as слежениеВыкладки} from './src/adapters/deployWatch.mjs';
import {detectPublishedRef, расхождениеССайтом, шапкиВВетке} from './src/adapters/gitFile.mjs';
import {путиЗаОпубликованнойШапкой} from './src/core/localeSigns.mjs';
import {дверьGit} from './src/adapters/gitEnv.mjs';
import {фиксироватьВнешнюю} from './src/adapters/externalVersion.mjs';
import {ПЕРЕКЛЮЧАТЕЛЬ, ПОРТ_ЗАПУСКА, строкиЗапуска, фактыЗапуска} from './src/adapters/materialSource.mjs';
import {перенестиХранилище, строкиПереноса} from './src/adapters/draftMigrate.mjs';

const EDITOR_DIR = path.dirname(fileURLToPath(import.meta.url));
// Настройки читаются заново на каждый запрос: поправили settings.json — обновили страницу, готово.
const readSettings = () => JSON.parse(fs.readFileSync(path.join(EDITOR_DIR, 'settings.json'), 'utf8'));
// Материалы владельца — постоянная папка, названная в самом правиле, а не рядом с кодом: код бывает
// запущен из копии рабочей ветки, а статьи, картинки и переводы у владельца одни. Другой корень
// возможен только явным переключателем испытания, и негодный корень останавливает запуск словами.
// Тем же заходом экземпляр опознаётся целиком: род, версия КОДА и порт, причём `4780` принадлежит
// обычному принятому окну, а другому экземпляру номер называют явно (SPEC 4.3, 7.1.6).
let ИСТОЧНИК;
let ОПОЗНАНИЕ;
try {
  ({источник: ИСТОЧНИК, опознание: ОПОЗНАНИЕ} = await фактыЗапуска({
    settings: readSettings(), кодDir: EDITOR_DIR, git: дверьGit(EDITOR_DIR),
    испытательный: process.env[ПЕРЕКЛЮЧАТЕЛЬ], заявка: process.env[ПОРТ_ЗАПУСКА],
  }));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const REPO = ИСТОЧНИК['корень'];
const PORT = ОПОЗНАНИЕ['port'];
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

// Опрос выкладки на GitHub — один на сервер: значок «Сайт» спрашивает его, а не сеть (SPEC 5.4).
const выкладка = слежениеВыкладки({editorDir: EDITOR_DIR, настройки: readSettings});

// Пока ветку не спросили — про сайт не известно ничего. `HEAD` здесь стоять не может: местная
// ветка не доказывает выпуск (см. `detectPublishedRef`).
let publishedRef = null;

/**
 * Время последней принятой правки по каждой статье. Живёт в памяти намеренно: нужно только,
 * чтобы отличить задержавшийся старый запрос от нового, а после перезапуска таких запросов нет.
 */
const последняяПравка = new Map();

/** Фиксация внешней правки: одна дверь на все три места, где программа читает и пишет статью. */
const фиксировать = (rel, обязательно) => фиксироватьВнешнюю({
  repo: REPO, settings: readSettings(), git, ref: publishedRef, rel, обязательно,
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
    editTimes(REPO, git, settings),
    опубликованные(git, publishedRef),
    расхождениеССайтом(git, publishedRef, settings['контент'].map((root) => root['папка'])),
  ]);
  веткаПрочитана = ветка.известна;
  // Черновики автосохранения — часть свода, а не отдельное знание окна: работа, принятая сервером,
  // для сайта такое же неопубликованное изменение версии, как правка самого файла.
  const черновики = черновыеПравки(REPO, settings);
  const расходятся = расхождение === null ? null : new Set(расхождение);
  // Признаки выпуска берутся у самой ветки, а не у файла на диске: и значок «только по ссылке»,
  // и красные буквы обещают поведение живой страницы, а местная смена доступности до публикации
  // их не касается. Кого об этом спрашивать, решает правило: у версии, совпадающей с веткой, ответ
  // уже на диске, поэтому чтений здесь столько, сколько версий сейчас расходится с сайтом.
  const вВетке = await шапкиВВетке(git, publishedRef, путиЗаОпубликованнойШапкой(ветка.файлы, расходятся));

  return listArticles(
    REPO, settings, times, ветка.файлы,
    расходятся, ветка.известна, черновики, вВетке,
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

  // Кто отвечает на этом порту. Только чтение: по этому ответу ярлык решает, его ли это окно.
  if (url.pathname === '/api/identity') return send(res, 200, ОПОЗНАНИЕ);

  // Просмотры из Google Analytics — своим запросом окна: реестр и работа со статьёй его не ждут.
  if (await viewsRoute({req, res, url, repo: REPO, settings: readSettings(), git, publishedRef: () => publishedRef, articles, send})) return;
  if (await analyticsReadRoute({req, res, url, repo: REPO, settings: readSettings(), send})) return;
  if (await analyticsRoute({req, res, url, repo: REPO, settings: readSettings(), git, тело, send})) return;

  // Лента версий и содержимое одной версии — тоже отдельным модулем, по той же причине.
  if (await versionsRoute({req, res, url, repo: REPO, settings: readSettings(), insideRepo, send})) return;

  // Создание статьи — отдельным модулем, как и остальные ручки.
  if (await createRoute({req, res, url, repo: REPO, settings: readSettings(), git, тело, send})) return;
  if (await localeRoute({req, res, url, repo: REPO, settings: readSettings(), git, тело, send})) return;

  // Удаление в корзину. Про сайт оно не судит: снятие с сайта идёт до него ручками `retireRoute`.
  if (await deleteRoute({
    req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), тело, insideRepo, send, articles, последняяПравка,
  })) return;

  // Корзина: перечень, возврат и стирание записи насовсем. Сама она ничего не удаляет по сроку.
  if (await trashRoute({req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), тело, send})) return;

  // Открытие статьи — отдельным модулем: сервер иначе выходит за лимит размера файла.
  if (await articleRoute({
    req, res, url, repo: REPO, settings: readSettings(), git, publishedRef,
    insideRepo, send, фиксировать, articles, веткаИзвестна: () => веткаПрочитана,
  })) return;

  // Сохранение статьи — тоже отдельным модулем. Вместе с файлом человека оно переключает
  // видимость остальных языковых версий: отдельной ручки видимости в программе нет.
  if (await saveRoute({
    req, res, url, repo: REPO, settings: readSettings(), git, publishedRef: () => publishedRef,
    тело, insideRepo, send, фиксировать, последняяПравка,
  })) return;

  // «Доработать»: план только читает, применение пишет открытую версию и её медиа одной операцией.
  if (await refineRoute({
    req, res, url, repo: REPO, settings: readSettings(), git, тело, insideRepo, send, последняяПравка,
  })) return;

  // Подготовка статьи — отдельным модулем. Ручка только читает: файлы человека она не трогает.
  if (await prepareRoute({
    req, res, url, repo: REPO, settings: readSettings(), тело, insideRepo, send, articles,
  })) return;

  // Ручки выпуска — одним модулем (`publishRoutes.mjs`): дата, обложка, состав с быстрыми
  // проверками, состояние на сайте, запись, снятие, уборка ссылок, отправка и значок «Сайт».
  const дляВыпуска = {req, res, url, repo: REPO, editorDir: EDITOR_DIR, settings: readSettings(), git, тело, insideRepo, send};
  if (await publishRoutes(дляВыпуска, выкладка)) return;

  // Автосохранение и разрешение спора: общий у них порядок правок одной языковой версии.
  const ручкиПравок = {req, res, url, repo: REPO, settings: readSettings(), git, publishedRef: () => publishedRef, тело, insideRepo, send, последняяПравка};
  if (await draftRoute({...ручкиПравок, фиксировать})) return;
  if (await conflictRoute(ручкиПравок)) return;

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

// Сервер создаётся ДО Vite: горячая перезагрузка садится на этот же порт, а не заводит второй. Свой
// порт означал бы второе правило про номера, и экземпляры, разошедшиеся по главным портам, снова
// сталкивались бы на общем побочном (SPEC 7.1.6). Обработчик зовёт `vite` уже после его сборки.
let vite;
const сервер = http.createServer((req, res) => {
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
});

vite = await createVite({
  root: EDITOR_DIR,
  appType: 'spa',
  server: {middlewareMode: true, hmr: {server: сервер}},
  esbuild: {jsx: 'automatic'},
});

publishedRef = await detectPublishedRef(git);

// Черновик и снимки лежат при МАТЕРИАЛАХ, а не при коде, поэтому работа, оставшаяся в хранилище
// этой копии кода от прежних правил, переносится в общее. Перенос идёт ДО открытия сервера: иначе
// окно успело бы писать черновик мимо ещё не перенесённой работы. Старое хранилище только
// читается. Сорвался перенос — сервер не поднимается: работать над черновиком, судьба которого
// неизвестна, хуже отказа запуститься.
let переносХранилища;
try {
  переносХранилища = перенестиХранилище({
    repo: REPO,
    кодDir: EDITOR_DIR,
    settings: readSettings(),
    испытательный: ИСТОЧНИК['испытательный'],
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// Ожидаемую ошибку (нет статьи, битый запрос) отдаём с её кодом и текстом.
// Внутреннюю — пишем стек в консоль сервера, а интерфейсу даём спокойный общий текст из настроек без стека.
function onError(res, error) {
  if (!(error?.name === 'ApiError')) console.error(error);
  const {status, payload} = errorResponse(error, readSettings()['ошибкиСервера']['внутренняя']);
  send(res, status, payload);
}

сервер.listen(PORT, () => {
  // Незаконченная выкладка прошлого запуска дослеживается: запись лежит на диске.
  выкладка.разбудить();
  // Экземпляр называет себя сам: род окна, версия КОДА, папка материалов, адрес и где лежит работа.
  for (const строка of [
    ...строкиЗапуска({settings: readSettings(), опознание: ОПОЗНАНИЕ, наСайте: publishedRef}),
    ...строкиПереноса(переносХранилища, readSettings()),
  ]) console.log(строка);
});

// Порт занят — не повод падать простынёй стека: человеку говорится, что занято, чужой сервер цел.
сервер.on('error', (error) => {
  if (error?.code !== 'EADDRINUSE') throw error;
  console.error(`${readSettings()['материалы']['порт']['занят']}: ${PORT}`);
  process.exit(1);
});
