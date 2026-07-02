import React from 'react';
import Head from '@docusaurus/Head';
import BlogArchivePage from '@theme-original/BlogArchivePage';

// Служебная страница (архив блога): дублирует ленту — не для выдачи.
// noindex автоматически исключает её и из sitemap.xml.
export default function BlogArchivePageWrapper(props) {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex, follow" />
      </Head>
      <BlogArchivePage {...props} />
    </>
  );
}
