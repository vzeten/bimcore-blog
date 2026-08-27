// Сборочный плагин: кладёт карту доступности переводов в globalData, откуда
// её читает src/theme/SiteMetadata. Сама карта строится в map.mjs — тот же
// модуль используют docusaurus.config.js и scripts/seo-audit.mjs, чтобы
// страница, sitemap, llms.txt и проверка не разошлись между собой.

import {buildTranslationMap, toClientData} from './map.mjs';

export const PLUGIN_NAME = 'translation-map';

/** @type {import('@docusaurus/types').PluginModule} */
export default function translationMapPlugin(context) {
  const {siteDir, i18n} = context;

  return {
    name: PLUGIN_NAME,

    async loadContent() {
      return buildTranslationMap({
        siteDir,
        locales: i18n.locales,
        defaultLocale: i18n.defaultLocale,
      });
    },

    async contentLoaded({content, actions}) {
      actions.setGlobalData(toClientData(content));
    },
  };
}
