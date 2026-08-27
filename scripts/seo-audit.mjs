#!/usr/bin/env node
/**
 * seo-audit — проверка ГОТОВОЙ сборки: не выдаёт ли сайт непереведённую
 * страницу за полноценный перевод.
 *
 * Почему после сборки, а не до. Отсутствие перевода — разрешённое состояние
 * сайта, и валить сборку из-за него нельзя. Проверять надо не исходники, а
 * результат: что реально попало в HTML, sitemap и llms.txt. Поэтому запуск
 * идёт следующим шагом после `npm run build`.
 *
 * Что считается поломкой:
 *   • непереведённая страница осталась без <meta name="robots" ... noindex>;
 *   • она попала в sitemap локали или в llms.txt (включая markdown-копию);
 *   • на неё указывает hreflang или og:locale:alternate как на перевод;
 *   • обратный перекос: у настоящего перевода появился noindex, он выпал из
 *     sitemap или потерял свои языковые ссылки.
 *
 * Запуск:
 *   node scripts/seo-audit.mjs            папка build
 *   node scripts/seo-audit.mjs <dir>      другая папка сборки
 *
 * Коды выхода: 0 — чисто; 1 — есть поломки.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  buildTranslationMap,
  localeUrlPath,
} from '../plugins/translation-map/map.mjs';
import {defaultLocale, locales} from '../plugins/translation-map/locales.mjs';

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(siteDir, process.argv[2] ?? 'build');

const problems = [];
const warnings = [];
const fail = (where, message) => problems.push({where, message});

// ---------- разбор собранного HTML ----------

// HTML на выходе минифицирован: значения атрибутов бывают без кавычек.
const ATTR = /([a-zA-Z][a-zA-Z0-9:_-]*)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function parseAttributes(tag) {
  const attrs = {};
  // имя самого тега отбрасываем, иначе оно попадёт в атрибуты
  const body = tag.replace(/^<\s*[a-zA-Z]+/, '');
  for (const m of body.matchAll(ATTR)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

function tags(html, name) {
  const re = new RegExp(`<${name}\\b[^>]*>`, 'gi');
  return (html.match(re) ?? []).map(parseAttributes);
}

/** Путь без домена: 'https://learn.bimcore.one/es/x/' → '/es/x/'. */
function urlPath(href) {
  return href.replace(/^https?:\/\/[^/]+/, '');
}

function hasNoIndex(html) {
  return tags(html, 'meta').some(
    (a) =>
      a.name?.toLowerCase() === 'robots' &&
      (a.content ?? '').toLowerCase().includes('noindex'),
  );
}

/** Языковые ссылки страницы: пути переводов и отдельно x-default. */
function alternates(html) {
  const links = tags(html, 'link').filter(
    (a) => a.rel === 'alternate' && a.hreflang,
  );
  const translations = new Set();
  let xDefault = null;
  for (const link of links) {
    if (link.hreflang === 'x-default') xDefault = urlPath(link.href ?? '');
    else translations.add(urlPath(link.href ?? ''));
  }
  return {translations, xDefault};
}

function ogAlternates(html) {
  return new Set(
    tags(html, 'meta')
      .filter((a) => a.property === 'og:locale:alternate')
      .map((a) => a.content),
  );
}

// ---------- файлы сборки ----------

