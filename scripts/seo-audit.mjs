#!/usr/bin/env node
/**
 * seo-audit — проверка ГОТОВОЙ сборки: не выдаёт ли сайт закрытую страницу
 * за полноценный перевод и не устарела ли сама сборка.
 *
 * Почему после сборки, а не до. Отсутствие перевода — разрешённое состояние
 * сайта, и валить сборку из-за него нельзя. Проверять надо не исходники, а
 * результат: что реально попало в HTML, sitemap и llms.txt. Поэтому запуск
 * идёт следующим шагом после `npm run build`.
 *
 * Две независимые проверки языковых ссылок:
 *   1. По карте переводов (plugins/translation-map): каждая страница из карты
 *      сравнивается с ожиданием — noindex, sitemap, llms.txt, набор hreflang и
 *      og:locale:alternate, x-default. Черновик (draft) в production-сборке
 *      должен отсутствовать; заглушка (unlisted) — существовать с noindex.
 *   2. По самой сборке, без карты: у каждой открытой (без noindex) страницы
 *      любой hreflang и x-default должен вести на существующую, открытую и
 *      присутствующую в sitemap страницу, которая ссылается обратно; страница
 *      обязана ссылаться на себя и иметь x-default. Эта проверка не знает
 *      правил карты, поэтому ловит и ошибку самой карты.
 *
 * Свежесть сборки. Исходники сайта (BUILD_INPUTS) не могут быть новее
 * собранного index.html — иначе проверяется не то, что будет выложено.
 * Устаревшая сборка = ошибка; флаг --allow-stale превращает её в
 * предупреждение для осознанного разбора старой папки.
 *
 * Запуск:
 *   node scripts/seo-audit.mjs                 папка build
 *   node scripts/seo-audit.mjs <dir>           другая папка сборки
 *   node scripts/seo-audit.mjs <dir> --allow-stale
 *
 * Коды выхода: 0 — чисто; 1 — есть поломки или сборка устарела.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  buildTranslationMap,
  hreflangByRoute,
  localeUrlPath,
} from '../plugins/translation-map/map.mjs';
import {
  defaultLocale as siteDefaultLocale,
  locales as siteLocales,
} from '../plugins/translation-map/locales.mjs';

/** Что влияет на результат сборки; изменение любого из них требует новой сборки. */
export const BUILD_INPUTS = [
  'docs',
  'blog',
  'i18n',
  'src',
  'static',
  'plugins',
  'docusaurus.config.js',
  'sidebars.js',
  'package.json',
  'package-lock.json',
];

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

export function hasNoIndex(html) {
  return tags(html, 'meta').some(
    (a) =>
      a.name?.toLowerCase() === 'robots' &&
      (a.content ?? '').toLowerCase().includes('noindex'),
  );
}

/** Все языковые ссылки страницы, включая x-default: [{hreflang, path}]. */
export function alternateLinks(html) {
  return tags(html, 'link')
    .filter((a) => a.rel === 'alternate' && a.hreflang)
    .map((a) => ({hreflang: a.hreflang, path: urlPath(a.href ?? '')}));
}

/** Языковые ссылки страницы: пути переводов и отдельно x-default. */
function alternates(html) {
  const translations = new Set();
  let xDefault = null;
  for (const link of alternateLinks(html)) {
    if (link.hreflang === 'x-default') xDefault = link.path;
    else translations.add(link.path);
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

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

/** Файл страницы по её пути: '/ru/x/' → <outDir>/ru/x/index.html. */
function pageFile(outDir, urlPathValue) {
  const segments = urlPathValue.split('/').filter(Boolean);
  return path.join(outDir, ...segments, 'index.html');
}

/** Адрес страницы по файлу: <outDir>/ru/x/index.html → '/ru/x/'. */
function pagePath(outDir, file) {
  const rel = path.relative(outDir, path.dirname(file)).split(path.sep).join('/');
  return rel === '' ? '/' : `/${rel}/`;
}

function listPages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listPages(full);
    return entry.name === 'index.html' ? [full] : [];
  });
}

/** Все адреса из всех sitemap.xml сборки (корень и папки локалей). */
export function sitemapPaths(outDir) {
  const files = [path.join(outDir, 'sitemap.xml')];
  if (fs.existsSync(outDir)) {
    for (const entry of fs.readdirSync(outDir, {withFileTypes: true})) {
      if (entry.isDirectory()) {
        files.push(path.join(outDir, entry.name, 'sitemap.xml'));
      }
    }
  }
  const paths = new Set();
  for (const file of files) {
    const xml = readIfExists(file) ?? '';
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      paths.add(urlPath(m[1]));
    }
  }
  return paths;
}

// ---------- свежесть сборки ----------

/**
 * Исходники, изменённые ПОСЛЕ сборки. Отметка времени сборки — index.html
 * в корне: он пишется в конце сборки страниц. Проверяются и папки: их время
 * меняется при добавлении, удалении и переименовании файлов.
 */
