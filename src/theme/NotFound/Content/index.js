// Обёртка содержимого штатной страницы «не найдено»: noindex (ED-060). Для несуществующих адресов GitHub Pages
// отдаёт её с кодом 404, а по прямому адресу /404 — с кодом 200, и без noindex Google мог бы проиндексировать её
// как обычную страницу. Обёрнуто именно содержимое, а не вся страница: оно выводится внутри Layout ПОСЛЕ
// SiteMetadata, и одноимённый meta отсюда перебивает общий max-image-preview.
import React from 'react';
import Head from '@docusaurus/Head';
import NotFoundContent from '@theme-original/NotFound/Content';

export default function NotFoundContentWrapper(props) {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex, follow" />
      </Head>
      <NotFoundContent {...props} />
    </>
  );
}
