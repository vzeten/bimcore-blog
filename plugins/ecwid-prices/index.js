// Docusaurus build-time плагин: одним запросом тянет цены товаров из Ecwid
// и кладёт их в globalData. ProductCard читает цену отсюда и впечатывает
// schema.org-микроразметку (price / priceCurrency / availability) в
// СТАТИЧЕСКИЙ HTML на этапе сборки.
//
// Почему при сборке, а не в браузере: structured data Google читает из
// «сырого» HTML-ответа сервера. Раньше цену дотягивал клиентский fetch в
// ProductCard — в статическом HTML её не было, и GSC ругался «Укажите price»
// (товар недействителен для расширенных результатов). Сборочный плагин
// закрывает это без правки контента статей: ключ поиска цены —
// ecwidProductId, уже прописанный в каждой карточке.
//
// Токен — ПУБЛИЧНЫЙ (только чтение каталога), из customFields.ecwidPublicToken.
// Сбой запроса НЕ валит сборку: возвращаем пустую карту — поведение как без цены.

const DEFAULT_STORE_ID = '86326685';

/** @type {import('@docusaurus/types').PluginModule} */
module.exports = function ecwidPricesPlugin(context, options) {
  const {siteConfig} = context;
  const token =
    (options && options.token) ||
    (siteConfig &&
      siteConfig.customFields &&
      siteConfig.customFields.ecwidPublicToken) ||
    '';
  const storeId = (options && options.storeId) || DEFAULT_STORE_ID;

  return {
    name: 'ecwid-prices',

    async loadContent() {
      if (!token) {
        console.warn(
          '[ecwid-prices] нет токена Ecwid — цены не подтянуты (микроразметка без price)',
        );
        return {prices: {}};
      }

      // Один запрос на весь каталог: до 100 товаров (у магазина их десятки).
      const url =
        `https://app.ecwid.com/api/v3/${storeId}/products` +
        `?token=${encodeURIComponent(token)}&limit=100` +
        `&responseFields=items(id,price,defaultDisplayedPriceFormatted)`;

      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(
            `[ecwid-prices] Ecwid ответил ${res.status} — цены не подтянуты`,
          );
          return {prices: {}};
        }
        const data = await res.json();
        const prices = {};
        for (const item of (data && data.items) || []) {
          if (item.price == null) continue;
          prices[String(item.id)] = {
            value: String(item.price),
            formatted: item.defaultDisplayedPriceFormatted || '',
          };
        }
        console.log(
          `[ecwid-prices] подтянуто цен: ${Object.keys(prices).length}`,
        );
        return {prices};
      } catch (err) {
        console.warn(
          `[ecwid-prices] запрос к Ecwid не удался (${err.message}) — цены не подтянуты`,
        );
        return {prices: {}};
      }
    },

    async contentLoaded({content, actions}) {
      actions.setGlobalData(content || {prices: {}});
    },
  };
};
