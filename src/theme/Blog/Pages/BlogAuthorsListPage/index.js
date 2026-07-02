import React from 'react';
import Head from '@docusaurus/Head';
import BlogAuthorsListPage from '@theme-original/Blog/Pages/BlogAuthorsListPage';

// Служебная страница (список авторов): не для поисковой выдачи.
// noindex автоматически исключает её и из sitemap.xml.
export default function BlogAuthorsListPageWrapper(props) {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex, follow" />
      </Head>
      <BlogAuthorsListPage {...props} />
    </>
  );
}
