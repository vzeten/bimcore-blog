// Защитные правила шапки статьи, спасённые из прежней CMS.
// Единственное место, где они записаны: модуль общий для сервера и проверок.
// Нарушение любого из них роняет сборку всего сайта или ломает связь языков.

import {headLine, headLines} from './articleFile.mjs';

/**
 * Какого рода статья, на каком языке и какой у неё путь внутри своего раздела.
 * Корни приходят из настроек: код не знает, где лежит контент сайта.
 * Совпадений может быть несколько — берётся самое длинное, иначе вложенная папка
 * проиграет своему родителю.
 */
export function articlePlace(path, roots) {
  const clean = path.split('\\').join('/');

  const matched = [...roots]
    .filter((root) => clean.startsWith(`${root['папка']}/`))
    .sort((a, b) => b['папка'].length - a['папка'].length)[0];

  if (!matched) return {kind: 'вне контента', locale: null, inside: clean, наСайте: false};

  return {
    kind: matched['род'],
    locale: matched['локаль'],
    inside: clean.slice(matched['папка'].length + 1),
    наСайте: matched['наСайте'] === true,
  };
}

/**
 * Папки над статьёй внутри её раздела: у `guides/families/chairs/index.mdx` это `guides/families`.
 * Одно правило на два применения — адрес статьи и дерево разделов.
 */
export function folderChain(inside) {
  const parts = inside.split('/').filter(Boolean);
  parts.pop();
  return parts.slice(0, -1);
}

/**
 * Адрес статьи по правилам сайта: у документации абсолютный с префиксом раздела,
 * у блога относительный. Локаль в адрес не попадает — её добавляет сам сайт.
 * Уже абсолютный адрес не переписывается, иначе раздел задвоится.
 */
export function normalizeSlug(path, slug, roots) {
  const value = String(slug ?? '').trim();
  if (value === '') return value;

  const place = articlePlace(path, roots);
  if (place.kind === 'blog') return value.replace(/^\/+/, '');
  if (place.kind !== 'docs') return value;
  if (value.startsWith('/')) return value;

  return `/${[...folderChain(place.inside), value].join('/')}`;
}

/**
 * Видимость статьи живёт в её шапке: `unlisted` — поле Docusaurus, а не наша выдумка,
 * поэтому имя поля в коде. Хранить видимость ещё и в состоянии нельзя: сайт читает только шапку.
 */
export function isUnlisted(frontmatterRaw) {
  return /^unlisted:\s*true\s*$/m.test(String(frontmatterRaw ?? ''));
}

/**
 * Переключение видимости. Остальные строки шапки не трогаются вовсе.
 * Строка, ставшая последней, теряет одинокий `\r`: следом идёт свой перевод строки, и вдвоём
 * они дают `\r\r\n`, после которого последнее поле шапки перестаёт читаться.
 */
export function setUnlisted(frontmatterRaw, hidden) {
  const lines = headLines(frontmatterRaw);
  const at = lines.findIndex((line) => /^unlisted:/.test(headLine(line)));

  if (!hidden) {
    const без = lines.filter((line, index) => index !== at);
    if (без.length > 0) без[без.length - 1] = headLine(без[без.length - 1]);
    return без.join('\n');
  }
  if (at >= 0) {
    lines[at] = 'unlisted: true';
    return lines.join('\n');
  }

  const tail = [...lines];
  while (tail.length > 0 && tail[tail.length - 1].trim() === '') tail.pop();
  if (tail.length > 0) tail[tail.length - 1] = headLine(tail[tail.length - 1]);

  return [...tail, 'unlisted: true'].join('\n');
}

/** Пустое или пробельное поле обложки роняет сборку всего сайта, поэтому ключ убирается целиком. */
export function isEmptyImage(value) {
  return String(value ?? '').trim() === '';
}

/** Адреса разных языков одной статьи обязаны совпадать, иначе ломается переключатель языка. */
export function sameSlugAcrossLocales(ownSlug, otherSlug) {
  return String(ownSlug ?? '').trim() === String(otherSlug ?? '').trim();
}

/**
 * Приводит строки шапки в безопасный вид.
 * Возвращает новый текст шапки и список того, что было исправлено.
 */
export function safeFrontmatter(path, raw, roots) {
  const fixed = [];
  const lines = headLines(raw);
  const out = [];

  for (const line of lines) {
    const found = /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(headLine(line));
    if (!found) {
      out.push(line);
      continue;
    }

    const [, key, value] = found;

    if (key === 'image' && isEmptyImage(value)) {
      fixed.push('убрано пустое поле обложки: оно роняет сборку сайта');
      continue;
    }

    if (key === 'slug') {
      const next = normalizeSlug(path, value, roots);
      if (next !== value.trim()) {
        fixed.push(`адрес статьи приведён к правилу раздела: ${value.trim()} → ${next}`);
        out.push(`${key}: ${next}`);
        continue;
      }
    }

    out.push(line);
  }

  return {frontmatterRaw: out.join('\n'), fixed};
}
