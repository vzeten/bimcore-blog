// Карточка товара: ссылки из таблицы товаров, выбор оплаты по языку страницы, метки переходов, подтягивание
// названия и картинки из инструкции, надписи в переводах (решение владельца 2026-10-01, база
// marketing/data/learn-funnel-strategy.md, 12.3).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ссылкиКарточки, сМеткойКарточки} from '../src/components/productCardLinks.js';
import {карточкаИнструкции, модульКаталога} from '../plugins/product-cards/index.mjs';

const КОРЕНЬ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ДАННЫЕ = JSON.parse(fs.readFileSync(path.join(КОРЕНЬ, 'src/data/products.json'), 'utf8'));
const КУХНИ = '543629545';
const параметры = (адрес) => Object.fromEntries(new URL(адрес).searchParams);

test('RU: выбор оплаты из трёх способов в порядке таблицы, у каждого метка статьи и свой способ', () => {
  const {оплата, главная} = ссылкиКарточки({данные: ДАННЫЕ, код: КУХНИ, язык: 'ru', кампания: 'ru/kitchen'});
  assert.deepEqual(оплата.map((с) => [с.код, new URL(с.href).host, параметры(с.href).currency ?? '']),
    [['rub', 'int-lines.com', 'RUB'], ['kzt', 'int-lines.com', 'KZT'], ['world', 'bimcore.one', '']]);
  for (const с of оплата) {
    assert.deepEqual(
      {...параметры(с.href), currency: undefined},
      {currency: undefined, utm_source: 'learn', utm_medium: 'productcard', utm_campaign: 'ru/kitchen', utm_content: с.код});
  }
  assert.equal(главная, оплата.find((с) => с.код === 'world').href, 'без скриптов главная ведёт в магазин для всех стран');
});

test('EN и ES: выбора нет, главная кнопка — сразу bimcore.one', () => {
  for (const язык of ['en', 'es']) {
    const {оплата, главная} = ссылкиКарточки({данные: ДАННЫЕ, код: КУХНИ, язык, кампания: `${язык}/kitchen`});
    assert.equal(оплата.length, 0);
    assert.equal(new URL(главная).host, 'bimcore.one');
    assert.equal(параметры(главная).utm_content, 'world');
  }
});

test('товара нет в таблице: только адрес из статьи, без выбора даже на русской странице', () => {
  const buyUrl = 'https://bimcore.one/products/x?utm_campaign=ru%2Fstatya';
  const {оплата, главная, инструкция} = ссылкиКарточки({данные: ДАННЫЕ, код: '000', язык: 'ru', buyUrl});
  assert.equal(оплата.length, 0);
  assert.equal(параметры(главная).utm_campaign, 'ru/statya', 'кампанию, поставленную сборкой, не перетирает');
  assert.equal(инструкция, null);
});

test('инструкция набора — из таблицы, без языка в пути', () => {
  assert.equal(ссылкиКарточки({данные: ДАННЫЕ, код: КУХНИ, язык: 'es'}).инструкция, '/guides/families/kitchen-for-revit/');
});

test('метки сохраняют прежние параметры ссылки', () => {
  const адрес = сМеткойКарточки('https://int-lines.com/a/?ref=x', {кампания: 'ru/a', содержимое: 'rub', валюта: 'RUB'});
  assert.equal(параметры(адрес).ref, 'x');
  assert.equal(параметры(адрес).currency, 'RUB');
});

test('таблица товаров: у каждого товара оба магазина, адреса настоящие, инструкция есть на английском', () => {
  for (const [код, товар] of Object.entries(ДАННЫЕ.товары)) {
    assert.equal(new URL(товар.bimcore).host, 'bimcore.one', код);
    assert.equal(new URL(товар['int-lines']).host, 'int-lines.com', код);
    if (!товар.инструкция) continue;
    const папки = товар.инструкция === '/guides/templates/'
      ? ['i18n/ru/docusaurus-plugin-content-docs/current']
      : ['docs'];
    for (const папка of папки) {
      assert.ok(fs.existsSync(path.join(КОРЕНЬ, папка, товар.инструкция, 'index.mdx')), `${код}: нет ${папка}${товар.инструкция}`);
    }
  }
  const магазины = new Set(ДАННЫЕ.оплата.варианты.map((в) => в.магазин));
  for (const товар of Object.values(ДАННЫЕ.товары)) for (const м of магазины) assert.ok(товар[м]);
});

