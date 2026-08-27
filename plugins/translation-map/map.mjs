// Карта доступности переводов — ЕДИНСТВЕННЫЙ источник ответа на вопрос
// «есть ли у этого адреса собственный файл в этой локали?».
//
// Зачем. Docusaurus строит адрес локали даже без файла перевода и кладёт туда
// текст локали по умолчанию. Такая страница выглядит как полноценная: попадает
// в sitemap, в llms.txt, и на неё указывает hreflang с других локалей. Для
// поиска это дубль и ложное обещание перевода.
//
// Отсутствие перевода — РАЗРЕШЁННОЕ состояние, сборку оно не валит. Задача
// карты — дать всем потребителям одинаковый ответ, чтобы они не разошлись:
//   • index.mjs   → globalData → src/theme/SiteMetadata (noindex + hreflang)
//   • docusaurus.config.js      → excludeRoutes плагина llms.txt
//   • scripts/seo-audit.mjs     → проверка готовой папки build после сборки
//
// Sitemap отдельной фильтрации не требует: plugin-sitemap сам выбрасывает
// маршруты, у которых при сборке найден <meta name="robots" ... noindex>
// (createSitemap.js → isNoIndexMetaRoute). Аудит это доказывает.

import fs from 'node:fs';
import path from 'node:path';

const MD_EXTENSIONS = ['.mdx', '.md'];

/**
 * Адрес без завершающего слеша: '/guides/x'. Корень остаётся '/'.
 * Сдвоенные слеши схлопываем: у docs корень маршрутов '/', и склейка
 * '/' + 'lessons' иначе даёт '//lessons'.
 */
function normalizeRoute(route) {
  const withLeadingSlash = route.startsWith('/') ? route : `/${route}`;
  const trimmed = withLeadingSlash.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Адрес внутри локали: ('es', '/guides/x') → '/es/guides/x'. */
export function localeRoute(route, locale, defaultLocale) {
  if (locale === defaultLocale) {
    return normalizeRoute(route);
  }
  const shared = normalizeRoute(route);
  return shared === '/' ? `/${locale}` : `/${locale}${shared}`;
}

/** Полный адрес со слешем на конце — как в sitemap и llms.txt сайта. */
export function localeUrlPath(route, locale, defaultLocale) {
  const withPrefix = localeRoute(route, locale, defaultLocale);
  return withPrefix.endsWith('/') ? withPrefix : `${withPrefix}/`;
}

function listContentFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return listContentFiles(full);
    return MD_EXTENSIONS.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

/** Шапка статьи: нужны только slug и unlisted, весь файл не парсим. */
function readFrontmatter(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8').slice(0, 4096);
  } catch {
    return null;
  }
  const block = text.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return null;
  const fm = block[1];
  const slug = fm.match(/^slug:\s*["']?([^"'\r\n]+?)["']?\s*$/m);
  return {
    unlisted: /^unlisted:\s*true\s*$/m.test(fm),
    slug: slug ? slug[1].trim() : null,
  };
}

