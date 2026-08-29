// Ручка товаров: каталог берётся готовым из собранного сайта, а картинка товара идёт в статью
// той же защищённой дорогой, что и файл человека.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {productsRoute} from '../src/adapters/productsRoute.mjs';
import {НАСТРОЙКИ, PNG, REL, карантин, репозиторий, уложить, файлы} from './intakeHarness.mjs';

const SETTINGS = {
  ...НАСТРОЙКИ,
  сервер: {порт: 4780, пределТелаМБ: 25},
  ошибкиСервера: {
    ...НАСТРОЙКИ.ошибкиСервера,
    нетКаталогаТоваров: 'каталога товаров нет',
    товарИсчез: 'этого товара в магазине больше нет',
    картинкаТовараНеДоехала: 'картинку товара скачать не удалось',
  },
};

const ТОВАР = {
  id: '100',
  названия: {en: 'Armchair Revit Families'},
  адрес: 'https://bimcore.one/products/armchair',
  картинка: 'https://cdn/armchair.png',
  категория: {en: 'Revit Families', ru: 'Семейства Revit'},
  sku: 'BC-1',
};

/** Каталог, каким его кладёт в собранный сайт сборка. `текст` — испорченный файл вместо каталога. */
function каталог(repo, {текст} = {}) {
  fs.mkdirSync(path.join(repo, 'build'), {recursive: true});
  fs.writeFileSync(
    path.join(repo, 'build', 'product-catalog.json'),
    текст ?? JSON.stringify({язык: 'en', товары: [ТОВАР]}),
    'utf8',
  );
}

const картинкаОтвечает = (ok = true) => vi.stubGlobal('fetch', async () => (ok
  ? {ok: true, arrayBuffer: async () => PNG}
  : {ok: false, status: 404}));

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

afterEach(() => vi.unstubAllGlobals());

describe('каталог товаров и картинка товара', () => {
  it('каталог доходит до окна таким, как его записала сборка', async () => {
    const repo = репозиторий();
    каталог(repo);
    const ответ = await запрос(repo, 'GET', '/api/products');

    expect(ответ.code).toBe(200);
    expect(ответ.data.товары).toEqual([ТОВАР]);
  });

  it('каталога нет — понятный отказ, статья не меняется', async () => {
    const repo = репозиторий();
    const ответ = await запрос(repo, 'POST', '/api/product/image', {article: REL, id: '100'});

    expect(ответ.code).toBe(503);
    expect(ответ.data.error).toBe(SETTINGS.ошибкиСервера.нетКаталогаТоваров);
    expect(файлы(repo)).toEqual(['index.mdx']);
  });

  it('испорченный каталог — тот же отказ, а не догадка', async () => {
    const repo = репозиторий();
    каталог(repo, {текст: '{не json'});
    const ответ = await запрос(repo, 'GET', '/api/products');

    expect(ответ.code).toBe(503);
    expect(ответ.data.error).toBe(SETTINGS.ошибкиСервера.нетКаталогаТоваров);
  });

  it('товар исчез из каталога — отказ, а не чужая картинка', async () => {
    const repo = репозиторий();
    каталог(repo);
    const ответ = await запрос(repo, 'POST', '/api/product/image', {article: REL, id: '999'});

    expect(ответ.code).toBe(404);
    expect(ответ.data.error).toBe(SETTINGS.ошибкиСервера.товарИсчез);
    expect(файлы(repo)).toEqual(['index.mdx']);
    expect(карантин(repo)).toEqual([]);
  });

  it('обрыв скачивания не оставляет ни файла в статье, ни следа в карантине', async () => {
    const repo = репозиторий();
    каталог(repo);
    картинкаОтвечает(false);
    const ответ = await запрос(repo, 'POST', '/api/product/image', {article: REL, id: '100'});

    expect(ответ.code).toBe(502);
    expect(ответ.data.error).toBe(SETTINGS.ошибкиСервера.картинкаТовараНеДоехала);
    expect(файлы(repo)).toEqual(['index.mdx']);
    expect(карантин(repo)).toEqual([]);
  });

  it('картинка едет в карантин, а рядом со статьёй её кладёт существующая ручка', async () => {
    const repo = репозиторий();
    каталог(repo);
    картинкаОтвечает();
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
    const repo = репозиторий();
    каталог(repo);
    const ответ = await запрос(repo, 'POST', '/api/product/image', {article: 'package.json', id: '100'});

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(SETTINGS.ошибкиСервера.неПутьСтатьи);
  });
});
