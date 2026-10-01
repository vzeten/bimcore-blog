// Сборочный плагин: название, описание и картинка набора для карточки товара — из карточки в его инструкции
// (решение владельца 2026-10-01: в статье задаются только товар и число кнопок, остальное подтягивается само).
//
// Источник один — карточка в инструкции набора на языке собираемой страницы: `src/data/products.json` говорит,
// где лежит инструкция товара, а плагин читает в ней тег `<ProductCard>` и импорт его картинки. Ничего не
// копируется: картинка подключается тем же файлом, что и в инструкции.
//
// Результат — модуль `@generated/product-cards/default/catalog.js`: `{код: {name, description, imageAlt, image}}`.
// Нет инструкции на этом языке (например, у шаблона — только русская) или в ней нет карточки — товара в модуле
// нет, и карточка в статье берёт свойства, записанные в самой статье.

import fs from 'node:fs';
import path from 'node:path';

const ТЕГ = /<ProductCard\b([\s\S]*?)\/>/;
const СВОЙСТВО = /(\w+)=(?:"([^"]*)"|\{([^}]*)\})/g;

/** Папка документов языка: английский — `docs`, остальные — перевод в `i18n`. */
function корень(siteDir, язык, языкПоУмолчанию) {
  return язык === языкПоУмолчанию
    ? path.join(siteDir, 'docs')
    : path.join(siteDir, 'i18n', язык, 'docusaurus-plugin-content-docs', 'current');
}

/** Файл инструкции по пути из таблицы (`/guides/families/x/` → `…/guides/families/x/index.mdx`). */
function файлИнструкции(папка) {
  for (const имя of ['index.mdx', 'index.md']) {
    const файл = path.join(папка, имя);
    if (fs.existsSync(файл)) return файл;
  }
  return null;
}

/** Свойства карточки из текста инструкции и путь её картинки, либо `null`. */
export function карточкаИнструкции(текст, файл) {
  const тег = ТЕГ.exec(текст);
  if (!тег) return null;
  const свойства = {};
  for (const [, имя, строка, выражение] of тег[1].matchAll(СВОЙСТВО)) свойства[имя] = строка ?? выражение;

  const переменная = (свойства.image ?? '').trim();
  const импорт = переменная
    ? new RegExp(`import\\s+${переменная}\\s+from\\s+['"]([^'"]+)['"]`).exec(текст)
    : null;
  if (!импорт) return null;

  return {
    name: свойства.name ?? '',
    description: свойства.description ?? '',
    imageAlt: свойства.imageAlt ?? '',
    картинка: path.resolve(path.dirname(файл), импорт[1]),
  };
}

/** Текст модуля: импорт каждой картинки (от корня сайта, `@site/…`) и таблица `{код: {…, image}}`. */
export function модульКаталога(записи, siteDir) {
  const импорты = [];
  const строки = [];
  Object.entries(записи).forEach(([код, запись], номер) => {
    const имя = `картинка${номер}`;
    const отКорня = path.relative(siteDir, запись.картинка).split(path.sep).join('/');
    импорты.push(`import ${имя} from ${JSON.stringify(`@site/${отКорня}`)};`);
    const {картинка: _, ...текст} = запись;
    строки.push(`  ${JSON.stringify(код)}: {...${JSON.stringify(текст)}, image: ${имя}},`);
  });
  return `${импорты.join('\n')}\n\nexport default {\n${строки.join('\n')}\n};\n`;
}

/** @type {import('@docusaurus/types').PluginModule} */
export default function productCards(context) {
  const {siteDir, i18n} = context;
  return {
    name: 'product-cards',

    async loadContent() {
      const данные = JSON.parse(fs.readFileSync(path.join(siteDir, 'src', 'data', 'products.json'), 'utf8'));
      const папкаЯзыка = корень(siteDir, i18n.currentLocale, i18n.defaultLocale);
      const записи = {};
      for (const [код, товар] of Object.entries(данные.товары)) {
        if (!товар.инструкция) continue;
        const файл = файлИнструкции(path.join(папкаЯзыка, ...товар.инструкция.split('/').filter(Boolean)));
        if (!файл) continue;
        const карточка = карточкаИнструкции(fs.readFileSync(файл, 'utf8'), файл);
        if (карточка) записи[код] = карточка;
      }
      return записи;
    },

    async contentLoaded({content, actions}) {
      await actions.createData('catalog.js', модульКаталога(content, siteDir));
    },
  };
}
