// Имя каждого теста повторяет формулировку правила.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseField, readFields, writeFields} from '../src/core/frontmatterFields.mjs';
import {walk} from '../src/adapters/library.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(EDITOR, '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
const КОРНИ = НАСТРОЙКИ['контент'];
const DOCS = 'docs/help/foo/index.mdx';

describe('поля шапки в человеческом виде', () => {
  it('список показывается без квадратных скобок и кавычек', () => {
    expect(parseField('tags', '[revit, "интерьер"]', DOCS, КОРНИ)).toEqual({kind: 'list', display: 'revit, интерьер'});
  });

  it('строка показывается без кавычек', () => {
    expect(parseField('sidebar_label', '"Проба"', DOCS, КОРНИ)).toEqual({kind: 'text', display: 'Проба'});
  });

  it('адрес документации показывается коротким, без пути раздела', () => {
    expect(parseField('slug', '/help/install-plugin', DOCS, КОРНИ)).toEqual({kind: 'slug', display: 'install-plugin'});
  });

  it('изменённый список собирается обратно в квадратные скобки', () => {
    const fields = readFields('tags: [a, b]', DOCS, КОРНИ).map((f) => ({...f, display: 'a, b, c'}));
    expect(writeFields('tags: [a, b]', fields, DOCS, КОРНИ)).toBe('tags: [a, b, c]');
  });

  it('изменённая строка собирается обратно в кавычки', () => {
    const fields = readFields('sidebar_label: "Старое"', DOCS, КОРНИ).map((f) => ({...f, display: 'Новое'}));
    expect(writeFields('sidebar_label: "Старое"', fields, DOCS, КОРНИ)).toBe('sidebar_label: "Новое"');
  });

  it('короткий адрес документации при сохранении получает префикс раздела', () => {
    const fields = readFields('slug: /help/old', DOCS, КОРНИ).map((f) => ({...f, display: 'install-plugin'}));
    expect(writeFields('slug: /help/old', fields, DOCS, КОРНИ)).toBe('slug: /help/install-plugin');
  });

  it('элемент списка с пробелом при сборке берётся в кавычки', () => {
    const fields = readFields('tags: [a]', DOCS, КОРНИ).map((f) => ({...f, display: 'a, две буквы'}));
    expect(writeFields('tags: [a]', fields, DOCS, КОРНИ)).toBe('tags: [a, "две буквы"]');
  });

  it('последнее поле шапки не теряется, когда строка кончается одиноким возвратом каретки', () => {
    // Так выглядит шапка файла, который уже правился с windows-переводами строк. Одинокий `\r` —
    // часть перевода строки, а не значения: без этого правила поле пропадает из окна вовсе,
    // и человек не может ни увидеть обложку, ни поменять её.
    const шапка = 'title: "Проба"\r\nimage: ./cover.png\r';
    const поля = readFields(шапка, DOCS, КОРНИ);

    expect(поля.map((поле) => поле.key)).toEqual(['title', 'image']);
    expect(поля[1].display).toBe('./cover.png');
  });

  it('одинокий возврат каретки не попадает в значение поля', () => {
    const поля = readFields('image: ./cover.png\r', DOCS, КОРНИ);
    expect(поля[0].display).toBe('./cover.png');
  });

  it('нетронутая строка с одиноким возвратом каретки возвращается дословно', () => {
    // Разбирать очищенную строку, а возвращать исходную: иначе одно только открытие статьи
    // переписывало бы файл (SPEC 5.1). Лишний знак снимается при настоящей правке, а не сам собой.
    const шапка = 'title: "Проба"\r\nimage: ./cover.png\r';
    expect(writeFields(шапка, readFields(шапка, DOCS, КОРНИ), DOCS, КОРНИ))
      .toBe('title: "Проба"\nimage: ./cover.png\r');
  });

  it('правка поля рядом снимает одинокий возврат каретки с изменённой строки', () => {
    const шапка = 'title: "Проба"\r\nimage: ./cover.png\r';
    const поля = readFields(шапка, DOCS, КОРНИ).map((f) => (f.key === 'image' ? {...f, display: './cover.jpg'} : f));

    expect(writeFields(шапка, поля, DOCS, КОРНИ)).toBe('title: "Проба"\nimage: ./cover.jpg');
  });

  it('поле, которого в шапке не было, встаёт на место из принятого порядка полей', () => {
    // Место строки берётся из общего правила рода, а не выбирается наугад: у одинаковых статей
    // шапка обязана выглядеть одинаково.
    const порядок = НАСТРОЙКИ['поляСоздания']['docs']['порядок'];
    const шапка = 'title: "Проба"\nslug: /help/foo\ndescription: "О чём"\nunlisted: true';
    const fields = [...readFields(шапка, DOCS, КОРНИ), {key: 'image', raw: '', kind: 'plain', display: './cover.png'}];

    expect(writeFields(шапка, fields, DOCS, КОРНИ, порядок))
      .toBe('title: "Проба"\nslug: /help/foo\ndescription: "О чём"\nimage: ./cover.png\nunlisted: true');
  });

  it('обложка дописывается и в шапку с windows-переводами строк', () => {
    const порядок = НАСТРОЙКИ['поляСоздания']['docs']['порядок'];
    const шапка = 'title: "Проба"\r\nslug: /help/foo\r\nunlisted: true';
    const fields = [...readFields(шапка, DOCS, КОРНИ), {key: 'image', raw: '', kind: 'plain', display: './cover.jpg'}];

    expect(writeFields(шапка, fields, DOCS, КОРНИ, порядок))
      .toBe('title: "Проба"\nslug: /help/foo\nimage: ./cover.jpg\nunlisted: true');
  });

  it('пустая обложка в шапку не дописывается', () => {
    // Пустое `image` роняет сборку всего сайта (SPEC 2.1), а поле, которого человек не заполнял,
    // в файле появляться не должно.
    const порядок = НАСТРОЙКИ['поляСоздания']['docs']['порядок'];
    const шапка = 'title: "Проба"\nunlisted: true';
    const fields = [...readFields(шапка, DOCS, КОРНИ), {key: 'image', raw: '', kind: 'plain', display: ''}];

    expect(writeFields(шапка, fields, DOCS, КОРНИ, порядок)).toBe(шапка);
  });

  it('очистка обложки убирает строку из шапки, а не оставляет пустое значение', () => {
    const шапка = 'title: "Проба"\nimage: ./cover.png\nunlisted: true';
    const fields = readFields(шапка, DOCS, КОРНИ).map((f) => (f.key === 'image' ? {...f, display: '  '} : f));

    expect(writeFields(шапка, fields, DOCS, КОРНИ)).toBe('title: "Проба"\nunlisted: true');
  });

  it('поле вне принятого порядка в шапку не дописывается', () => {
    // Места для него никто не назначал: выдуманное место расходится от статьи к статье.
    const порядок = НАСТРОЙКИ['поляСоздания']['docs']['порядок'];
    const шапка = 'title: "Проба"';
    const fields = [...readFields(шапка, DOCS, КОРНИ), {key: 'draft', raw: '', kind: 'plain', display: 'true'}];

    expect(writeFields(шапка, fields, DOCS, КОРНИ, порядок)).toBe(шапка);
  });

  it('обложка встаёт в конец, когда всех соседей по порядку в шапке нет', () => {
    const порядок = НАСТРОЙКИ['поляСоздания']['docs']['порядок'];
    const шапка = 'title: "Проба"';
    const fields = [...readFields(шапка, DOCS, КОРНИ), {key: 'image', raw: '', kind: 'plain', display: './cover.png'}];

    expect(writeFields(шапка, fields, DOCS, КОРНИ, порядок)).toBe('title: "Проба"\nimage: ./cover.png');
  });

  it('нетронутое поле возвращается дословно на всех настоящих статьях сайта', () => {
    const files = КОРНИ.flatMap((root) => walk(path.join(REPO, root['папка'])));

    for (const file of files) {
      const rel = path.relative(REPO, file).split(path.sep).join('/');
      const raw = fs.readFileSync(file, 'utf8');
      const head = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
      if (!head) continue;

      const шапка = head[1];
      const собрано = writeFields(шапка, readFields(шапка, rel, КОРНИ), rel, КОРНИ);
      expect(собрано, rel).toBe(шапка.replace(/\r\n/g, '\n'));
    }
  });
});