export function staleInputs({siteDir, outDir, inputs = BUILD_INPUTS}) {
  const marker = path.join(outDir, 'index.html');
  if (!fs.existsSync(marker)) return {buildTime: null, newer: []};
  const buildTime = fs.statSync(marker).mtimeMs;
  const newer = [];

  const visit = (file) => {
    const stat = fs.statSync(file);
    if (stat.mtimeMs > buildTime) {
      newer.push(path.relative(siteDir, file).split(path.sep).join('/'));
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(file)) visit(path.join(file, entry));
    }
  };

  for (const input of inputs) {
    const file = path.join(siteDir, input);
    if (fs.existsSync(file)) visit(file);
  }
  return {buildTime, newer};
}

// ---------- проверка 1: по карте переводов ----------

function auditByMap({outDir, map, defaultLocale, fail, warn}) {
  const plan = hreflangByRoute(map);
  const sitemapByLocale = new Map();
  const llmsByLocale = new Map();
  const localeDir = (locale) =>
    locale === defaultLocale ? outDir : path.join(outDir, locale);

  for (const locale of map.locales) {
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

  for (const entry of map.entries) {
    for (const locale of map.locales) {
      auditMappedPage({entry, locale});
    }
  }

  function auditMappedPage({entry, locale}) {
    const route = entry.route;
    const urlPathValue = localeUrlPath(route, locale, defaultLocale);
    const where = `${locale} ${urlPathValue}`;

    const htmlFile = pageFile(outDir, urlPathValue);
    const html = readIfExists(htmlFile);
    const translated = entry.translated[locale];
    const unlisted = entry.unlisted[locale];
    const draft = entry.draft[locale];
    const mdCopy = path.join(localeDir(locale), ...route.split('/').filter(Boolean));

    // 0. черновик: в production-сборке его нет вовсе — ни страницы, ни следа
    //    в sitemap и llms.txt. Языковые ссылки на него ловятся с других
    //    страниц: карта его не обещает, а проверка по сборке видит, что цели нет.
    if (draft) {
      if (unlisted) {
        warn(`${where}: в шапке одновременно draft и unlisted — Docusaurus такую пару отвергает; считается черновиком`);
      }
      if (html !== null) {
        fail(where, 'черновик (draft) попал в production-сборку');
      }
      if (inSitemap(locale, urlPathValue)) {
        fail(where, 'черновик (draft) попал в sitemap локали');
      }
      if (inLlms(locale, urlPathValue)) {
        fail(where, 'черновик (draft) попал в llms.txt');
      }
      if (fs.existsSync(`${mdCopy}.md`)) {
        fail(where, 'у черновика (draft) осталась markdown-копия для ИИ-агентов');
      }
      return;
    }

    if (html === null) {
      fail(where, `страница не найдена в сборке: ${path.relative(outDir, htmlFile)}`);
      return;
    }
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
      if (fs.existsSync(`${mdCopy}.md`)) {
        fail(where, 'осталась markdown-копия страницы для ИИ-агентов');
      }
    }

    // 4. языковые ссылки: ровно те, что назначила карта (только индексируемые
    //    версии), x-default — по её же правилу
    const promised = plan[route].locales;
    const expectedPaths = new Set(
      promised.map((l) => localeUrlPath(route, l, defaultLocale)),
    );

    const {translations, xDefault} = alternates(html);
    for (const actual of translations) {
      if (!expectedPaths.has(actual)) {
        fail(where, `hreflang обещает версию, которая закрыта или отсутствует: ${actual}`);
      }
    }
    for (const expected of expectedPaths) {
      if (!translations.has(expected)) {
        fail(where, `потерян hreflang на индексируемую версию: ${expected}`);
      }
    }

    const expectedXDefault =
      plan[route].xDefault === null
        ? null
        : localeUrlPath(route, plan[route].xDefault, defaultLocale);
    if (xDefault !== expectedXDefault) {
      fail(
        where,
        expectedXDefault === null
          ? `x-default не нужен (индексируемых версий нет), а указывает на ${xDefault}`
          : `x-default должен указывать на ${expectedXDefault}, а указывает на ${xDefault ?? '— (его нет)'}`,
      );
    }

    // 5. og:locale:alternate — тот же список языков, без текущего
    const expectedOg = new Set(
      promised.filter((l) => l !== locale).map((l) => l.replace('-', '_')),
    );
    const actualOg = ogAlternates(html);
    for (const actual of actualOg) {
      if (!expectedOg.has(actual)) {
        fail(where, `og:locale:alternate обещает закрытую или отсутствующую версию: ${actual}`);
      }
    }
    for (const expected of expectedOg) {
      if (!actualOg.has(expected)) {
        fail(where, `потерян og:locale:alternate на индексируемую версию: ${expected}`);
      }
    }
  }
}

// ---------- проверка 2: по сборке, без карты ----------

/**
 * У каждой открытой страницы каждая языковая ссылка ведёт на открытую
 * страницу из sitemap, которая ссылается обратно. Закрытые (noindex)
 * страницы источником не считаются: их языковые ссылки поиск не читает.
 * @returns {number} сколько открытых страниц проверено
 */
