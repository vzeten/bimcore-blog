// Docusaurus build-time плагин: одним заходом спрашивает магазин Ecwid и кладёт результат в два
// места. Цены уходят в globalData — ProductCard читает их оттуда и впечатывает schema.org-
// микроразметку (price / priceCurrency / availability) в СТАТИЧЕСКИЙ HTML на этапе сборки.
// Сам каталог (без цен и без токена) ложится в собранный сайт файлом `product-catalog.json`.
//
// Почему при сборке, а не в браузере: structured data Google читает из «сырого» HTML-ответа
// сервера. Раньше цену дотягивал клиентский fetch в ProductCard — в статическом HTML её не было,
// и GSC ругался «Укажите price» (товар недействителен для расширенных результатов). Сборочный
// плагин закрывает это без правки контента статей: ключ поиска цены — ecwidProductId, уже
// прописанный в каждой карточке.
//
// Токен — ПУБЛИЧНЫЙ (только чтение каталога) и живёт ТОЛЬКО в среде процесса сборки: локально из
// `.env.local`, на GitHub Actions из секрета. В `customFields` он больше не кладётся — оттуда он
// уезжал в бандл сайта, то есть в браузер каждого читателя.
// Сбой запроса НЕ валит сборку: возвращаем пустую карту — поведение как без цены.

const CATALOG_FILE = 'product-catalog.json';

/** @type {import('@docusaurus/types').PluginModule} */
module.exports = function ecwidPricesPlugin(context, options) {
  return {
    name: 'ecwid-prices',

    async loadContent() {
      // Нормализатор — общий с сервером редактора и лежит в ESM-модуле рядом: плагин Docusaurus
      // читается как CommonJS, и войти в него можно только динамическим импортом.
      const каталог = await import('./catalog.mjs');
      const token = (options && options.token) || process.env[каталог.ПЕРЕМЕННАЯ_ТОКЕНА] || '';
      const storeId = (options && options.storeId) || каталог.МАГАЗИН;

      if (!token) {
        console.warn(
          '[ecwid-prices] нет токена Ecwid — цены не подтянуты (микроразметка без price)',
        );
        return {prices: {}, каталог: null};
      }

      try {
        const {цены, ...публичное} = await каталог.собратьКаталог({storeId, token});
        console.log(`[ecwid-prices] подтянуто цен: ${Object.keys(цены).length}`);
        return {prices: цены, каталог: публичное};
      } catch (err) {
        console.warn(
          `[ecwid-prices] запрос к Ecwid не удался (${err.message}) — цены не подтянуты`,
        );
        return {prices: {}, каталог: null};
      }
    },

    async contentLoaded({content, actions}) {
      // В globalData уезжают только цены: каталог нужен редактору, а не читателю сайта, и в
      // бандле страницы он был бы лишним весом на каждом открытии статьи.
      actions.setGlobalData({prices: (content && content.prices) || {}});
    },

    async postBuild({content, outDir}) {
      if (!content || !content.каталог) return;
      const fs = require('node:fs');
      const path = require('node:path');
      fs.writeFileSync(
        path.join(outDir, CATALOG_FILE),
        JSON.stringify(content.каталог),
        'utf8',
      );
    },
  };
};
