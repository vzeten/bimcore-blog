// Каталог товаров для окна и картинка выбранного товара.
//
// Ecwid спрашивает СЕРВЕР, и только он: токен живёт в среде процесса (`.env.local` рядом с сайтом
// или секрет сборки) и в браузер редактора не уезжает ни одним полем. Каталог собирается тем же
// общим нормализатором, каким его собирает сборка сайта (`plugins/ecwid-prices/catalog.mjs`):
// второго алгоритма нет намеренно — разойдись они, редактор вписал бы в статью адрес или картинку
// не того товара, который потом покажет сайт.
//
// Картинка товара не идёт своей дорогой на диск: сервер скачивает байты и отдаёт их ТОЙ ЖЕ
// защищённой транзакции, что и файл, выбранный человеком, — карантин, проверка формата по байтам,
// предел анимации, свободное имя (`assetIntake.mjs`). Рядом со статьёй её кладёт существующая
// ручка `/api/asset/place`.

import fs from 'node:fs';
import path from 'node:path';

import {badFields} from './httpBody.mjs';
import {папкаСтатьи} from './assetGuards.mjs';
import {годныйПуть} from './releaseFacts.mjs';
import {подготовитьБайты} from './assetIntake.mjs';
import {ПЕРЕМЕННАЯ_ТОКЕНА, собратьКаталог} from '../../../plugins/ecwid-prices/catalog.mjs';

/** Обрабатывает GET `/api/products` и POST `/api/product/image`. true, если запрос её. */
export async function productsRoute({req, res, url, repo, settings, тело, insideRepo, send}) {
  if (req.method === 'GET' && url.pathname === '/api/products') {
    const каталог = await каталогТоваров(repo, settings, send, res);
    if (каталог !== null) send(res, 200, {товары: каталог.товары});
    return true;
  }

  if (req.method !== 'POST' || url.pathname !== '/api/product/image') return false;

  const ошибки = settings['ошибкиСервера'];
  const payload = await тело(req);
  const плохо = badFields(payload, ['article', 'id'], ошибки);
  if (плохо) {
    send(res, плохо.status, {error: плохо.error});
    return true;
  }

  // Путь обязан быть путём статьи сайта, и папка обязана существовать: жетон карантина
  // привязывается к статье, и чужой путь увёл бы картинку не туда. Правило общее с выпуском.
  if (!годныйПуть(payload.article, settings)) {
    send(res, 400, {error: ошибки['неПутьСтатьи']});
    return true;
  }
  if (папкаСтатьи(repo, payload.article, insideRepo) === null) {
    send(res, 404, {error: ошибки['нетСтатьи']});
    return true;
  }

  const каталог = await каталогТоваров(repo, settings, send, res);
  if (каталог === null) return true;

  // Товар мог исчезнуть из магазина, пока человек выбирал: статья и её папка остаются прежними.
  const товар = каталог.товары.find((найден) => найден.id === String(payload.id));
  if (товар === undefined) {
    send(res, 404, {error: ошибки['товарИсчез']});
    return true;
  }

  const байты = await скачать(товар.картинка, settings);
  if (байты === null) {
    send(res, 502, {error: ошибки['картинкаТовараНеДоехала']});
    return true;
  }

  const итог = подготовитьБайты({repo, settings, article: payload.article, bytes: байты});
  if (итог.код !== undefined) send(res, итог.код, {error: итог.error});
  else send(res, 200, итог);
  return true;
}

/** Каталог магазина. `null` — отказ уже отправлен человеку словами, вставлять товар нечего. */
async function каталогТоваров(repo, settings, send, res) {
  const ошибки = settings['ошибкиСервера'];
  const token = токен(repo);
  if (token === '') {
    send(res, 503, {error: ошибки['нетТокенаКаталога']});
    return null;
  }

  try {
    return await собратьКаталог({token});
  } catch (error) {
    console.error(error);
    send(res, 502, {error: ошибки['каталогНеОтвечает']});
    return null;
  }
}

/**
 * Публичный токен Ecwid: сначала среда процесса, потом `.env.local` рядом с сайтом — тот же файл
 * и то же имя, которыми пользуется сборка. Второго места хранения у него нет, и наружу отсюда
 * уходит только сам каталог.
 */
function токен(repo) {
  if (process.env[ПЕРЕМЕННАЯ_ТОКЕНА]) return process.env[ПЕРЕМЕННАЯ_ТОКЕНА];

  try {
    const строки = fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split(/\r?\n/);
    const нужная = строки.find((строка) => строка.trimStart().startsWith(`${ПЕРЕМЕННАЯ_ТОКЕНА}=`));
    return нужная === undefined ? '' : нужная.slice(нужная.indexOf('=') + 1).trim();
  } catch {
    return '';
  }
}

/**
 * Байты картинки товара. Предел тот же, что у тела запроса: картинка проходит дальше по той же
 * дороге, что и файл человека, и не должна быть больше того, что программа готова принять.
 * `null` — сеть, отказ магазина или перевес; в статье и в её папке при этом ничего не меняется.
 */
async function скачать(адрес, settings) {
  try {
    const ответ = await fetch(адрес);
    if (!ответ.ok) return null;

    const байты = Buffer.from(await ответ.arrayBuffer());
    return байты.length > settings['сервер']['пределТелаМБ'] * 1024 * 1024 ? null : байты;
  } catch (error) {
    console.error(error);
    return null;
  }
}
