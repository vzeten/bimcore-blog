import React from 'react';
import Head from '@docusaurus/Head';
import BlogAuthorsPostsPage from '@theme-original/Blog/Pages/BlogAuthorsPostsPage';

// Служебная страница (посты автора): дублирует ленту блога — не для выдачи.
// noindex автоматически исключает её и из sitemap.xml.
export default function BlogAuthorsPostsPageWrapper(props) {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex, follow" />
      </Head>
      <BlogAuthorsPostsPage {...props} />
    </>
  );
}
