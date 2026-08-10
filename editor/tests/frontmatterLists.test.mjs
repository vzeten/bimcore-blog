// Имя каждого теста повторяет формулировку правила.
// Списки в шапке: метки, авторы, ключевые слова. Отдельным файлом потому, что у них своя история —
// живые статьи блога записывают их строками `- слово`, и построчный разбор про них врал.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import matter from 'gray-matter';
import {readFields, writeFields} from '../src/core/frontmatterFields.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
const КОРНИ = НАСТРОЙКИ['контент'];
const DOCS = 'docs/help/foo/index.mdx';

// Шапка читается тем же разбором, что и у Docusaurus: доказываем результат, а не строку в коде.
const прочитать = (шапка) => matter(`---\n${шапка}\n---\n`).data;

describe('списки в шапке статьи', () => {
  it('список показывается без квадратных скобок и кавычек', () => {
    expect(readFields('tags: [revit, "интерьер"]', DOCS, КОРНИ)[0])
      .toMatchObject({kind: 'list', display: 'revit, интерьер'});
  });

  it('список, записанный строками, показывается заполненным, а не пустым полем', () => {
    // Так устроены ключевые слова у двенадцати живых статей блога. Построчный разбор считал
    // такое поле пустым: окно врало человеку, а запись в него осиротила бы строки под ключом.
    const шапка = 'title: "Проба"\nkeywords:\n  - revit families\n  - интерьер';

    expect(readFields(шапка, DOCS, КОРНИ).find((поле) => поле.key === 'keywords'))
      .toMatchObject({kind: 'list', display: 'revit families, интерьер'});
  });

  it('нетронутый список, записанный строками, возвращается в файл дословно', () => {
    const шапка = 'title: "Проба"\nkeywords:\n  - revit families\n  - интерьер';

    expect(writeFields(шапка, readFields(шапка, DOCS, КОРНИ), DOCS, КОРНИ)).toBe(шапка);
  });

  it('изменённый список, записанный строками, заменяется одной строкой со скобками, без сирот', () => {
    const шапка = 'title: "Проба"\nkeywords:\n  - первое\n  - второе';
    const поля = readFields(шапка, DOCS, КОРНИ)
      .map((поле) => (поле.key === 'keywords' ? {...поле, display: 'первое, второе, третье'} : поле));
    const собрано = writeFields(шапка, поля, DOCS, КОРНИ);

    expect(собрано).toBe('title: "Проба"\nkeywords: ["первое", "второе", "третье"]');
    expect(прочитать(собрано).keywords).toEqual(['первое', 'второе', 'третье']);
  });

  it('очищенный список, записанный строками, уходит из шапки целиком', () => {
    const шапка = 'title: "Проба"\nkeywords:\n  - первое\n  - второе';
    const поля = readFields(шапка, DOCS, КОРНИ)
      .map((поле) => (поле.key === 'keywords' ? {...поле, display: ''} : поле));

    expect(writeFields(шапка, поля, DOCS, КОРНИ)).toBe('title: "Проба"');
  });

  it('список из одних запятых — это пустой список, и строка уходит, а не остаётся скобками', () => {
    // Найдено воротами живой проверкой: человек оставлял в поле запятую, программа писала
    // `tags: []` и показывала «Сохранено», а в файле поля не было — окно расходилось с диском.
    const шапка = 'title: "Проба"\ntags: [revit]';
    const поля = readFields(шапка, DOCS, КОРНИ)
      .map((поле) => (поле.key === 'tags' ? {...поле, display: ' , '} : поле));

    expect(writeFields(шапка, поля, DOCS, КОРНИ)).toBe('title: "Проба"');
  });

  it('запятая внутри самого элемента запирает поле от правки, а не рвёт его надвое', () => {
    // Человеку список показывается строкой через запятую, и такой элемент разобрался бы обратно
    // двумя: правка соседнего слова молча испортила бы опубликованную статью.
    const шапка = 'keywords: ["BIM, Revit", интерьер]';
    const поле = readFields(шапка, DOCS, КОРНИ)[0];

    expect(поле.kind).toBe('заперто');
    expect(writeFields(шапка, [{...поле, display: 'другое'}], DOCS, КОРНИ)).toBe(шапка);
  });

  it('поле, значение которого прочитать не удалось, показывается, но не переписывается', () => {
    const шапка = 'title: "Проба"\nkeywords: [не закрытая скобка';
    const поле = readFields(шапка, DOCS, КОРНИ).find((поле) => поле.key === 'keywords');

    expect(поле.kind).toBe('заперто');
    expect(writeFields(шапка, [{...поле, display: 'что угодно'}], DOCS, КОРНИ)).toBe(шапка);
  });

  it('изменённый список собирается обратно в квадратные скобки', () => {
    const fields = readFields('tags: [a, b]', DOCS, КОРНИ).map((f) => ({...f, display: 'a, b, c'}));

    expect(writeFields('tags: [a, b]', fields, DOCS, КОРНИ)).toBe('tags: ["a", "b", "c"]');
  });
});
