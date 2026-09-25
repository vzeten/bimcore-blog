import React from 'react';
import Head from '@docusaurus/Head';

// JSON-LD FAQPage раздела «Вопросы и ответы» (ED-029). Компонент вставляет плагин сборки
// plugins/faq-schema.mjs — вручную в статьи его не пишут. На странице ничего не показывает.
export default function FaqSchema({data}) {
  if (typeof data !== 'string' || data === '') return null;
  return (
    <Head>
      <script type="application/ld+json">{data}</script>
    </Head>
  );
}
