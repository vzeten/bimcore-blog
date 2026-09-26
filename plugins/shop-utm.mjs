// Метка перехода у ссылок из статей в магазин (ED-054, операция 3, шаг 2; решение владельца 2026-09-26).
// При сборке каждая ссылка на bimcore.one в статье — markdown-ссылка или строковое свойство блока (например,
// `buyUrl` карточки товара) — получает `utm_source=learn`, `utm_medium` (статья или блок) и `utm_campaign` —
// язык и адрес статьи. Магазин Ecwid запоминает метки у заказа, и раздел «Продажи» редактора видит, какие
// заказы пришли с learn и с какой статьи. Файлы статей не меняются; ссылки с уже заданной меткой не трогаются.

/** Хосты магазина. Сообщество `community.bimcore.one` и сам learn — не магазин. */
const МАГАЗИН = new Set(['bimcore.one', 'www.bimcore.one']);

/** Адрес с меткой learn или прежний адрес: не ссылка на магазин, не разобрался или метка уже есть. */
export function сМеткой(адрес, {носитель, статья}) {
  let url;
  try {
    url = new URL(адрес);
  } catch {
    return адрес;
  }
  if (!МАГАЗИН.has(url.hostname.toLowerCase()) || url.searchParams.has('utm_source')) return адрес;
  url.searchParams.set('utm_source', 'learn');
  url.searchParams.set('utm_medium', носитель);
  if (статья) url.searchParams.set('utm_campaign', статья);
  return url.toString();
}

/** Метка статьи по пути файла: язык и папка статьи (`ru/kitchen-for-revit`), у одиночного файла — его имя. */
export function меткаСтатьи(путь) {
  const части = String(путь ?? '').split(/[\\/]/).filter(Boolean);
  if (части.length === 0) return '';
  const файл = части[части.length - 1].replace(/\.mdx?$/i, '');
  const имя = /^index$/i.test(файл) ? (части[части.length - 2] ?? '') : файл;
  const i18n = части.indexOf('i18n');
  const язык = i18n >= 0 && части[i18n + 1] ? части[i18n + 1] : 'en';
  return `${язык}/${имя}`;
}

function обойти(узел, статья) {
  if (узел.type === 'link' && typeof узел.url === 'string') {
    узел.url = сМеткой(узел.url, {носитель: 'article', статья});
  }
  if ((узел.type === 'mdxJsxFlowElement' || узел.type === 'mdxJsxTextElement') && Array.isArray(узел.attributes)) {
    const носитель = узел.name ? узел.name.toLowerCase() : 'block';
    for (const свойство of узел.attributes) {
      if (свойство.type === 'mdxJsxAttribute' && typeof свойство.value === 'string') {
        свойство.value = сМеткой(свойство.value, {носитель, статья});
      }
    }
  }
  for (const ребёнок of узел.children ?? []) обойти(ребёнок, статья);
}

export default function shopUtm() {
  return (дерево, файл) => обойти(дерево, меткаСтатьи(файл?.path ?? файл?.history?.[0]));
}
