// Каталог товаров для окна и картинка выбранного товара.
//
// Каталог программа не собирает заново и Ecwid не спрашивает: она читает ГОТОВЫЙ
// `product-catalog.json`, который кладёт в собранный сайт общий нормализатор
// (`plugins/ecwid-prices/catalog.mjs`). Второй внешней границы и токена у редактора нет вовсе,
// а выбор человека и то, что покажет сайт, приходят из одного файла и разойтись не могут.
// Каталога нет — понятный отказ: статья и её файлы не меняются.
//
// Скачанная картинка своей дорогой на диск не идёт: байты уходят в ТУ ЖЕ защищённую транзакцию,
// что и файл человека (`assetIntake.mjs`), а рядом со статьёй её кладёт существующая ручка укладки.

import fs from 'node:fs';
import path from 'node:path';

import {badFields} from './httpBody.mjs';
import {папкаСтатьи} from './assetGuards.mjs';
import {годныйПуть} from './releaseFacts.mjs';
import {подготовитьБайты} from './assetIntake.mjs';

/** Где сборка сайта оставляет публичный каталог. Путь задан сборкой, а не настройкой (SPEC 4.4). */
const КАТАЛОГ = ['build', 'product-catalog.json'];

/** Обрабатывает GET `/api/products` и POST `/api/product/image`. true, если запрос её. */
export async function productsRoute({req, res, url, repo, settings, тело, insideRepo, send}) {
  if (req.method === 'GET' && url.pathname === '/api/products') {
    const каталог = читатьКаталог(repo);
    if (каталог === null) send(res, 503, {error: settings['ошибкиСервера']['нетКаталогаТоваров']});
    else send(res, 200, {товары: каталог.товары});
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

  const каталог = читатьКаталог(repo);
  if (каталог === null) {
    send(res, 503, {error: ошибки['нетКаталогаТоваров']});
    return true;
  }

  // Товар мог исчезнуть из каталога, пока человек выбирал: статья и её папка остаются прежними.
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

/** Готовый каталог из собранного сайта. `null` — файла нет или он испорчен: догадок здесь нет. */
function читатьКаталог(repo) {
  try {
    const каталог = JSON.parse(fs.readFileSync(path.join(repo, ...КАТАЛОГ), 'utf8'));
    return Array.isArray(каталог?.товары) ? каталог : null;
  } catch {
    return null;
  }
}

/**
 * Байты картинки товара; предел тот же, что у тела запроса. `null` — сеть, отказ хранилища или
 * перевес: в статье и в её папке при этом ничего не меняется.
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
