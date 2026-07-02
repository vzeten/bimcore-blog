import React from 'react';
import Head from '@docusaurus/Head';
import BlogTagsListPage from '@theme-original/BlogTagsListPage';

// Служебная страница (список тегов): не для поисковой выдачи.
// noindex автоматически исключает её и из sitemap.xml.
export default function BlogTagsListPageWrapper(props) {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex, follow" />
      </Head>
      <BlogTagsListPage {...props} />
    </>
  );
}
