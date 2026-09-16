/**
 * Копия theme-classic/SiteMetadata с одной добавкой: страница, у которой в
 * этой локали НЕТ своего файла перевода, не выдаёт себя за перевод.
 *
 * Зачем. Docusaurus строит адрес локали даже без файла перевода и кладёт туда
 * текст локали по умолчанию. Штатная тема всё равно объявляет такой адрес
 * переводом (hreflang + og:locale:alternate) и оставляет его открытым для
 * индексации — поиск получает дубль и ложное обещание языка.
 *
 * Что меняем:
 *   • на самой непереведённой странице — <meta name="robots" content="noindex, follow">
 *     (ссылки на ней остаются полезными, поэтому follow, а не nofollow);
 *   • языковые ссылки hreflang и og:locale:alternate выдаём только на
 *     индексируемые версии: ни на непереведённый адрес, ни на заглушку
 *     (unlisted), ни с этой страницы, ни с её двойников в других локалях;
 *   • x-default указывает на локаль по умолчанию, а если та закрыта — на
 *     первую индексируемую версию (у статьи только на русском — на русскую).
 *
 * Списки непереведённых адресов и заглушек и готовый план языковых ссылок
 * приходят из globalData плагина translation-map (hreflangByRoute в
 * map.mjs) — того же, что кормит llms.txt и проверку сборки
 * (scripts/seo-audit.mjs). Второго источника правды нет.
 *
 * Файл — свизл (полная копия компонента темы). При обновлении Docusaurus
 * сверять с оригиналом: node_modules/@docusaurus/theme-classic/lib/theme/SiteMetadata.
 * Расхождение поймает проверка после сборки.
 */
import React from 'react';
import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {usePluginData} from '@docusaurus/useGlobalData';
import {PageMetadata, useThemeConfig} from '@docusaurus/theme-common';
import {
  DEFAULT_SEARCH_TAG,
  useAlternatePageUtils,
} from '@docusaurus/theme-common/internal';
import {useLocation} from '@docusaurus/router';
import {applyTrailingSlash} from '@docusaurus/utils-common';
import SearchMetadata from '@theme/SearchMetadata';

/**
 * Адрес без префикса локали и без слеша на конце — в таком виде адреса лежат
 * в карте переводов. Единственное, что здесь считается на стороне браузера:
 * сами данные приходят готовыми из плагина.
 */