test('надписи карточки есть в переводах RU и ES — те же ключи, что вызывает компонент', () => {
  const компонент = fs.readFileSync(path.join(КОРЕНЬ, 'src/components/ProductCard.jsx'), 'utf8');
  const ключи = [...компонент.matchAll(/id: '(productCard\.[\w.]+)'/g)].map((m) => m[1]);
  assert.ok(ключи.length >= 11);
  for (const язык of ['ru', 'es']) {
    const переводы = JSON.parse(fs.readFileSync(path.join(КОРЕНЬ, `i18n/${язык}/code.json`), 'utf8'));
    for (const ключ of ключи) assert.ok(переводы[ключ]?.message, `${язык}: нет ${ключ}`);
  }
  for (const вариант of ДАННЫЕ.оплата.варианты) {
    assert.ok(ключи.includes(`productCard.payment.${вариант.код}`), `нет надписи способа ${вариант.код}`);
  }
});

test('из инструкции берутся название, описание, подпись и путь картинки по её импорту', () => {
  const текст = [
    "import productPreview from './product.png';",
    '',
    '<ProductCard',
    '  name="Кухни для Revit"',
    '  description="Шкафы и столешницы."',
    '  image={productPreview}',
    '  imageAlt="Набор кухни"',
    '  buyUrl="https://bimcore.one/products/k?x=1"',
    '/>',
  ].join('\n');
  const файл = path.join(КОРЕНЬ, 'docs/guides/families/k/index.mdx');
  const карточка = карточкаИнструкции(текст, файл);
  assert.deepEqual({...карточка, картинка: path.relative(КОРЕНЬ, карточка.картинка).split(path.sep).join('/')}, {
    name: 'Кухни для Revit', description: 'Шкафы и столешницы.', imageAlt: 'Набор кухни',
    картинка: 'docs/guides/families/k/product.png',
  });
  assert.equal(карточкаИнструкции('без карточки', файл), null);

  const модуль = модульКаталога({[КУХНИ]: карточка}, КОРЕНЬ);
  assert.match(модуль, /import картинка0 from "@site\/docs\/guides\/families\/k\/product\.png";/);
  assert.match(модуль, /"543629545": \{\.\.\.\{"name":"Кухни для Revit"/);
});

test('у каждой инструкции из таблицы находится карточка с картинкой на всех её языках', () => {
  const корни = {
    en: 'docs',
    ru: 'i18n/ru/docusaurus-plugin-content-docs/current',
    es: 'i18n/es/docusaurus-plugin-content-docs/current',
  };
  let найдено = 0;
  for (const [код, товар] of Object.entries(ДАННЫЕ.товары)) {
    if (!товар.инструкция) continue;
    for (const корень of Object.values(корни)) {
      const файл = path.join(КОРЕНЬ, корень, товар.инструкция, 'index.mdx');
      if (!fs.existsSync(файл)) continue;
      // Страница инструкции бывает без карточки (английский шаблон): тогда товар просто не подтягивается.
      const текст = fs.readFileSync(файл, 'utf8');
      if (!/<ProductCard\b/.test(текст)) continue;
      const карточка = карточкаИнструкции(текст, файл);
      assert.ok(карточка?.name, `${код}: ${файл}`);
      assert.ok(fs.existsSync(карточка.картинка), `${код}: нет картинки ${карточка.картинка}`);
      найдено += 1;
    }
  }
  assert.equal(найдено, 64, 'все 64 карточки инструкций (21 EN, 22 RU, 21 ES)');
});
