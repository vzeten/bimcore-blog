// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {themes as prismThemes} from 'prism-react-renderer';
import {config as loadEnv} from 'dotenv';

// Локально читаем токены из .env.local (в git не коммитится).
// На GitHub Actions переменные приходят из секретов репозитория (process.env).
loadEnv({path: '.env.local'});

// Служебные страницы, которым не место в sitemap и llms.txt (все локали).
const serviceRoutePatterns = ['', '/ru', '/es'].flatMap((l) =>
  ['blog/tags', 'blog/archive', 'blog/authors', 'search'].flatMap((p) => [
    `${l}/${p}`,
    `${l}/${p}/`,
    `${l}/${p}/**`,
  ]),
);

// llms.txt: unlisted-заглушки («coming soon») ИИ-агентам не показываем.
// Список строится САМ при каждой сборке: сканируем шапки docs-статей.
// Снятие unlisted (в том числе через CMS) попадает в следующий деплой
// без правки конфига. Локаль без своего файла наследует шапку EN-файла
// (fallback-логика самого Docusaurus).
const siteDir = path.dirname(fileURLToPath(import.meta.url));

function readDocFrontmatter(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8').slice(0, 4096);
  } catch {
    return null;
  }
  const m = text.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = m[1];
  const slug = fm.match(/^slug:\s*["']?([^"'\r\n]+?)["']?\s*$/m);
  return {
    unlisted: /^unlisted:\s*true\s*$/m.test(fm),
    slug: slug ? slug[1].trim() : null,
  };
}

function listMdxFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, {withFileTypes: true}).flatMap((e) => {
    const p = path.join(root, e.name);
    if (e.isDirectory()) return listMdxFiles(p);
    return e.name.endsWith('.mdx') ? [p] : [];
  });
}

function collectUnlistedRoutePatterns() {
  const enRoot = path.join(siteDir, 'docs');
  const i18nRoot = (l) =>
    path.join(siteDir, 'i18n', l, 'docusaurus-plugin-content-docs', 'current');
  // Относительные пути всех docs-файлов (EN — полный набор: перевод без
  // EN-двойника в сборку не попадает, инвариант F.15).
  const relPaths = listMdxFiles(enRoot).map((p) =>
    path.relative(enRoot, p).split(path.sep).join('/'),
  );
  const patterns = [];
  for (const rel of relPaths) {
    for (const [locale, prefix] of [['', ''], ['ru', '/ru'], ['es', '/es']]) {
      const localFile = locale
        ? path.join(i18nRoot(locale), ...rel.split('/'))
        : path.join(enRoot, ...rel.split('/'));
      const fm = readDocFrontmatter(localFile) ?? readDocFrontmatter(path.join(enRoot, ...rel.split('/')));
      if (!fm?.unlisted) continue;
      const route =
        fm.slug ?? `/${rel.replace(/\.mdx$/, '').replace(/\/index$/, '')}`;
      patterns.push(`${prefix}${route}/`, `${prefix}${route}/**`);
    }
  }
  return patterns;
}

const unlistedRoutePatterns = collectUnlistedRoutePatterns();

