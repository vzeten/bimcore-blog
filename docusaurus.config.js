// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';
import {config as loadEnv} from 'dotenv';

// Локально читаем токены из .env.local (в git не коммитится).
// На GitHub Actions переменные приходят из секретов репозитория (process.env).
loadEnv({path: '.env.local'});

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
  organizationName: 'vzeten',
  projectName: 'bimcore-blog',
  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
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
          // Custom truncate marker — <truncate /> JSX-тег вместо {/* truncate */} или <!-- -->
          // Sveltia rich-editor не экранирует JSX-теги, MDX парсер их валидирует.
          // См. decisions «Truncate-маркер = <truncate /> JSX-тег».
          truncateMarker: /<truncate\s*\/>/,
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],
  plugins: [
    [
      '@docusaurus/plugin-google-gtag',
      {
        trackingID: 'G-7CETNM0WVL',
        anonymizeIP: true,
      },
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