export function auditAlternateTargets({outDir, fail}) {
  const inSitemap = sitemapPaths(outDir);
  const htmlCache = new Map();
  const read = (urlPathValue) => {
    if (!htmlCache.has(urlPathValue)) {
      htmlCache.set(urlPathValue, readIfExists(pageFile(outDir, urlPathValue)));
    }
    return htmlCache.get(urlPathValue);
  };

  let checked = 0;
  for (const file of listPages(outDir)) {
    const source = pagePath(outDir, file);
    const html = read(source);
    if (hasNoIndex(html)) continue;

    const links = alternateLinks(html);
    if (links.length === 0) continue;
    checked += 1;
    const where = `страница ${source}`;

    if (!links.some((l) => l.hreflang !== 'x-default' && l.path === source)) {
      fail(where, 'нет hreflang на саму себя');
    }
    if (!links.some((l) => l.hreflang === 'x-default')) {
      fail(where, 'нет x-default');
    }

    for (const {hreflang, path: target} of links) {
      const targetHtml = read(target);
      if (targetHtml === null) {
        fail(where, `hreflang ${hreflang} ведёт на отсутствующую страницу ${target}`);
        continue;
      }
      if (hasNoIndex(targetHtml)) {
        fail(where, `hreflang ${hreflang} ведёт на закрытую (noindex) страницу ${target}`);
        continue;
      }
      if (!inSitemap.has(target)) {
        fail(where, `hreflang ${hreflang} ведёт на страницу вне sitemap ${target}`);
        continue;
      }
      if (
        target !== source &&
        !alternateLinks(targetHtml).some((l) => l.path === source)
      ) {
        fail(where, `нет обратной языковой ссылки со страницы ${target}`);
      }
    }
  }
  return checked;
}

// ---------- запуск ----------

/**
 * Полная проверка папки сборки. Ничего не печатает и процесс не завершает —
 * возвращает поломки, предупреждения и цифры для отчёта.
 */
export function auditBuild({
  siteDir,
  outDir,
  locales = siteLocales,
  defaultLocale = siteDefaultLocale,
  allowStale = false,
}) {
  const problems = [];
  const warnings = [];
  const fail = (where, message) => problems.push({where, message});
  const warn = (message) => warnings.push(message);

  if (!fs.existsSync(outDir)) {
    fail('сборка', `папки сборки нет: ${outDir}. Сначала выполните npm run build`);
    return {problems, warnings, stats: null};
  }
  if (!fs.existsSync(path.join(outDir, 'index.html'))) {
    fail('сборка', `в ${outDir} нет index.html — сборка не завершена`);
    return {problems, warnings, stats: null};
  }

  const {newer} = staleInputs({siteDir, outDir});
  if (newer.length > 0) {
    const shown = newer.slice(0, 10).join(', ');
    const more = newer.length > 10 ? ` и ещё ${newer.length - 10}` : '';
    const message = `исходники новее сборки (${shown}${more}) — соберите сайт заново`;
    if (allowStale) {
      warnings.push(`сборка устарела, проверяется как есть (--allow-stale): ${message}`);
    } else {
      fail('сборка', message);
      return {problems, warnings, stats: null};
    }
  }

  const map = buildTranslationMap({siteDir, locales, defaultLocale});
  auditByMap({outDir, map, defaultLocale, fail, warn});
  const openPages = auditAlternateTargets({outDir, fail});

  // Перевод без двойника в локали по умолчанию в сборку не попадает вовсе —
  // это не поломка индексации, но файл лежит впустую (инвариант F.15).
  for (const orphan of map.orphans) {
    warnings.push(
      `перевод без двойника в локали «${defaultLocale}» — в сборку не попадёт: ${orphan.file}`,
    );
  }

  return {
    problems,
    warnings,
    stats: {
      entries: map.entries.length,
      locales: locales.length,
      pages: map.entries.length * locales.length,
      openPages,
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const allowStale = args.includes('--allow-stale');
  const dir = args.find((a) => !a.startsWith('--')) ?? 'build';

  const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outDir = path.resolve(siteDir, dir);

  const {problems, warnings, stats} = auditBuild({siteDir, outDir, allowStale});

  if (stats) {
    console.log(
      `[seo-audit] проверено адресов: ${stats.pages} (${stats.entries} статей × ${stats.locales} языка); ` +
        `открытых страниц с языковыми ссылками: ${stats.openPages}`,
    );
  }
  for (const warning of warnings) {
    console.warn(`[seo-audit] предупреждение: ${warning}`);
  }

  if (problems.length === 0) {
    console.log('[seo-audit] чисто: закрытые страницы не индексируются, языковые ссылки ведут только на открытые версии');
    return;
  }

  console.error(`\n[seo-audit] поломок: ${problems.length}`);
  for (const {where, message} of problems) {
    console.error(`  ${where} — ${message}`);
  }
  console.error(
    '\nЧто делать: устаревшую сборку собрать заново; для языковых ссылок — либо добавить' +
      '\nфайл перевода, либо убедиться, что карта переводов (plugins/translation-map) видит адрес:' +
      '\nона кормит и страницу, и llms.txt, и эту проверку.',
  );
  process.exit(1);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
