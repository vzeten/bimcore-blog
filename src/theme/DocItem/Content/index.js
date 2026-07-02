import React from 'react';
import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import Content from '@theme-original/DocItem/Content';

// JSON-LD для docs-страниц: Article, урокам дополнительно LearningResource.
// Блог движок размечает сам (BlogPosting), docs из коробки получают только
// BreadcrumbList. Корневые страницы локалей (/, /ru/, /es/) не размечаем.
function ArticleStructuredData() {
  const {siteConfig, i18n} = useDocusaurusContext();
  const {metadata, assets} = useDoc();
  if (/^\/(ru\/|es\/)?$/.test(metadata.permalink)) {
    return null;
  }
  const url = siteConfig.url + metadata.permalink;
  const image = siteConfig.url + (assets.image ?? '/img/social-card.jpg');
  // Урок = страница ВНУТРИ /lessons/, сам landing /lessons/ — нет.
  const isLesson = /\/lessons\/.+/.test(metadata.permalink);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': isLesson ? ['Article', 'LearningResource'] : 'Article',
    headline: metadata.title,
    description: metadata.description,
    url,
    mainEntityOfPage: url,
    image,
    inLanguage: i18n.currentLocale,
    ...(isLesson && {learningResourceType: 'Lesson'}),
    author: {
      '@type': 'Organization',
      name: 'BIMCORE',
      url: 'https://bimcore.one',
    },
    publisher: {
      '@type': 'Organization',
      name: 'BIMCORE',
      logo: {
        '@type': 'ImageObject',
        url: siteConfig.url + '/img/logo.png',
      },
    },
  };
  return (
    <Head>
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </Head>
  );
}

export default function ContentWrapper(props) {
  return (
    <>
      <ArticleStructuredData />
      <Content {...props} />
    </>
  );
}
