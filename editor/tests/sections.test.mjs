// Имя каждого теста повторяет формулировку правила.
// Разделы для формы создания: откуда они берутся и что показывают.
// Отдельно от registry.test.mjs, чтобы файл держался в пределе размера (SPEC 4.9).
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {groupArticles} from '../src/core/articles.mjs';
import {buildTree, локалиРаздела, разделыДляСоздания} from '../src/core/registry.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
const RU = 'i18n/ru/docusaurus-plugin-content-docs/current';

function файл(p, title) {
  return {path: p, title, скрыта: false, готовность: 'Черновик', правил: null, когда: 0};
}

const статьи = groupArticles(
  [
    файл('docs/guides/families/chairs/index.mdx', 'Chairs'),
    файл(`${RU}/guides/families/chairs/index.mdx`, 'Кресла'),
    файл('docs/lessons/walls/index.mdx', 'Walls'),
    файл('blog/news/index.mdx', 'News'),
  ],
  НАСТРОЙКИ,
);

describe('разделы для создания статьи', () => {
  it('разделы для создания — те же узлы, что в дереве реестра', () => {
    // Второго способа понимать разделы быть не должно: форма обязана предлагать ровно то,
    // что человек видит в дереве, иначе сервер откажет в месте, которое она сама показала.
    expect(разделыДляСоздания(статьи, НАСТРОЙКИ).map((узел) => узел.id))
      .toEqual(buildTree(статьи, НАСТРОЙКИ).map((узел) => узел.id));
  });

  it('раздел показывается понятным именем из настроек и своим уровнем вложенности', () => {
    const семейства = разделыДляСоздания(статьи, НАСТРОЙКИ).find((узел) => узел.id === 'docs/guides/families');

    expect(семейства.label).toBe('Семейства Revit');
    expect(семейства.depth).toBe(2);
  });

  it('корни родов тоже годятся: статью кладут и прямо в раздел верхнего уровня', () => {
    expect(разделыДляСоздания(статьи, НАСТРОЙКИ).map((узел) => узел.id)).toContain('docs');
    expect(разделыДляСоздания(статьи, НАСТРОЙКИ).map((узел) => узел.id)).toContain('blog');
  });

  it('статей нет — предлагать нечего, и список пуст', () => {
    // Пустой список не поломка: новые разделы создаёт отдельное задание, а не форма статьи.
    expect(разделыДляСоздания([], НАСТРОЙКИ)).toEqual([]);
  });
});

describe('в каких языках раздел существует', () => {
  it('раздел с двумя языковыми версиями существует в обоих', () => {
    expect(локалиРаздела(статьи, 'docs/guides/families').sort()).toEqual(['en', 'ru']);
  });

  it('раздел, где лежит только английская статья, по-русски не существует', () => {
    // Именно этим сервер и меряет: он отказывается заводить статью в пустой папке раздела.
    expect(локалиРаздела(статьи, 'docs/lessons')).toEqual(['en']);
  });

  it('раздел верхнего уровня считает и статьи своих подразделов', () => {
    expect(локалиРаздела(статьи, 'docs').sort()).toEqual(['en', 'ru']);
  });

  it('раздела нет вовсе — языков нет', () => {
    expect(локалиРаздела(статьи, 'docs/выдумка')).toEqual([]);
  });
});
