// Метка learn у ссылок в магазин (plugins/shop-utm.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';

import shopUtm, {сМеткой, меткаСтатьи} from '../plugins/shop-utm.mjs';

test('ссылка на магазин получает utm_source=learn, носитель и статью; прочие ссылки и уже помеченные не трогаются', () => {
  assert.equal(
    сМеткой('https://bimcore.one/products/door-revit-families#set', {носитель: 'article', статья: 'ru/doors'}),
    'https://bimcore.one/products/door-revit-families?utm_source=learn&utm_medium=article&utm_campaign=ru%2Fdoors#set',
  );
  assert.equal(сМеткой('https://community.bimcore.one/', {носитель: 'article', статья: 'x'}), 'https://community.bimcore.one/');
  assert.equal(сМеткой('https://learn.bimcore.one/blog/', {носитель: 'article', статья: 'x'}), 'https://learn.bimcore.one/blog/');
  assert.equal(сМеткой('/guides/', {носитель: 'article', статья: 'x'}), '/guides/');
  assert.equal(сМеткой('https://bimcore.one/?utm_source=mail', {носитель: 'article', статья: 'x'}), 'https://bimcore.one/?utm_source=mail');
});

test('метка статьи — язык и папка статьи', () => {
  assert.equal(меткаСтатьи('C:/site/docs/guides/families/kitchen-for-revit/index.mdx'), 'en/kitchen-for-revit');
  assert.equal(меткаСтатьи('C:\\site\\i18n\\ru\\docusaurus-plugin-content-blog\\speed-up-revit\\index.mdx'), 'ru/speed-up-revit');
  assert.equal(меткаСтатьи('/site/docs/intro.mdx'), 'en/intro');
});

test('плагин помечает markdown-ссылку и свойство карточки товара', () => {
  const дерево = {type: 'root', children: [
    {type: 'paragraph', children: [{type: 'link', url: 'https://bimcore.one/products/a', children: []}]},
    {type: 'mdxJsxFlowElement', name: 'ProductCard', attributes: [
      {type: 'mdxJsxAttribute', name: 'buyUrl', value: 'https://bimcore.one/products/b'},
      {type: 'mdxJsxAttribute', name: 'image', value: './a.png'},
    ], children: []},
  ]};
  shopUtm()(дерево, {path: '/site/i18n/es/docusaurus-plugin-content-docs/current/guides/x/index.mdx'});
  assert.match(дерево.children[0].children[0].url, /utm_source=learn&utm_medium=article&utm_campaign=es%2Fx$/);
  assert.match(дерево.children[1].attributes[0].value, /utm_medium=productcard/);
  assert.equal(дерево.children[1].attributes[1].value, './a.png');
});
