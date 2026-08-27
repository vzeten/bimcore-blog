/**
 * Тест карты доступности переводов — plugins/translation-map/map.mjs.
 *
 * Зачем отдельно от seo-audit. Аудит сборки пользуется этой же картой, поэтому
 * ошибку карты он подтвердит как «ожидаемое поведение» и промолчит. Карту надо
 * проверять на своих файлах, независимо от сайта и от аудита.
 *
 * Главный проверяемый случай: frontmatter в Docusaurus необязателен, поэтому
 * переводом считается САМ ФАЙЛ, а не его шапка. Статья-перевод без шапки —
 * полноценная страница, закрывать её от индексации нельзя.
 *
 * Запуск: npm test
 */

import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildTranslationMap,
  untranslatedRoutesByLocale,
  llmsExcludeRoutePatterns,
} from '../plugins/translation-map/map.mjs';

// ---------- временный сайт-образец ----------

const DEFAULT_LOCALE = 'en';
// Третья локаль намеренно не 'ru' и не 'es': в коде карты кодов языков быть
// не должно, список приходит снаружи.
const LOCALES = [DEFAULT_LOCALE, 'es', 'de'];

const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translation-map-'));

function write(relPath, content) {
  const file = path.join(siteDir, ...relPath.split('/'));
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content, 'utf8');
}

const docs = (locale) =>
  locale === DEFAULT_LOCALE
    ? 'docs'
    : `i18n/${locale}/docusaurus-plugin-content-docs/current`;
const blog = (locale) =>
  locale === DEFAULT_LOCALE
    ? 'blog'
    : `i18n/${locale}/docusaurus-plugin-content-blog`;

const withFrontmatter = (extra = '') =>
  `---\ntitle: Пример${extra ? `\n${extra}` : ''}\n---\n\nТекст статьи.\n`;
const withoutFrontmatter = '# Пример\n\nСтатья вообще без шапки.\n';

// EN — полный набор адресов.
write(`${docs(DEFAULT_LOCALE)}/bare/index.mdx`, withoutFrontmatter);
write(`${docs(DEFAULT_LOCALE)}/plain/index.mdx`, withFrontmatter());
write(`${docs(DEFAULT_LOCALE)}/missing/index.mdx`, withFrontmatter());
write(`${docs(DEFAULT_LOCALE)}/hidden/index.mdx`, withFrontmatter('unlisted: true'));
write(`${docs(DEFAULT_LOCALE)}/slugged/index.mdx`, withFrontmatter('slug: /custom/address'));
write(`${blog(DEFAULT_LOCALE)}/post/index.mdx`, withFrontmatter('slug: post'));

// ES — переводы разного вида.
write(`${docs('es')}/bare/index.mdx`, withoutFrontmatter); // перевод без шапки
write(`${docs('es')}/plain/index.mdx`, withFrontmatter('unlisted: true')); // снят с публикации
write(`${docs('es')}/hidden/index.mdx`, withoutFrontmatter); // свой файл поверх скрытого EN
write(`${docs('es')}/slugged/index.mdx`, withFrontmatter('slug: /custom/address'));
// docs/missing и весь блог по-испански не переведены — файлов нет.
write(`${docs('es')}/orphan/index.mdx`, withFrontmatter()); // перевода без EN-двойника не бывает

// DE — переведён только блог, тоже без шапки.
write(`${blog('de')}/post/index.mdx`, withoutFrontmatter);

after(() => fs.rmSync(siteDir, {recursive: true, force: true}));

const map = buildTranslationMap({
  siteDir,
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
});

const entry = (route) => {
  const found = map.entries.find((e) => e.route === route);
  assert.ok(found, `в карте нет адреса ${route}`);
  return found;
};

// ---------- сами проверки ----------

test('перевод без frontmatter считается переводом', () => {
  const bare = entry('/bare');
  assert.equal(bare.translated.es, true);
  assert.equal(bare.unlisted.es, false);
});

test('перевода нет — адрес помечен как непереведённый', () => {
  const missing = entry('/missing');
  assert.equal(missing.translated.es, false);
  assert.equal(missing.translated.de, false);
  assert.equal(missing.translated.en, true);
});

test('перевод с unlisted: true остаётся переводом, но скрыт', () => {
  const plain = entry('/plain');
  assert.equal(plain.translated.es, true);
  assert.equal(plain.unlisted.es, true);
  // на другие локали чужой unlisted не распространяется
  assert.equal(plain.unlisted.en, false);
});

test('локализованный файл без frontmatter не наследует unlisted от локали по умолчанию', () => {
  const hidden = entry('/hidden');
  assert.equal(hidden.unlisted.en, true);
  assert.equal(hidden.translated.es, true);
  assert.equal(hidden.unlisted.es, false, 'свой файл отвечает за себя сам');
  // а вот адрес БЕЗ своего файла показывает текст EN, значит и шапку берёт оттуда
  assert.equal(hidden.translated.de, false);
  assert.equal(hidden.unlisted.de, true);
});

test('карта покрывает и docs, и blog, и любую третью локаль', () => {
  const kinds = new Set(map.entries.map((e) => e.kind));
  assert.deepEqual([...kinds].sort(), ['blog', 'docs']);

  const post = entry('/blog/post');
  assert.equal(post.kind, 'blog');
  assert.equal(post.translated.de, true, 'блог переведён на третий язык');
  assert.equal(post.translated.es, false, 'по-испански блога нет');
});

test('адрес берётся из slug, а без slug — из пути', () => {
  assert.ok(map.entries.some((e) => e.route === '/custom/address'));
  assert.ok(map.entries.some((e) => e.route === '/bare'));
  assert.ok(map.entries.some((e) => e.route === '/blog/post'));
});

test('перевод без двойника в локали по умолчанию попадает в сироты', () => {
  assert.equal(map.orphans.length, 1);
  assert.equal(map.orphans[0].locale, 'es');
  assert.match(map.orphans[0].file, /orphan/);
});

test('производные списки повторяют решение карты', () => {
  const untranslated = untranslatedRoutesByLocale(map);
  assert.deepEqual(untranslated.en, []);
  assert.ok(untranslated.es.includes('/missing'));
  assert.ok(untranslated.es.includes('/blog/post'));
  assert.ok(
    !untranslated.es.includes('/bare'),
    'перевод без шапки не должен считаться отсутствующим',
  );

  const patterns = llmsExcludeRoutePatterns(map);
  assert.ok(patterns.includes('/es/missing/'));
  assert.ok(patterns.includes('/es/plain/'), 'скрытый перевод из llms.txt убираем');
  assert.ok(
    !patterns.includes('/es/bare/'),
    'полноценный перевод из llms.txt убирать нельзя',
  );
});
