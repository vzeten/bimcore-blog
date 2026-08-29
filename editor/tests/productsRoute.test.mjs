// Ручка каталога товаров: магазин спрашивает только сервер, а картинка товара идёт в статью
// той же защищённой дорогой, что и файл человека.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import path from 'node:path';

import {productsRoute} from '../src/adapters/productsRoute.mjs';
import {ПЕРЕМЕННАЯ_ТОКЕНА} from '../../plugins/ecwid-prices/catalog.mjs';
import {НАСТРОЙКИ, PNG, REL, карантин, репозиторий, уложить, файлы} from './intakeHarness.mjs';

const ТОКЕН = 'public_проверочный';

const SETTINGS = {
  ...НАСТРОЙКИ,
  сервер: {порт: 4780, пределТелаМБ: 25},
  ошибкиСервера: {
    ...НАСТРОЙКИ.ошибкиСервера,
    нетТокенаКаталога: 'каталог магазина недоступен',
    каталогНеОтвечает: 'магазин не ответил',
    товарИсчез: 'этого товара в магазине больше нет',
    картинкаТовараНеДоехала: 'картинку товара скачать не удалось',
  },
};

const ОТВЕТЫ = {
  profile: {languages: {defaultLanguage: 'en'}},
  categories: {items: [{id: 1, name: 'Revit Families', nameTranslated: {ru: 'Семейства Revit'}}]},
  products: {
    items: [{
      id: 100, sku: 'BC-1', name: 'Armchair Revit Families',
      url: 'https://bimcore.one/products/armchair', imageUrl: 'https://cdn/armchair.png',
      defaultCategoryId: 1, price: 11, defaultDisplayedPriceFormatted: '£11.00',
    }],
  },
};

/** Магазин и его картинка понарошку. `картинкаОтвечает: false` — обрыв скачивания. */
function магазин({картинкаОтвечает = true} = {}) {
  const адреса = [];
  vi.stubGlobal('fetch', async (адрес) => {
    адреса.push(адрес);
    if (адрес === 'https://cdn/armchair.png') {
      return картинкаОтвечает
        ? {ok: true, arrayBuffer: async () => PNG}
        : {ok: false, status: 404};
    }
    const ключ = Object.keys(ОТВЕТЫ).find((имя) => адрес.includes(`/${имя}?`));
    return {ok: true, json: async () => ОТВЕТЫ[ключ]};
  });
  return адреса;
}

async function запрос(repo, method, pathname, payload) {
  const ответ = {};
  const принято = await productsRoute({
    req: {method},
    res: {},
    url: new URL(`http://localhost${pathname}`),
    repo,
    settings: SETTINGS,
    тело: async () => payload,
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, code, data) => {
      ответ.code = code;
      ответ.data = data;
    },
  });
  return {принято, ...ответ};
}

beforeEach(() => {
  process.env[ПЕРЕМЕННАЯ_ТОКЕНА] = ТОКЕН;
});

afterEach(() => {
  delete process.env[ПЕРЕМЕННАЯ_ТОКЕНА];
  vi.unstubAllGlobals();
});

describe('каталог товаров и картинка товара', () => {
  it('каталог доходит до окна без токена и без цен', async () => {
    магазин();
    const ответ = await запрос(репозиторий(), 'GET', '/api/products');

    expect(ответ.code).toBe(200);
    expect(ответ.data.товары[0]).toMatchObject({id: '100', адрес: 'https://bimcore.one/products/armchair'});
    expect(JSON.stringify(ответ.data)).not.toContain(ТОКЕН);
    expect(JSON.stringify(ответ.data)).not.toContain('11.00');
  });

  it('без токена каталога нет, и статья не меняется', async () => {
    delete process.env[ПЕРЕМЕННАЯ_ТОКЕНА];
    магазин();
    const repo = репозиторий();
    const ответ = await запрос(repo, 'POST', '/api/product/image', {article: REL, id: '100'});

    expect(ответ.code).toBe(503);
    expect(ответ.data.error).toBe(SETTINGS.ошибкиСервера.нетТокенаКаталога);
    expect(файлы(repo)).toEqual(['index.mdx']);
  });

  it('магазин не ответил — отказ словами, папка статьи прежняя', async () => {
    vi.stubGlobal('fetch', async () => ({ok: false, status: 500}));
    const repo = репозиторий();
    const ответ = await запрос(repo, 'POST', '/api/product/image', {article: REL, id: '100'});

    expect(ответ.code).toBe(502);
    expect(ответ.data.error).toBe(SETTINGS.ошибкиСервера.каталогНеОтвечает);
    expect(файлы(repo)).toEqual(['index.mdx']);
  });

  it('товар исчез из магазина — отказ, а не чужая картинка', async () => {
    магазин();
    const repo = репозиторий();
    const ответ = await запрос(repo, 'POST', '/api/product/image', {article: REL, id: '999'});

    expect(ответ.code).toBe(404);
    expect(ответ.data.error).toBe(SETTINGS.ошибкиСервера.товарИсчез);
    expect(файлы(repo)).toEqual(['index.mdx']);
    expect(карантин(repo)).toEqual([]);
  });

  it('обрыв скачивания не оставляет ни файла в статье, ни следа в карантине', async () => {
    магазин({картинкаОтвечает: false});
    const repo = репозиторий();
    const ответ = await запрос(repo, 'POST', '/api/product/image', {article: REL, id: '100'});

    expect(ответ.code).toBe(502);
    expect(ответ.data.error).toBe(SETTINGS.ошибкиСервера.картинкаТовараНеДоехала);
    expect(файлы(repo)).toEqual(['index.mdx']);
    expect(карантин(repo)).toEqual([]);
  });

  it('картинка товара едет в карантин, а рядом со статьёй её кладёт существующая ручка', async () => {
    магазин();
    const repo = репозиторий();
    const готово = await запрос(repo, 'POST', '/api/product/image', {article: REL, id: '100'});

    expect(готово.code).toBe(200);
    expect(готово.data.жетон).toMatch(/\.png$/);
    // До укладки в папке статьи ничего нет: обрыв на этом шаге не оставляет бесхозного файла.
    expect(файлы(repo)).toEqual(['index.mdx']);

    const уложено = await уложить(repo, готово.data.жетон, REL);
    expect(уложено.code).toBe(200);
    expect(уложено.data.src).toBe('./img-01.png');
    expect(файлы(repo)).toEqual(['img-01.png', 'index.mdx']);
  });

  it('чужой путь картинку товара не получает', async () => {
    магазин();
    const repo = репозиторий();
    const ответ = await запрос(repo, 'POST', '/api/product/image', {article: 'package.json', id: '100'});

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(SETTINGS.ошибкиСервера.неПутьСтатьи);
  });
});
