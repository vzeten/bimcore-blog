// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'BIMCORE Learn',
  tagline: 'Revit courses, guides & resources',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://learn.bimcore.one',
  baseUrl: '/',

  organizationName: 'vzeten',
  projectName: 'bimcore-blog',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ru'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          routeBasePath: '/',
          editUrl: 'https://github.com/vzeten/bimcore-blog/tree/main/',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          editUrl: 'https://github.com/vzeten/bimcore-blog/tree/main/',
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/social-card.jpg',
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'BIMCORE Learn',
        logo: {
          alt: 'BIMCORE Logo',
          src: 'img/logo.png',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'coursesSidebar',
            position: 'left',
            label: 'Courses',
          },
          {
            type: 'docSidebar',
            sidebarId: 'guidesSidebar',
            position: 'left',
            label: 'Guides',
          },
          {
            type: 'docSidebar',
            sidebarId: 'helpSidebar',
            position: 'left',
            label: 'Help',
          },
          {to: '/blog', label: 'Blog', position: 'left'},
          {type: 'localeDropdown', position: 'right'},
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Learn',
            items: [
              {label: 'Courses', to: '/courses'},
              {label: 'Guides', to: '/guides'},
            ],
          },
          {
            title: 'More',
            items: [
              {label: 'Blog', to: '/blog'},
              {label: 'Help', to: '/help'},
            ],
          },
          {
            title: 'BIMCORE',
            items: [
              {label: 'bimcore.one', href: 'https://bimcore.one'},
              {label: 'GitHub', href: 'https://github.com/vzeten/bimcore-blog'},
            ],
          },
        ],
        copyright: `© ${new Date().getFullYear()} BIMCORE`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;