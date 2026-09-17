// Имя каждой проверки повторяет правило.
// Шаг, который схлопывает удвоенный префикс локали в ссылках markdown-копий для ИИ-агентов:
// плагин llms-txt прибавляет baseUrl локали к пути, где префикс уже есть (#73).
import test from 'node:test';
import assert from 'node:assert/strict';

import {безДвойнойЛокали, собратьСсылкиЛокали} from '../plugins/llms-locale-links.mjs';

/** Кусок дерева markdown: ссылки лежат в детях абзаца, как их отдаёт разбор. */
const дерево = (адреса) => ({
  type: 'root',
  children: [{
    type: 'paragraph',
    children: адреса.map((url) => ({type: 'link', url, children: []})),
  }],
});

const адреса = (узел) => узел.children[0].children.map((ссылка) => ссылка.url);

test('удвоенный префикс локали схлопывается, остальной адрес не меняется', () => {
  const дом = 'https://learn.bimcore.one';
  assert.equal(безДвойнойЛокали(`${дом}/ru/ru/blog/statya/.md`, 'ru', дом), `${дом}/ru/blog/statya/.md`);
  assert.equal(безДвойнойЛокали(`${дом}/ru/ru/blog/tags/revit`, 'ru', дом), `${дом}/ru/blog/tags/revit`);
  assert.equal(безДвойнойЛокали(`${дом}/ru/ru`, 'ru', дом), `${дом}/ru`);
});

test('верный адрес остаётся как есть: одиночный префикс, чужая локаль, внешняя ссылка', () => {
  const дом = 'https://learn.bimcore.one';
  assert.equal(безДвойнойЛокали(`${дом}/ru/blog/statya/.md`, 'ru', дом), `${дом}/ru/blog/statya/.md`);
  assert.equal(безДвойнойЛокали(`${дом}/es/es/blog/`, 'ru', дом), `${дом}/es/es/blog/`);
  assert.equal(безДвойнойЛокали('https://github.com/ru/ru', 'ru', дом), 'https://github.com/ru/ru');
});

test('шаг правит ссылки всего дерева, а у языка по умолчанию не делает ничего', () => {
  const дом = 'https://learn.bimcore.one';
  const сЛокалью = дерево([`${дом}/es/es/blog/uno/.md`, `${дом}/es/blog/dos/.md`, '#faq']);
  собратьСсылкиЛокали({локаль: 'es', адресСайта: дом})(сЛокалью);
  assert.deepEqual(адреса(сЛокалью), [`${дом}/es/blog/uno/.md`, `${дом}/es/blog/dos/.md`, '#faq']);

  const поУмолчанию = дерево([`${дом}/ru/ru/blog/statya/.md`]);
  собратьСсылкиЛокали({локаль: '', адресСайта: дом})(поУмолчанию);
  assert.deepEqual(адреса(поУмолчанию), [`${дом}/ru/ru/blog/statya/.md`]);
});

test('адрес сайта с косой чертой в конце правило не выключает', () => {
  const дом = 'https://learn.bimcore.one';
  assert.equal(безДвойнойЛокали(`${дом}/ru/ru/blog/statya/.md`, 'ru', `${дом}/`), `${дом}/ru/blog/statya/.md`);
});

test('узлы без ссылок и без детей шаг проходит молча', () => {
  const шаг = собратьСсылкиЛокали({локаль: 'es', адресСайта: 'https://learn.bimcore.one'});
  assert.doesNotThrow(() => шаг({type: 'root', children: [{type: 'paragraph'}, {type: 'link'}]}));
});
