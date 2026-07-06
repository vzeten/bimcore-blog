/*
 * Локальный тест логики редиректа. Запуск: node redirect.test.js
 * Не требует сети. Две части:
 *   A. Каждый из 34 реальных URL старого sitemap -> цель на learn (со слешем, тот же язык).
 *   B. Каверзные случаи: слеш/без слуга/регистр/query/кириллица/служебные/неизвестное.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));

// index.js — script для fastedge-build (без export), поэтому грузим его через vm
// и забираем resolveRedirect из песочницы. URL передаём внутрь, addEventListener — нет.
const code = readFileSync(join(here, "index.js"), "utf8");
const resolveRedirect = runInNewContext(`${code}\n; resolveRedirect`, { URL });
let pass = 0;
let fail = 0;

function check(input, expected) {
  const got = resolveRedirect(input);
  if (got === expected) {
    pass++;
  } else {
    fail++;
    console.log(`❌ ${input}\n     ожидали: ${expected}\n     получили: ${got}`);
  }
}

function assert(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    console.log(`❌ ${msg}`);
  }
}

// --- A. Все 34 URL из живого sitemap: цель на learn, тот же язык, со слешем ---
const urls = readFileSync(join(here, "knowledge-sitemap-urls.txt"), "utf8")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

assert(urls.length === 34, `в фикстуре должно быть 34 URL, а их ${urls.length}`);

for (const u of urls) {
  const t = resolveRedirect(u);
  const isRu = /\/ru\//.test(u);
  assert(t.startsWith("https://learn.bimcore.one/"), `цель не на learn: ${u} -> ${t}`);
  assert(t.endsWith("/"), `цель без слеша на конце: ${u} -> ${t}`);
  assert(t.includes("/guides/families/"), `цель не в families: ${u} -> ${t}`);
  assert(
    isRu ? t.includes("/ru/guides/") : !t.includes("/ru/"),
    `язык цели не совпал: ${u} -> ${t}`
  );
}

// --- B. Каверзные случаи ---
const B = "https://knowledge.bimcore.one";

// Обычные статьи
check(`${B}/ru/kb/article/1/02-kitchen-for-revit-ru`, "https://learn.bimcore.one/ru/guides/families/kitchen-for-revit/");
check(`${B}/en-US/kb/article/1/02-kitchen-for-revit-en`, "https://learn.bimcore.one/guides/families/kitchen-for-revit/");

// EN-шторы с кириллической «с» (%D1%81) — совпадение по номеру 15, хвост не важен
check(`${B}/en-US/kb/article/15/%D1%81urtains-and-blinds-for-revit-en`, "https://learn.bimcore.one/guides/families/curtains-and-blinds-for-revit/");

// Слеш на конце старого URL
check(`${B}/ru/kb/article/1/02-kitchen-for-revit-ru/`, "https://learn.bimcore.one/ru/guides/families/kitchen-for-revit/");
// Без названия (усечённый индексом вариант)
check(`${B}/ru/kb/article/1/`, "https://learn.bimcore.one/ru/guides/families/kitchen-for-revit/");
check(`${B}/ru/kb/article/1`, "https://learn.bimcore.one/ru/guides/families/kitchen-for-revit/");
// Другой регистр локали
check(`${B}/en-us/kb/article/1/02-kitchen-for-revit-en`, "https://learn.bimcore.one/guides/families/kitchen-for-revit/");

// Сохранение query (utm кампаний)
check(`${B}/ru/kb/article/1/02-kitchen-for-revit-ru?utm_source=vk&utm_medium=post`, "https://learn.bimcore.one/ru/guides/families/kitchen-for-revit/?utm_source=vk&utm_medium=post");

// Служебные файлы -> аналоги на learn
check(`${B}/robots.txt`, "https://learn.bimcore.one/robots.txt");
check(`${B}/sitemap.xml`, "https://learn.bimcore.one/sitemap.xml");
check(`${B}/sitemap_ru.xml`, "https://learn.bimcore.one/ru/sitemap.xml");
check(`${B}/sitemap_en-US.xml`, "https://learn.bimcore.one/sitemap.xml");

// Неизвестные страницы -> главная нужного языка (не 404)
check(`${B}/ru/kb/category/5/mebel`, "https://learn.bimcore.one/ru/");
check(`${B}/en-US/kb/section/anything`, "https://learn.bimcore.one/");
check(`${B}/ru/`, "https://learn.bimcore.one/ru/");
check(`${B}/en-US/`, "https://learn.bimcore.one/");
check(`${B}/`, "https://learn.bimcore.one/");

// Незнакомый номер статьи -> главная языка, а не битая ссылка
check(`${B}/ru/kb/article/999/nesuschestvuet`, "https://learn.bimcore.one/ru/");

// Функция принимает и голый путь (на случай, если FastEdge отдаёт path без host)
check(`/ru/kb/article/1/02-kitchen-for-revit-ru`, "https://learn.bimcore.one/ru/guides/families/kitchen-for-revit/");

console.log(`\n${fail === 0 ? "✅" : "⚠️"}  Пройдено: ${pass}, провалено: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