/** Относительный путь файла внутри корня контента, всегда через '/'. */
function relativeId(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function stripExtension(rel) {
  for (const ext of MD_EXTENSIONS) {
    if (rel.endsWith(ext)) return rel.slice(0, -ext.length);
  }
  return rel;
}

/**
 * Адрес статьи. slug со слеша — адрес от корня сайта; без слеша — относительно
 * своей папки (правило самого Docusaurus). Без slug адрес берётся из пути,
 * при этом хвост '/index' отбрасывается.
 */
function routeFromFile({rel, frontmatter, routeBasePath}) {
  const withoutExtension = stripExtension(rel);
  const withoutIndex = withoutExtension.replace(/(^|\/)index$/, '');
  const base = normalizeRoute(`${routeBasePath}/${withoutIndex}`);

  const slug = frontmatter?.slug;
  if (!slug) return base;
  if (slug.startsWith('/')) return normalizeRoute(slug);

  const parent = base.slice(0, base.lastIndexOf('/'));
  return normalizeRoute(`${parent}/${slug}`);
}

// Где лежит контент каждого вида для каждой локали. Локали приходят из
// i18n.locales конфига — здесь никаких 'ru' и 'es' зашитых.
const CONTENT_KINDS = [
  {
    kind: 'docs',
    routeBasePath: '/',
    defaultDir: () => 'docs',
    localeDir: (locale) =>
      `i18n/${locale}/docusaurus-plugin-content-docs/current`,
  },
  {
    kind: 'blog',
    routeBasePath: '/blog',
    defaultDir: () => 'blog',
    localeDir: (locale) => `i18n/${locale}/docusaurus-plugin-content-blog`,
  },
];

/**
 * Строит карту по файлам на диске.
 *
 * Набор адресов задаёт локаль по умолчанию: перевод без двойника в ней в
 * сборку не попадает вовсе (инвариант F.15 базы знаний). Такие «сироты»
 * возвращаются отдельным списком — аудит показывает их предупреждением.
 *
 * @returns {{
 *   defaultLocale: string,
 *   locales: string[],
 *   entries: {route: string, kind: string, translated: Record<string, boolean>,
 *             unlisted: Record<string, boolean>}[],
 *   orphans: {locale: string, file: string}[],
 * }}
 */
export function buildTranslationMap({siteDir, locales, defaultLocale}) {
  const entries = [];
  const orphans = [];

  for (const {kind, routeBasePath, defaultDir, localeDir} of CONTENT_KINDS) {
    const rootFor = (locale) =>
      path.join(
        siteDir,
        locale === defaultLocale ? defaultDir() : localeDir(locale),
      );

    const defaultRoot = rootFor(defaultLocale);
    const defaultRels = listContentFiles(defaultRoot).map((file) =>
      relativeId(defaultRoot, file),
    );
    const knownRels = new Set(defaultRels);

    for (const locale of locales) {
      if (locale === defaultLocale) continue;
      const root = rootFor(locale);
      for (const file of listContentFiles(root)) {
        const rel = relativeId(root, file);
        if (!knownRels.has(rel)) {
          orphans.push({locale, file: relativeId(siteDir, file)});
        }
      }
    }

    for (const rel of defaultRels) {
      const translated = {};
      const unlisted = {};

      const defaultFrontmatter = readFrontmatter(
        path.join(rootFor(defaultLocale), ...rel.split('/')),
      );
      // Адрес общий для всех локалей и задаётся локалью по умолчанию:
      // расхождение slug между локалями сайт всё равно не поддерживает.
      const route = routeFromFile({
        rel,
        frontmatter: defaultFrontmatter,
        routeBasePath,
      });

      for (const locale of locales) {
        const file = path.join(rootFor(locale), ...rel.split('/'));
        // Перевод — это НАЛИЧИЕ ФАЙЛА, а не наличие шапки. Docusaurus
        // разрешает статью вовсе без frontmatter, и такая статья остаётся
        // полноценным переводом.
        const fileExists = fs.existsSync(file);
        translated[locale] = fileExists;

        // Свой файл отвечает за себя сам, в том числе пустой шапкой. Шапку
        // локали по умолчанию наследует только адрес БЕЗ своего файла —
        // именно его текст Docusaurus туда и подставляет.
        const effective = fileExists ? readFrontmatter(file) : defaultFrontmatter;
        unlisted[locale] = Boolean(effective?.unlisted);
      }

      entries.push({route, kind, translated, unlisted});
    }
  }

  return {defaultLocale, locales, entries, orphans};
}

/** Адреса без собственного файла перевода, по локалям. */
export function untranslatedRoutesByLocale(map) {
  const result = Object.fromEntries(map.locales.map((locale) => [locale, []]));
  for (const entry of map.entries) {
    for (const locale of map.locales) {
      if (!entry.translated[locale]) result[locale].push(entry.route);
    }
  }
  return result;
}

/** Адреса заглушек (unlisted), по локалям. */
export function unlistedRoutesByLocale(map) {
  const result = Object.fromEntries(map.locales.map((locale) => [locale, []]));
  for (const entry of map.entries) {
    for (const locale of map.locales) {
      if (entry.unlisted[locale]) result[locale].push(entry.route);
    }
  }
  return result;
}

/**
 * Адреса, которых не должно быть в llms.txt: заглушки (их не показываем
 * ИИ-агентам) и непереведённые адреса (там текст чужой локали).
 * Формат — маршруты со слешем плюс поддерево, как ждёт плагин.
 */
export function llmsExcludeRoutePatterns(map) {
  const untranslated = untranslatedRoutesByLocale(map);
  const unlisted = unlistedRoutesByLocale(map);
  const patterns = new Set();

  for (const locale of map.locales) {
    for (const route of [...untranslated[locale], ...unlisted[locale]]) {
      const urlPath = localeUrlPath(route, locale, map.defaultLocale);
      patterns.add(urlPath);
      patterns.add(`${urlPath}**`);
    }
  }

  return [...patterns];
}

/**
 * Компактный вид для браузера: только то, что нужно SiteMetadata.
 * Заглушки идут отдельным списком — им noindex ставит сам Docusaurus
 * (unlisted → «noindex, nofollow»), и второй тег там не нужен.
 */
export function toClientData(map) {
  return {
    defaultLocale: map.defaultLocale,
    locales: map.locales,
    untranslated: untranslatedRoutesByLocale(map),
    unlisted: unlistedRoutesByLocale(map),
  };
}
