// Поля шапки статьи в человеческом виде: без квадратных скобок у списков, без кавычек у строк,
// короткий адрес вместо полного. Чистые функции, единое место правила.
//
// Железный инвариант: поле, которого человек не касался, при сборке возвращается ДОСЛОВНО.
// Поэтому «изменилось ли поле» решается по показанному значению, а не по обратной сборке:
// нетронутое показанное значение → исходная строка файла как есть.

import {normalizeSlug} from './frontmatterRules.mjs';

// Имена полей задал Docusaurus, не мы, — это чужой формат, а не наша настройка.
const СПИСКИ = ['tags', 'authors', 'keywords'];

const снятьКавычки = (s) => s.replace(/^["'](.*)["']$/s, '$1');

/** Какого рода поле и как показать его значение человеку. */
export function parseField(key, raw, path, roots) {
  const value = String(raw ?? '');
  const trimmed = value.trim();

  if (СПИСКИ.includes(key) && trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const items = trimmed.slice(1, -1).split(',').map((item) => снятьКавычки(item.trim())).filter(Boolean);
    return {kind: 'list', display: items.join(', ')};
  }

  if (key === 'slug' && trimmed !== '') {
    // Человек вводит короткий адрес; префикс раздела добавляет программа при сохранении.
    return {kind: 'slug', display: trimmed.split('/').filter(Boolean).pop() ?? trimmed};
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return {kind: 'text', display: снятьКавычки(trimmed)};
  }

  return {kind: 'plain', display: value};
}

/** Собрать значение поля обратно в строку YAML из показанного человеку вида. */
export function formatField(key, kind, display, path, roots) {
  if (kind === 'list') {
    // Элемент берётся в кавычки только когда без них YAML прочитает его неверно (пробел, запятая).
    const items = display.split(',').map((item) => item.trim()).filter(Boolean)
      .map((item) => (/[\s,]/.test(item) ? `"${item}"` : item));
    return `[${items.join(', ')}]`;
  }

  if (kind === 'slug') return normalizeSlug(path, display, roots);
  if (kind === 'text') return `"${display}"`;
  return display;
}

/** Разбор шапки в поля с человеческим видом. Многострочные и сложные значения не трогаются. */
export function readFields(raw, path, roots) {
  return String(raw)
    .split(/\r?\n/)
    .map((line) => /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(line))
    .filter((found) => found !== null)
    .map((found) => {
      const {kind, display} = parseField(found[1], found[2], path, roots);
      return {key: found[1], raw: found[2], kind, display};
    });
}

/**
 * Собрать шапку обратно. Поля, чей показанный вид не менялся, возвращаются исходной строкой.
 * Только по-настоящему изменённое поле переписывается — иначе файл дрожит на ровном месте.
 */
export function writeFields(raw, fields, path, roots) {
  const byKey = new Map(fields.map((field) => [field.key, field]));

  return String(raw)
    .split(/\r?\n/)
    .map((line) => {
      const found = /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(line);
      if (!found || !byKey.has(found[1])) return line;

      const field = byKey.get(found[1]);
      const исходный = parseField(found[1], found[2], path, roots).display;
      if (field.display === исходный) return line;

      return `${found[1]}: ${formatField(found[1], field.kind, field.display, path, roots)}`;
    })
    .join('\n');
}