function useSharedRoute() {
  const {
    siteConfig: {baseUrl},
    i18n: {currentLocale, defaultLocale},
  } = useDocusaurusContext();
  const {pathname} = useLocation();

  // В сборке с локалями baseUrl уже содержит префикс языка ('/es/'), но
  // полагаться только на это нельзя — снимаем префикс и вторым шагом, если он
  // всё-таки остался в адресе.
  let rest = pathname.startsWith(baseUrl)
    ? pathname.slice(baseUrl.length)
    : pathname;
  if (
    currentLocale !== defaultLocale &&
    (rest === currentLocale || rest.startsWith(`${currentLocale}/`))
  ) {
    rest = rest.slice(currentLocale.length);
  }
  const trimmed = `/${rest}`.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Есть ли у текущего адреса собственный файл в каждой из локалей и какие
 * языковые ссылки ему положены.
 */
function useTranslationAvailability() {
  const {untranslated, unlisted, alternates} = usePluginData('translation-map');
  const {
    i18n: {locales, defaultLocale},
  } = useDocusaurusContext();
  const route = useSharedRoute();

  const isTranslated = (locale) => !untranslated[locale]?.includes(route);
  const isUnlisted = (locale) => Boolean(unlisted[locale]?.includes(route));
  // Адрес вне карты (главная, поиск, списки блога) существует во всех
  // локалях одинаково — для него остаётся штатное поведение темы.
  const plan = alternates[route] ?? {locales, xDefault: defaultLocale};

  return {isTranslated, isUnlisted, plan};
}

// TODO move to SiteMetadataDefaults or theme-common ?
// Useful for i18n/SEO
// See https://developers.google.com/search/docs/advanced/crawling/localized-versions
// See https://github.com/facebook/docusaurus/issues/3317
function AlternateLangHeaders() {
  const {
    i18n: {currentLocale, localeConfigs},
  } = useDocusaurusContext();
  const alternatePageUtils = useAlternatePageUtils();
  const {plan} = useTranslationAvailability();
  const currentHtmlLang = localeConfigs[currentLocale].htmlLang;
  // HTML lang is a BCP 47 tag, but the Open Graph protocol requires
  // using underscores instead of dashes.
  // See https://ogp.me/#optional
  // See https://en.wikipedia.org/wiki/IETF_language_tag)
  const bcp47ToOpenGraphLocale = (code) => code.replace('-', '_');
  // Note: it is fine to use both "x-default" and "en" to target the same url
  // See https://www.searchviu.com/en/multiple-hreflang-tags-one-url/

  // Обещаем поиску только индексируемые версии — список и x-default
  // приходят готовыми из карты переводов (hreflangByRoute). Заглушка или
  // непереведённый адрес закрыты noindex, и языковая ссылка на них — ошибка.
  const alternateLocales = plan.locales.map((locale) => [
    locale,
    localeConfigs[locale],
  ]);
  const xDefaultLocale = plan.xDefault;

  return (
    <Head>
      {alternateLocales.map(([locale, {htmlLang}]) => (
        <link
          key={locale}
          rel="alternate"
          href={alternatePageUtils.createUrl({
            locale,
            fullyQualified: true,
          })}
          hrefLang={htmlLang}
        />
      ))}
      {xDefaultLocale !== null && (
        <link
          rel="alternate"
          href={alternatePageUtils.createUrl({
            locale: xDefaultLocale,
            fullyQualified: true,
          })}
          hrefLang="x-default"
        />
      )}

      <meta
        property="og:locale"
        content={bcp47ToOpenGraphLocale(currentHtmlLang)}
      />
      {alternateLocales
        .map(([, config]) => config)
        .filter((config) => currentHtmlLang !== config.htmlLang)
        .map((config) => (
          <meta
            key={`meta-og-${config.htmlLang}`}
            property="og:locale:alternate"
            content={bcp47ToOpenGraphLocale(config.htmlLang)}
          />
        ))}
    </Head>
  );
}

/**
 * Страница показывает текст чужой локали — для поиска это дубль, индексировать
 * её нельзя. follow оставляем: ссылки внутри ведут на нормальные страницы.
 */
function UntranslatedPageHeaders() {
  const {
    i18n: {currentLocale},
  } = useDocusaurusContext();
  const {isTranslated, isUnlisted} = useTranslationAvailability();

  // Заглушке noindex ставит сам Docusaurus по unlisted, и он строже —
  // «noindex, nofollow». Второй тег с тем же именем только перебил бы его.
  if (isTranslated(currentLocale) || isUnlisted(currentLocale)) {
    return null;
  }

  return (
    <Head>
      <meta name="robots" content="noindex, follow" />
    </Head>
  );
}

// Default canonical url inferred from current page location pathname
function useDefaultCanonicalUrl() {
  const {
    siteConfig: {url: siteUrl, baseUrl, trailingSlash},
  } = useDocusaurusContext();
  // TODO using useLocation().pathname is not a super idea
  // See https://github.com/facebook/docusaurus/issues/9170
  const {pathname} = useLocation();
  const canonicalPathname = applyTrailingSlash(useBaseUrl(pathname), {
    trailingSlash,
    baseUrl,
  });
  return siteUrl + canonicalPathname;
}
// TODO move to SiteMetadataDefaults or theme-common ?
function CanonicalUrlHeaders({permalink}) {
  const {
    siteConfig: {url: siteUrl},
  } = useDocusaurusContext();
  const defaultCanonicalUrl = useDefaultCanonicalUrl();
  const canonicalUrl = permalink
    ? `${siteUrl}${permalink}`
    : defaultCanonicalUrl;
  return (
    <Head>
      <meta property="og:url" content={canonicalUrl} />
      <link rel="canonical" href={canonicalUrl} />
    </Head>
  );
}
export default function SiteMetadata() {
  const {
    i18n: {currentLocale},
  } = useDocusaurusContext();
  // TODO maybe move these 2 themeConfig to siteConfig?
  // These seems useful for other themes as well
  const {metadata, image: defaultImage} = useThemeConfig();
  return (
    <>
      <Head>
        <meta name="twitter:card" content="summary_large_image" />
        {/* The keyboard focus class name need to be applied when SSR so links
        are outlined when JS is disabled */}
        <body />
      </Head>

      {/*
          Крупная картинка статьи в выдаче и в ИИ-поиске. Стоит РАНЬШЕ всех
          noindex: одноимённый meta из более позднего <Head> перебивает ранний,
          поэтому закрытые страницы (непереведённые ниже, заглушки, архив и
          метки блога в своих темах) получают свой noindex, а не этот тег.
        */}
      <Head>
        <meta name="robots" content="max-image-preview:large" />
      </Head>

      {defaultImage && <PageMetadata image={defaultImage} />}

      <CanonicalUrlHeaders />

      <AlternateLangHeaders />

      <UntranslatedPageHeaders />

      <SearchMetadata tag={DEFAULT_SEARCH_TAG} locale={currentLocale} />

      {/*
          It's important to have an additional <Head> element here, as it allows
          react-helmet to override default metadata values set in previous <Head>
          like "twitter:card". In same Head, the same meta would appear twice
          instead of overriding.
        */}
      <Head>
        {/* Yes, "metadatum" is the grammatically correct term */}
        {metadata.map((metadatum, i) => (
          <meta key={i} {...metadatum} />
        ))}
      </Head>
    </>
  );
}