/** @type {import('@docusaurus/types').Config} */
const config = {
  // Публичный токен Ecwid (public_...) для подгрузки цен на карточках товара.
  // Источник: .env.local (локально) или секрет ECWID_PUBLIC_TOKEN (GitHub Actions).
  // Это PUBLIC-токен (только чтение каталога) — попадание в бандл сайта штатно.
  customFields: {
    ecwidPublicToken: process.env.ECWID_PUBLIC_TOKEN || '',
  },
  title: 'BIMCORE Learn',
  tagline: 'Revit courses, guides & resources',
  favicon: 'img/favicon.ico',
  future: { v4: true },
  url: 'https://learn.bimcore.one',
  baseUrl: '/',
  // Хостинг 301-редиректит URL без «/» на вариант со «/» (статика из папок).
  // true выравнивает sitemap/canonical/hreflang с реальными URL — без цепочки 301.
  trailingSlash: true,
  organizationName: 'vzeten',
  projectName: 'bimcore-blog',
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ru', 'es'],
    // EN — основной язык сайта (без префикса в URL). RU — перевод (под /ru/...).
    // Структура файлов перевода: i18n/ru/docusaurus-plugin-content-{docs|blog}/current/...
    // (см. decisions.md «Дефолтный язык сайта — EN»).
  },
  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          routeBasePath: '/',
        },
        blog: {
          showReadingTime: true,
          // Meta description ленты /blog/ (дефолт — бесполезное «Blog»).
          // Переводы — i18n/<l>/docusaurus-plugin-content-blog/options.json.
          blogDescription:
            'What we learn about Revit on real interior projects: practical tips, workflows and family guides for interior designers.',
          // Custom truncate marker — <truncate /> JSX-тег вместо {/* truncate */} или <!-- -->
          // Sveltia rich-editor не экранирует JSX-теги, MDX парсер их валидирует.
          // См. decisions «Truncate-маркер = <truncate /> JSX-тег».
          truncateMarker: /<truncate\s*\/>/,
        },
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          // Страницы тегов/архива/авторов блога дополнительно получают noindex
          // в src/theme/ — sitemap-плагин сам выкидывает noindex-маршруты;
          // паттерны здесь — явная страховка. /search задаёт noindex
          // неправильным тегом (property= вместо name=), поэтому для него
          // ignorePatterns обязателен.
          ignorePatterns: serviceRoutePatterns,
        },
      }),
    ],
  ],
  plugins: [
    // Тянет цены товаров из Ecwid при СБОРКЕ и кладёт в globalData, чтобы
    // ProductCard впечатал schema.org price/priceCurrency/availability в
    // статический HTML (иначе микроразметка появлялась только после fetch
    // в браузере — Google её не видел, GSC ругался «Укажите price»).
    './plugins/ecwid-prices',
    [
      '@docusaurus/plugin-google-gtag',
      {
        trackingID: 'G-7CETNM0WVL',
        anonymizeIP: true,
      },
    ],
    [
      // Генерирует llms.txt (индекс для ИИ-ассистентов) + markdown-копии страниц
      // при build. postBuild выполняется для каждой локали: EN → /llms.txt,
      // RU → /ru/llms.txt, ES → /es/llms.txt. Локали исключать нельзя —
      // локаль без единого маршрута валит сборку.
      '@signalwire/docusaurus-plugin-llms-txt',
      {
        siteTitle: 'BIMCORE Learn',
        // Паспорт сайта для ИИ-ассистентов: явные сущности и категории
        // (по ним ассистент сопоставляет запрос клиента с сайтом),
        // что бесплатно/платно и граница охвата («не конструктив/не MEP» —
        // отсекает нерелевантные рекомендации).
        siteDescription:
          'Free Autodesk Revit lessons and an interior design toolkit by BIMCORE. ' +
          'For interior designers first, architects second: step-by-step Revit lessons for real interior projects, ' +
          'guides to parametric Revit family sets (furniture, kitchens, bathrooms, doors, windows, curtains), ' +
          'interior project templates and the BIMCORE plugin. ' +
          'Lessons and guides are free; family sets, templates and the plugin are sold at bimcore.one. ' +
          'Scope: interiors and interior documentation in Revit, not structural or MEP engineering.',
        depth: 2,
        optionalLinks: [
          {
            title: 'BIMCORE Shop',
            url: 'https://bimcore.one',
            description:
              'Paid products: parametric Revit family sets, interior project templates and the BIMCORE plugin.',
          },
          {
            title: 'BIMCORE Community',
            url: 'https://community.bimcore.one',
            description: 'Questions and answers about Revit for interior design.',
          },
          {
            title: 'YouTube',
            url: 'https://www.youtube.com/@int_lines',
            description: 'Video lessons and Revit family overviews.',
          },
        ],
        content: {
          includeBlog: true,
          // false → полные URL: иначе ссылки в /ru/llms.txt теряют /ru/
          // и ведут на EN-копии (у RU-only статей это 404). Аудит #63.
          relativePaths: false,
          excludeRoutes: [...serviceRoutePatterns, ...unlistedRoutePatterns],
        },
      },
    ],
  ],
  themes: [
    [
      // Локальный (оффлайн) поиск по статьям. Индекс строится при build,
      // в dev НЕ работает — проверять через build + serve.
      // docsRouteBasePath: '/' обязателен (docs в корне сайта).
      '@easyops-cn/docusaurus-search-local',
      /** @type {import('@easyops-cn/docusaurus-search-local').PluginOptions} */
      ({
        hashed: true,
        language: ['en', 'ru', 'es'],
        docsRouteBasePath: '/',
        highlightSearchTermsOnTargetPage: true,
      }),
    ],
  ],
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/social-card.jpg',
	  docs: {
        sidebar: {
          hideable: true,
        },
      },
      colorMode: { respectPrefersColorScheme: true },
      navbar: {
        title: 'BIMCORE Learn',
        logo: {
          alt: 'BIMCORE Logo',
          src: 'img/logo.png',
        },
        items: [
          {to: '/blog', label: 'Blog', position: 'left'},
          {href: 'https://bimcore.one', label: 'Shop', position: 'left', target: '_blank'},
          {type: 'localeDropdown', position: 'right'},
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Community',
            items: [
              {label: 'Ask about Revit', href: 'https://community.bimcore.one'},
              {label: 'Telegram', href: 'https://t.me/bimcore_one'},
            ],
          },
          {
            title: 'Social',
            items: [
              {label: 'YouTube', href: 'https://www.youtube.com/@int_lines'},
              {label: 'Instagram', href: 'https://www.instagram.com/bimcore.one'},
              {label: 'Threads', href: 'https://www.threads.com/@bimcore.one'},
              {label: 'Pinterest', href: 'https://pin.it/3hlU51KaD'},
            ],
          },
          {
            title: 'Contact',
            items: [
              {label: 'Ivan Zylev — LinkedIn', href: 'https://www.linkedin.com/in/ivan-zylev/'},
            ],
          },
        ],
        copyright: '© ' + new Date().getFullYear() + ' BIMCORE LTD',
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};
export default config;