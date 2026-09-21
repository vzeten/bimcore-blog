// Порядок реестра «как на сайте», «последние правки» и отбор по делу (решение владельца 2026-09-21).
// Имя каждого теста повторяет формулировку правила.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {groupArticles} from '../src/core/articles.mjs';
import {filterArticles, sortArticles} from '../src/core/registry.mjs';
import {датаШапки, порядокРежима} from '../src/core/siteOrder.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

const RU_BLOG = 'i18n/ru/docusaurus-plugin-content-blog';
const ES_BLOG = 'i18n/es/docusaurus-plugin-content-blog';
const RU_DOCS = 'i18n/ru/docusaurus-plugin-content-docs/current';
const ES_DOCS = 'i18n/es/docusaurus-plugin-content-docs/current';

/** Опубликованная версия, совпадающая с сайтом: ни одного признака работы. */
function файл(p, extra = {}) {
  return {
    path: p, title: p, скрыта: false, готовность: null, правил: null, когда: 0,
    опубликован: true, отличается: false, ...extra,
  };
}

const день = (строка) => Date.parse(`${строка}T00:00:00Z`);

/** Статьи с номерами меню, как их отдаёт сервер: номер — по порядку в перечне документации. */
function свод(файлы, меню = []) {
  return groupArticles(файлы, НАСТРОЙКИ).map((статья) => {
    const место = меню.indexOf(статья.key);
    return {...статья, порядокМеню: место === -1 ? null : место};
  });
}

const какНаСайте = (статьи) => {
  const {колонка, сторона} = порядокРежима('сайт');
  return sortArticles(статьи, колонка, сторона, НАСТРОЙКИ).map((статья) => статья.key);
};

describe('дата записи ленты читается как у Docusaurus', () => {
  it('голая дата, дата в кавычках и дата со временем без пояса — всё по UTC', () => {
    expect(датаШапки('date: 2026-09-04')).toBe(день('2026-09-04'));
    expect(датаШапки("date: '2026-09-04'")).toBe(день('2026-09-04'));
    expect(датаШапки('date: 2026-09-04 10:30')).toBe(Date.parse('2026-09-04T10:30Z'));
  });

  it('нет поля или в нём не дата — пусто, а не ноль', () => {
    expect(датаШапки('title: x')).toBeNull();
    expect(датаШапки('date: когда-нибудь')).toBeNull();
  });
});

describe('порядок «как на сайте»', () => {
  it('блог идёт по дате английской версии, новые сверху, а дата перевода не решает', () => {
    const статьи = свод([
      файл('blog/old/index.mdx', {дата: день('2026-07-01')}),
      файл(`${RU_BLOG}/old/index.mdx`, {дата: день('2026-12-31')}),
      файл('blog/new/index.mdx', {дата: день('2026-09-17')}),
      файл('blog/mid/index.mdx', {дата: день('2026-09-04')}),
    ]);

    expect(какНаСайте(статьи)).toEqual(['blog:new/index.mdx', 'blog:mid/index.mdx', 'blog:old/index.mdx']);
  });

  it('равные даты разводит путь, и порядок не зависит от того, как пришёл список', () => {
    const файлы = ['c', 'a', 'b'].map((имя) => файл(`blog/${имя}/index.mdx`, {дата: день('2026-09-04')}));
    const ожидание = ['blog:a/index.mdx', 'blog:b/index.mdx', 'blog:c/index.mdx'];

    expect(какНаСайте(свод(файлы))).toEqual(ожидание);
    expect(какНаСайте(свод([...файлы].reverse()))).toEqual(ожидание);
  });

  it('запись без английской версии или без даты уходит в конец ленты', () => {
    const статьи = свод([
      файл(`${RU_BLOG}/only-ru/index.mdx`, {дата: день('2030-01-01')}),
      файл('blog/no-date/index.mdx'),
      файл('blog/dated/index.mdx', {дата: день('2025-01-01')}),
    ]);

    expect(какНаСайте(статьи)[0]).toBe('blog:dated/index.mdx');
  });

  it('документация идёт как боковое меню сайта', () => {
    const статьи = свод(
      [файл('docs/b/index.mdx'), файл('docs/a/index.mdx')],
      ['docs:b/index.mdx', 'docs:a/index.mdx'],
    );

    expect(какНаСайте(статьи)).toEqual(['docs:b/index.mdx', 'docs:a/index.mdx']);
  });

  it('во «Всех статьях» — документация по меню, потом лента по дате, потом песочница', () => {
    const статьи = свод(
      [
        файл('editor/sandbox/proba/index.mdx'),
        файл('blog/old/index.mdx', {дата: день('2026-01-01')}),
        файл('docs/second/index.mdx'),
        файл('blog/new/index.mdx', {дата: день('2026-09-01')}),
        файл('docs/first/index.mdx'),
      ],
      ['docs:first/index.mdx', 'docs:second/index.mdx', 'проба:proba/index.mdx'],
    );

    expect(какНаСайте(статьи).map((ключ) => ключ.split(':')[0])).toEqual(['docs', 'docs', 'blog', 'blog', 'проба']);
    expect(какНаСайте(статьи).slice(0, 4)).toEqual([
      'docs:first/index.mdx', 'docs:second/index.mdx', 'blog:new/index.mdx', 'blog:old/index.mdx',
    ]);
  });
});

