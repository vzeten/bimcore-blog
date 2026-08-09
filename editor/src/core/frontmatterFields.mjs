// Поля шапки статьи в человеческом виде: без квадратных скобок у списков, без кавычек у строк,
// короткий адрес вместо полного. Чистые функции, единое место правила.
//
// Железный инвариант: поле, которого человек не касался, при сборке возвращается ДОСЛОВНО.
// Поэтому «изменилось ли поле» решается по показанному значению, а не по обратной сборке:
// нетронутое показанное значение → исходная строка файла как есть.

import {headLine, headLines} from './articleFile.mjs';
import {isEmptyImage, normalizeSlug} from './frontmatterRules.mjs';

/** Разбор одной строки шапки на имя поля и значение. Одно место правила для всех разборов. */
export function полеСтроки(line) {
  return /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(headLine(line));
}

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
  return headLines(raw)
    .map(полеСтроки)
    .filter((found) => found !== null)
    .map((found) => {
      const {kind, display} = parseField(found[1], found[2], path, roots);
      return {key: found[1], raw: found[2], kind, display};
    });
}

/**
 * Собрать шапку обратно. Поля, чей показанный вид не менялся, возвращаются исходной строкой.
 * Только по-настоящему изменённое поле переписывается — иначе файл дрожит на ровном месте.
 *
 * `порядок` — принятый порядок полей шапки для этого рода статей (настройка `поляСоздания`).
 * По нему кладётся поле, которого в шапке ещё не было: место строки берётся из общего правила,
 * а не выбирается наугад, иначе одинаковые статьи расходятся видом шапки.
 */
export function writeFields(raw, fields, path, roots, порядок = []) {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const строки = headLines(raw);

  const собранные = строки
    .map((line) => {
      const found = полеСтроки(line);
      if (!found || !byKey.has(found[1])) return line;

      const field = byKey.get(found[1]);
      // Обложка без значения из шапки убирается целиком: пустое `image` роняет сборку сайта
      // (SPEC 2.1). Прочие поля пустыми жить могут — их заполняет человек.
      if (field.key === 'image' && isEmptyImage(field.display)) return null;

      const исходный = parseField(found[1], found[2], path, roots).display;
      if (field.display === исходный) return line;

      return `${found[1]}: ${formatField(found[1], field.kind, field.display, path, roots)}`;
    })
    .filter((line) => line !== null);

  return дописатьНовые(собранные, fields, порядок, path, roots).join('\n');
}

/**
 * Дописать поля, которых в шапке не было. Пустое значение не пишется вовсе: поле, которого
 * человек не заполнял, не должно появляться в файле — тем более пустая обложка (SPEC 2.1).
 */
function дописатьНовые(строки, fields, порядок, path, roots) {
  const итог = [...строки];

  for (const field of fields) {
    const ключиСтрок = итог.map((line) => полеСтроки(line)?.[1] ?? null);
    const ключи = ключиСтрок.filter((ключ) => ключ !== null);
    if (ключи.includes(field.key) || String(field.display ?? '').trim() === '') continue;

    // Поля вне принятого порядка не дописываем: места для них в шапке никто не назначал.
    const среди = местоПоля(ключи, порядок, field.key);
    if (среди < 0) continue;

    const куда = среди >= ключи.length ? итог.length : ключиСтрок.indexOf(ключи[среди]);
    итог.splice(куда, 0, `${field.key}: ${formatField(field.key, field.kind, field.display, path, roots)}`);
  }

  return итог;
}

/**
 * Каким по счёту встанет поле среди уже имеющихся: сразу за последним из тех, кто по принятому
 * порядку идёт раньше. Никого из них нет — перед первым, кто идёт позже; нет и таких — в конец.
 * `-1` — поля нет в принятом порядке, места для него не назначено.
 *
 * Единственное место этого правила. Считай его окно по-своему — поле показывалось бы человеку
 * не там, куда строка ляжет в файле, и после сохранения прыгало бы на другое место.
 */
export function местоПоля(ключи, порядок, ключ) {
  const место = порядок.indexOf(ключ);
  if (место < 0) return -1;

  for (let i = место - 1; i >= 0; i -= 1) {
    const свой = ключи.indexOf(порядок[i]);
    if (свой >= 0) return свой + 1;
  }

  for (let i = место + 1; i < порядок.length; i += 1) {
    const свой = ключи.indexOf(порядок[i]);
    if (свой >= 0) return свой;
  }

  return ключи.length;
}