function localeDir(locale) {
  return locale === defaultLocale ? outDir : path.join(outDir, locale);
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

const sitemapByLocale = new Map();
const llmsByLocale = new Map();

for (const locale of locales) {
  sitemapByLocale.set(
    locale,
    readIfExists(path.join(localeDir(locale), 'sitemap.xml')) ?? '',
  );
  llmsByLocale.set(
    locale,
    readIfExists(path.join(localeDir(locale), 'llms.txt')) ?? '',
  );
}

const inSitemap = (locale, urlPathValue) =>
  sitemapByLocale.get(locale).includes(`<loc>`) &&
  sitemapByLocale.get(locale).includes(`${urlPathValue}</loc>`);

const inLlms = (locale, urlPathValue) =>
  llmsByLocale.get(locale).includes(`${urlPathValue})`) ||
  llmsByLocale.get(locale).includes(`${urlPathValue} `) ||
  llmsByLocale.get(locale).includes(`${urlPathValue}\n`);

// ---------- проверка ----------

function auditPage({entry, locale, map}) {
  const route = entry.route;
  const urlPathValue = localeUrlPath(route, locale, defaultLocale);
  const where = `${locale} ${urlPathValue}`;

  // localeDir уже содержит папку локали, поэтому путь достраиваем общим
  // адресом без префикса — иначе получится build/es/es/...
  const routeSegments = route.split('/').filter(Boolean);
  const htmlFile = path.join(localeDir(locale), ...routeSegments, 'index.html');
  const html = readIfExists(htmlFile);
  if (html === null) {
    fail(where, `страница не найдена в сборке: ${path.relative(siteDir, htmlFile)}`);
    return;
  }

  const translated = entry.translated[locale];
  const unlisted = entry.unlisted[locale];
  // Закрытой должна быть и непереведённая страница, и заглушка.
  const mustBeClosed = !translated || unlisted;

  // 1. noindex на самой странице
  if (mustBeClosed && !hasNoIndex(html)) {
    fail(
      where,
      translated
        ? 'заглушка открыта для индексации — нет meta robots noindex'
        : 'нет своего файла перевода, но страница открыта для индексации — нет meta robots noindex',
    );
  }
  if (!mustBeClosed && hasNoIndex(html)) {
    fail(where, 'настоящий перевод закрыт от индексации — лишний meta robots noindex');
  }

  // 2. sitemap локали
  if (mustBeClosed && inSitemap(locale, urlPathValue)) {
    fail(where, 'адрес попал в sitemap локали');
  }
  if (!mustBeClosed && !inSitemap(locale, urlPathValue)) {
    fail(where, 'настоящий перевод пропал из sitemap локали');
  }

  // 3. llms.txt и markdown-копия страницы
  if (mustBeClosed) {
    if (inLlms(locale, urlPathValue)) {
      fail(where, 'адрес попал в llms.txt');
    }
    const mdCopy = path.join(localeDir(locale), ...routeSegments);
    if (fs.existsSync(`${mdCopy}.md`)) {
      fail(where, 'осталась markdown-копия страницы для ИИ-агентов');
    }
  }

  // 4. языковые ссылки: обещаем только языки со своим файлом
  //    (локаль по умолчанию всегда — её файл существует по определению)
  const promised = map.locales.filter(
    (l) => l === defaultLocale || entry.translated[l],
  );
  const expectedPaths = new Set(
    promised.map((l) => localeUrlPath(route, l, defaultLocale)),
  );

  const {translations, xDefault} = alternates(html);
  for (const actual of translations) {
    if (!expectedPaths.has(actual)) {
      fail(where, `hreflang обещает перевод, которого нет: ${actual}`);
    }
  }
  for (const expected of expectedPaths) {
    if (!translations.has(expected)) {
      fail(where, `потерян hreflang на существующий перевод: ${expected}`);
    }
  }

  const expectedXDefault = localeUrlPath(route, defaultLocale, defaultLocale);
  if (xDefault !== expectedXDefault) {
    fail(
      where,
      `x-default должен указывать на ${expectedXDefault}, а указывает на ${xDefault ?? '— (его нет)'}`,
    );
  }

  // 5. og:locale:alternate — тот же список языков, без текущего
  const expectedOg = new Set(
    promised.filter((l) => l !== locale).map((l) => l.replace('-', '_')),
  );
  const actualOg = ogAlternates(html);
  for (const actual of actualOg) {
    if (!expectedOg.has(actual)) {
      fail(where, `og:locale:alternate обещает язык без перевода: ${actual}`);
    }
  }
  for (const expected of expectedOg) {
    if (!actualOg.has(expected)) {
      fail(where, `потерян og:locale:alternate на существующий перевод: ${expected}`);
    }
  }
}

function main() {
  if (!fs.existsSync(outDir)) {
    console.error(
      `[seo-audit] папки сборки нет: ${outDir}\nСначала выполните npm run build.`,
    );
    process.exit(1);
  }

  const map = buildTranslationMap({siteDir, locales, defaultLocale});

  for (const entry of map.entries) {
    for (const locale of locales) {
      auditPage({entry, locale, map});
    }
  }

  // Перевод без двойника в локали по умолчанию в сборку не попадает вовсе —
  // это не поломка индексации, но файл лежит впустую (инвариант F.15).
  for (const orphan of map.orphans) {
    warnings.push(
      `перевод без двойника в локали «${defaultLocale}» — в сборку не попадёт: ${orphan.file}`,
    );
  }

  const pages = map.entries.length * locales.length;
  console.log(`[seo-audit] проверено адресов: ${pages} (${map.entries.length} статей × ${locales.length} языка)`);

  for (const warning of warnings) {
    console.warn(`[seo-audit] предупреждение: ${warning}`);
  }

  if (problems.length === 0) {
    console.log('[seo-audit] чисто: непереведённые страницы закрыты и переводом себя не называют');
    return;
  }

  console.error(`\n[seo-audit] поломок: ${problems.length}`);
  for (const {where, message} of problems) {
    console.error(`  ${where} — ${message}`);
  }
  console.error(
    '\nЧто делать: либо добавить файл перевода, либо убедиться, что карта переводов' +
      '\n(plugins/translation-map) видит адрес — она кормит и страницу, и llms.txt, и эту проверку.',
  );
  process.exit(1);
}

main();
