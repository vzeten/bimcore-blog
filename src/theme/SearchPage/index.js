import React from 'react';
import Head from '@docusaurus/Head';
import SearchPage from '@theme-original/SearchPage';

// Плагин @easyops-cn ставит noindex НЕВАЛИДНЫМ атрибутом (property= вместо
// name=) — Google такой тег не читает. Добавляем корректный. Найдено
// SEO-аудитом #63; можно убрать, когда апстрим починит SearchPage.jsx.
export default function SearchPageWrapper(props) {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex, follow" />
      </Head>
      <SearchPage {...props} />
    </>
  );
}