describe('порядок «последние правки»', () => {
  it('сверху то, что меняли последним, по самой свежей из версий', () => {
    const статьи = свод([
      файл('blog/a/index.mdx', {когда: 100}),
      файл(`${RU_BLOG}/b/index.mdx`, {когда: 300}),
      файл('docs/c/index.mdx', {когда: 200}),
    ]);
    const {колонка, сторона} = порядокРежима('правки');

    expect({колонка, сторона}).toEqual({колонка: 'когда', сторона: 'вниз'});
    expect(sortArticles(статьи, колонка, сторона, НАСТРОЙКИ).map((статья) => статья.key))
      .toEqual(['blog:b/index.mdx', 'docs:c/index.mdx', 'blog:a/index.mdx']);
  });
});

/** Статья документации на трёх языках; `ru` и `es` уточняют свои версии. */
function трёхъязычная(имя, {ru = {}, es = {}} = {}) {
  return [
    файл(`docs/${имя}/index.mdx`),
    файл(`${RU_DOCS}/${имя}/index.mdx`, ru),
    файл(`${ES_DOCS}/${имя}/index.mdx`, es),
  ];
}

const отобрать = (статьи, отбор) => filterArticles(статьи, {отбор}, НАСТРОЙКИ).map((статья) => статья.key);

describe('отбор «Есть что опубликовать»', () => {
  const статьи = свод([
    ...трёхъязычная('clean'),
    ...трёхъязычная('changed', {ru: {отличается: true}}),
    ...трёхъязычная('fresh', {es: {опубликован: false, отличается: null}}),
    ...трёхъязычная('autosaved', {ru: {правкаВЧерновике: true}}),
    файл('editor/sandbox/proba/index.mdx', {опубликован: false, отличается: null}),
  ]);

  it('берёт статьи с неуехавшей правкой или неопубликованной версией, чистые — нет', () => {
    expect(отобрать(статьи, 'опубликовать').sort()).toEqual([
      'docs:autosaved/index.mdx', 'docs:changed/index.mdx', 'docs:fresh/index.mdx',
    ]);
  });

  it('песочница в отбор не попадает, даже если её ни разу не публиковали', () => {
    expect(отобрать(статьи, 'опубликовать').some((ключ) => ключ.startsWith('проба'))).toBe(false);
  });

  it('неизвестное состояние сайта статью оставляет, а не даёт ложный ноль', () => {
    const безGit = свод(трёхъязычная('clean').map((запись) => ({...запись, опубликован: null, отличается: null})));
    const безСравнения = свод(трёхъязычная('clean').map((запись) => ({...запись, отличается: null})));

    expect(отобрать(безGit, 'опубликовать')).toEqual(['docs:clean/index.mdx']);
    expect(отобрать(безСравнения, 'опубликовать')).toEqual(['docs:clean/index.mdx']);
  });
});

describe('отбор «Нужен перевод»', () => {
  const статьи = свод([
    ...трёхъязычная('full'),
    ...трёхъязычная('stub', {es: {заглушка: true}}),
    файл('docs/no-ru/index.mdx'),
    файл(`${ES_DOCS}/no-ru/index.mdx`),
    файл(`${RU_BLOG}/no-en/index.mdx`),
    файл(`${ES_BLOG}/no-en/index.mdx`),
    файл('editor/sandbox/proba/index.mdx'),
  ]);

  it('берёт статьи, где какого-то языка нет или он заглушка; песочницы нет', () => {
    expect(отобрать(статьи, 'перевод').sort()).toEqual([
      'blog:no-en/index.mdx', 'docs:no-ru/index.mdx', 'docs:stub/index.mdx',
    ]);
  });

  it('служебная страница раздела не прячется', () => {
    const раздел = свод([файл('docs/guides/index.mdx'), ...трёхъязычная('guides/child')]);
    const служебная = раздел.find((статья) => статья.служебная);

    expect(служебная).toBeDefined();
    expect(отобрать(раздел, 'перевод')).toContain(служебная.key);
  });

  it('«Все» показывает всё, включая песочницу', () => {
    expect(filterArticles(статьи, {отбор: ''}, НАСТРОЙКИ)).toHaveLength(статьи.length);
  });
});
