/*
 * FastEdge 301: knowledge.bimcore.one -> learn.bimcore.one
 *
 * Домен knowledge отдаёт этот код на каждый запрос. Задача — увести весь
 * старый трафик и SEO-вес KB на bolddesk на новые адреса Docusaurus без 404
 * и без лишних прыжков. Соответствие статей — по НОМЕРУ и ЯЗЫКУ в старом URL
 * (`/{lang}/kb/article/{id}/...`), название после номера не важно — поэтому
 * кириллическая «с» в EN-шторах (#21) и любые варианты хвоста не ломают карту.
 *
 * Правило один-в-один со структурой learn (trailingSlash: true — цели СО слешем):
 *   ru  -> https://learn.bimcore.one/ru/guides/families/<slug>/
 *   en  -> https://learn.bimcore.one/guides/families/<slug>/   (EN = дефолт, без префикса)
 *
 * Ни один запрос не отдаёт 404: незнакомые адреса уходят на главную нужного языка.
 */

const LEARN = "https://learn.bimcore.one";

// Код редиректа. 301 — постоянный, передаёт SEO-вес (то, что нам нужно).
// На первый осторожный час можно временно поставить 302 (не кешируется браузером),
// убедиться на боевом домене, что всё верно, и вернуть 301.
const STATUS = 301;

// id статьи на knowledge (bolddesk) -> slug на learn. Источник: data/articles.md.
const ID2SLUG = {
  1: "kitchen-for-revit",
  2: "storage-cabinets-for-revit",
  3: "retro-style-socket-for-revit",
  4: "doors-for-revit",
  11: "plants-for-revit",
  13: "modular-sofa-for-revit",
  14: "sofas-for-revit",
  15: "curtains-and-blinds-for-revit",
  16: "windows-for-revit",
  18: "sockets-for-revit",
  19: "armchairs-for-revit",
  20: "sideboards-dressers-for-revit",
  21: "chairs-for-revit",
  22: "bathroom-furniture-for-revit",
  23: "bathroom-for-revit",
  24: "wardrobe-for-revit",
  25: "beds-for-revit",
  26: "radiators-for-revit",
  27: "shelving-for-revit",
};

// Служебные файлы уводим на их аналоги на learn (не на главную) —
// чтобы Google, перечитав старый sitemap/robots, быстрее увидел новые 301.
const SERVICE = {
  "/robots.txt": `${LEARN}/robots.txt`,
  "/sitemap.xml": `${LEARN}/sitemap.xml`,
  "/sitemap_ru.xml": `${LEARN}/ru/sitemap.xml`,
  "/sitemap_en-us.xml": `${LEARN}/sitemap.xml`, // EN = дефолтная локаль learn, sitemap в корне
};

/**
 * Чистая функция: по старому URL knowledge вернуть цель на learn.
 * Принимает и абсолютный URL, и путь — host по умолчанию knowledge.
 * Без export: сборщик fastedge-build принимает только script, не модуль;
 * тесты загружают этот файл через node:vm (см. redirect.test.js).
 * @param {string} rawUrl
 * @returns {string} абсолютный URL цели на learn (никогда не пустой)
 */
function resolveRedirect(rawUrl) {
  const url = new URL(rawUrl, "https://knowledge.bimcore.one");
  const path = url.pathname;
  const lower = path.toLowerCase();
  const query = url.search; // сохраняем ?utm_... для аналитики кампаний

  // 1. Служебные файлы — точное совпадение (без переноса query).
  if (SERVICE[lower]) return SERVICE[lower];

  // 2. Статья по номеру и языку: /{lang}/kb/article/{id}[/...]
  const m = lower.match(/^\/(ru|en-us)\/kb\/article\/(\d+)(?:\/|$)/);
  if (m) {
    const isRu = m[1] === "ru";
    const slug = ID2SLUG[Number(m[2])];
    if (slug) {
      const base = isRu
        ? `${LEARN}/ru/guides/families/${slug}/`
        : `${LEARN}/guides/families/${slug}/`;
      return base + query;
    }
    // Номер незнакомый — уводим на главную языка, а не в 404.
    return (isRu ? `${LEARN}/ru/` : `${LEARN}/`) + query;
  }

  // 3. Прочие страницы старого сайта — на главную нужного языка.
  if (lower === "/ru" || lower.startsWith("/ru/")) return `${LEARN}/ru/` + query;
  if (lower === "/en-us" || lower.startsWith("/en-us/")) return `${LEARN}/` + query;

  // 4. Корень и всё неизвестное — на главную learn (EN — дефолт).
  return `${LEARN}/` + query;
}

async function handle(event) {
  const target = resolveRedirect(event.request.url);
  return new Response(null, {
    status: STATUS,
    headers: { Location: target },
  });
}

// В FastEdge addEventListener — глобальный; в node (для тестов) его нет.
if (typeof addEventListener !== "undefined") {
  addEventListener("fetch", (event) => event.respondWith(handle(event)));
}
