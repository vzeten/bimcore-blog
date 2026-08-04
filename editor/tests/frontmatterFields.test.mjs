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
