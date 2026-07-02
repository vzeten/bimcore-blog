import React from 'react';
import Head from '@docusaurus/Head';
import BlogTagsPostsPage from '@theme-original/BlogTagsPostsPage';

// Служебная страница (посты по тегу): дублирует ленту блога — не для выдачи.
// noindex автоматически исключает её и из sitemap.xml.
export default function BlogTagsPostsPageWrapper(props) {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex, follow" />
      </Head>
      <BlogTagsPostsPage {...props} />
    </>
  );
}
