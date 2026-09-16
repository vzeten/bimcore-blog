/**
 * Тест проверки готовой сборки — scripts/seo-audit.mjs.
 *
 * Сборка здесь — рукотворная папка с HTML и sitemap, сайт — три статьи на
 * временном диске. Главные случаи:
 *   • открытая русская статья ссылается hreflang/x-default на закрытые
 *     EN/ES-заглушки (поломка, которую прежний аудит считал нормой);
 *   • ссылка на отсутствующую страницу и на страницу вне sitemap;
 *   • закрытая страница-источник (поиск, служебные списки) не проверяется;
 *   • устаревшая сборка — ошибка, с --allow-stale — предупреждение.
 *
 * Запуск: npm test
 */

import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {auditBuild, staleInputs} from './seo-audit.mjs';

const DEFAULT_LOCALE = 'en';
const LOCALES = ['en', 'ru', 'es'];
const ORIGIN = 'https://example.test';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-audit-'));
after(() => fs.rmSync(root, {recursive: true, force: true}));

// ---------- сайт-образец ----------

const siteDir = path.join(root, 'site');
const docs = (locale) =>
  locale === DEFAULT_LOCALE
    ? 'docs'
    : `i18n/${locale}/docusaurus-plugin-content-docs/current`;

function write(dir, relPath, content) {
  const file = path.join(dir, ...relPath.split('/'));
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

const article = (extra = '') =>
  `---\ntitle: Пример${extra ? `\n${extra}` : ''}\n---\n\nТекст.\n`;

// only-ru: статья только по-русски, EN и ES — заглушки.
write(siteDir, `${docs('en')}/only-ru/index.mdx`, article('unlisted: true'));
write(siteDir, `${docs('ru')}/only-ru/index.mdx`, article());
write(siteDir, `${docs('es')}/only-ru/index.mdx`, article('unlisted: true'));
// full: EN и RU настоящие, ES не переведён (показывает английский текст).
write(siteDir, `${docs('en')}/full/index.mdx`, article());
write(siteDir, `${docs('ru')}/full/index.mdx`, article());
// drafted: EN черновик (в production его нет), RU опубликован, ES без файла
// наследует черновик — страницы тоже нет.
write(siteDir, `${docs('en')}/drafted/index.mdx`, article('draft: true'));
write(siteDir, `${docs('ru')}/drafted/index.mdx`, article());

// ---------- сборка-образец ----------

let counter = 0;
function newBuildDir() {
  counter += 1;
  return path.join(root, `build-${counter}`);
}

function pageHtml({noindex = false, alternates = [], og = [], robots = null}) {
  const head = [];
  // Как в сборке: открытая страница разрешает крупную картинку, закрытая несёт только noindex.
  const robotsTags = robots ?? [noindex ? 'noindex, nofollow' : 'max-image-preview:large'];
  for (const content of robotsTags) head.push(`<meta data-rh="true" name="robots" content="${content}">`);
  for (const [hreflang, urlPath] of alternates) {
    // Как в минифицированной сборке: часть атрибутов без кавычек.
    head.push(`<link data-rh="true" rel=alternate href="${ORIGIN}${urlPath}" hreflang=${hreflang}>`);
  }
  for (const lang of og) {
    head.push(`<meta data-rh="true" property="og:locale:alternate" content="${lang}">`);
  }
  return `<!doctype html><html><head>${head.join('')}</head><body></body></html>`;
}

function sitemapXml(paths) {
  const urls = paths.map((p) => `<url><loc>${ORIGIN}${p}</loc></url>`).join('');
  return `<?xml version="1.0"?><urlset>${urls}</urlset>`;
}

/**
 * Правильная сборка: у only-ru открыта только русская версия, hreflang и
 * x-default всех трёх страниц ведут на неё; у full открыты EN и RU, ES закрыт.
 */
function correctBuild() {
  return {
    pages: {
      '/': {alternates: [['en', '/'], ['ru', '/ru/'], ['es', '/es/'], ['x-default', '/']]},
      '/ru/': {alternates: [['en', '/'], ['ru', '/ru/'], ['es', '/es/'], ['x-default', '/']]},
      '/es/': {alternates: [['en', '/'], ['ru', '/ru/'], ['es', '/es/'], ['x-default', '/']]},

      '/only-ru/': {
        noindex: true,
        alternates: [['ru', '/ru/only-ru/'], ['x-default', '/ru/only-ru/']],
        og: ['ru'],
      },
      '/ru/only-ru/': {
        alternates: [['ru', '/ru/only-ru/'], ['x-default', '/ru/only-ru/']],
      },
      '/es/only-ru/': {
        noindex: true,
        alternates: [['ru', '/ru/only-ru/'], ['x-default', '/ru/only-ru/']],
        og: ['ru'],
      },

      '/full/': {
        alternates: [['en', '/full/'], ['ru', '/ru/full/'], ['x-default', '/full/']],
        og: ['ru'],
      },
      '/ru/full/': {
        alternates: [['en', '/full/'], ['ru', '/ru/full/'], ['x-default', '/full/']],
        og: ['en'],
      },
      '/es/full/': {
        noindex: true,
        alternates: [['en', '/full/'], ['ru', '/ru/full/'], ['x-default', '/full/']],
        og: ['en', 'ru'],
      },

      // /drafted/ и /es/drafted/ в сборке отсутствуют.
      '/ru/drafted/': {
        alternates: [['ru', '/ru/drafted/'], ['x-default', '/ru/drafted/']],
      },
    },
    sitemaps: {
      en: ['/', '/full/'],
      ru: ['/ru/', '/ru/only-ru/', '/ru/full/', '/ru/drafted/'],
      es: ['/es/'],
    },
  };
}

function render(build) {
  const outDir = newBuildDir();
  for (const [urlPath, page] of Object.entries(build.pages)) {
    write(outDir, `${urlPath}index.html`.replace(/^\//, ''), pageHtml(page));
  }
  for (const [locale, paths] of Object.entries(build.sitemaps)) {
    const dir = locale === DEFAULT_LOCALE ? '' : `${locale}/`;
    write(outDir, `${dir}sitemap.xml`, sitemapXml(paths));
    write(outDir, `${dir}llms.txt`, '');
  }
  return outDir;
}

function audit(outDir, extra = {}) {
  return auditBuild({
    siteDir,
    outDir,
    locales: LOCALES,
    defaultLocale: DEFAULT_LOCALE,
    ...extra,
  });
}

const messages = (result) => result.problems.map((p) => `${p.where} — ${p.message}`);
const some = (result, re) => messages(result).some((m) => re.test(m));

// ---------- сами проверки ----------

test('правильная сборка проходит без поломок', () => {
  const result = audit(render(correctBuild()));
  assert.deepEqual(messages(result), []);
  assert.equal(result.stats.openPages, 7, 'открытых страниц с языковыми ссылками');
});

test('открытая RU-статья не должна ссылаться на закрытые EN/ES-заглушки', () => {
  const build = correctBuild();
  // Так собирал сайт до исправления: все локали как переводы, x-default на EN.
  build.pages['/ru/only-ru/'] = {
    alternates: [
      ['en', '/only-ru/'],
      ['ru', '/ru/only-ru/'],
      ['es', '/es/only-ru/'],
      ['x-default', '/only-ru/'],
    ],
    og: ['en', 'es'],
  };
  const result = audit(render(build));

  // Проверка по сборке, без карты: цель закрыта noindex.
  assert.ok(some(result, /страница \/ru\/only-ru\/ — hreflang en ведёт на закрытую \(noindex\) страницу \/only-ru\//));
  assert.ok(some(result, /страница \/ru\/only-ru\/ — hreflang es ведёт на закрытую \(noindex\) страницу \/es\/only-ru\//));
  assert.ok(some(result, /страница \/ru\/only-ru\/ — hreflang x-default ведёт на закрытую \(noindex\) страницу \/only-ru\//));
  // Проверка по карте: та же поломка своими словами.
  assert.ok(some(result, /ru \/ru\/only-ru\/ — hreflang обещает версию, которая закрыта или отсутствует: \/only-ru\//));
  assert.ok(some(result, /ru \/ru\/only-ru\/ — x-default должен указывать на \/ru\/only-ru\/, а указывает на \/only-ru\//));
  assert.ok(some(result, /ru \/ru\/only-ru\/ — og:locale:alternate обещает закрытую или отсутствующую версию: en/));
});

test('открытая страница без max-image-preview:large — ошибка', () => {
  const build = correctBuild();
  build.pages['/ru/full/'].robots = [];
  const result = audit(render(build));
  assert.ok(some(result, /ru \/ru\/full\/ — открытая страница не разрешает крупную картинку в выдаче/));
});

test('закрытая страница с тегом картинки рядом с noindex — ошибка: одноимённые теги перебивают друг друга', () => {
  const build = correctBuild();
  build.pages['/es/full/'].robots = ['max-image-preview:large', 'noindex, follow'];
  const result = audit(render(build));
  assert.ok(some(result, /es \/es\/full\/ — несколько meta robots на одной странице/));
});

test('поломка ловится и без карты: x-default открытой страницы на закрытую версию', () => {
  const build = correctBuild();
  build.pages['/ru/full/'].alternates = [
    ['en', '/full/'],
    ['ru', '/ru/full/'],
    ['x-default', '/es/full/'],
  ];
  const result = audit(render(build));
  assert.ok(some(result, /страница \/ru\/full\/ — hreflang x-default ведёт на закрытую \(noindex\) страницу \/es\/full\//));
});

test('hreflang на отсутствующую страницу — ошибка', () => {
  const build = correctBuild();
  build.pages['/ru/only-ru/'].alternates.push(['de', '/de/only-ru/']);
  const result = audit(render(build));
  assert.ok(some(result, /страница \/ru\/only-ru\/ — hreflang de ведёт на отсутствующую страницу \/de\/only-ru\//));
});

test('hreflang на открытую страницу вне sitemap — ошибка', () => {
  const build = correctBuild();
  build.sitemaps.ru = build.sitemaps.ru.filter((p) => p !== '/ru/full/');
  const result = audit(render(build));
  assert.ok(some(result, /страница \/full\/ — hreflang ru ведёт на страницу вне sitemap \/ru\/full\//));
  // и по карте: настоящий перевод пропал из sitemap
  assert.ok(some(result, /ru \/ru\/full\/ — настоящий перевод пропал из sitemap локали/));
});

test('языковая связь должна быть взаимной и включать саму страницу', () => {
  const build = correctBuild();
  // /full/ ссылается на /ru/full/, а та назад не ссылается и себя hreflang
  // не называет (x-default на себя — не самоссылка).
  build.pages['/ru/full/'].alternates = [['x-default', '/ru/full/']];
  const result = audit(render(build));
  assert.ok(some(result, /страница \/full\/ — нет обратной языковой ссылки со страницы \/ru\/full\//));
  assert.ok(some(result, /страница \/ru\/full\/ — нет hreflang на саму себя/));
});

test('закрытая страница-источник вне карты не проверяется', () => {
  const build = correctBuild();
  // Поиск закрыт во всех локалях и ссылается на такие же закрытые копии —
  // так делает сама тема, и для поиска это безвредно.
  for (const prefix of ['/', '/ru/', '/es/']) {
    build.pages[`${prefix}search/`] = {
      noindex: true,
      alternates: [
        ['en', '/search/'],
        ['ru', '/ru/search/'],
        ['es', '/es/search/'],
        ['x-default', '/search/'],
      ],
    };
  }
  const result = audit(render(build));
  assert.deepEqual(messages(result), []);
});

test('устаревшая сборка — ошибка, с --allow-stale — предупреждение', () => {
  const outDir = render(correctBuild());
  const marker = path.join(outDir, 'index.html');
  const buildTime = fs.statSync(marker).mtimeMs;

  // Статью поправили через минуту после сборки.
  const edited = path.join(siteDir, ...`${docs('ru')}/only-ru/index.mdx`.split('/'));
  const later = new Date(buildTime + 60_000);
  fs.utimesSync(edited, later, later);

  const stale = staleInputs({siteDir, outDir});
  assert.deepEqual(stale.newer, [
    'i18n/ru/docusaurus-plugin-content-docs/current/only-ru/index.mdx',
  ]);

  const strict = audit(outDir);
  assert.equal(strict.stats, null, 'остальные проверки на устаревшей сборке не идут');
  assert.ok(some(strict, /сборка — исходники новее сборки \(.*only-ru\/index\.mdx.*\) — соберите сайт заново/));

  const lenient = audit(outDir, {allowStale: true});
  assert.deepEqual(messages(lenient), []);
  assert.ok(lenient.warnings.some((w) => /сборка устарела, проверяется как есть/.test(w)));

  // Вернули исходник назад во времени — сборка снова свежая.
  const earlier = new Date(buildTime - 60_000);
  fs.utimesSync(edited, earlier, earlier);
  assert.deepEqual(staleInputs({siteDir, outDir}).newer, []);
  assert.deepEqual(messages(audit(outDir)), []);
});

test('без index.html сборка считается незавершённой', () => {
  const outDir = render(correctBuild());
  fs.rmSync(path.join(outDir, 'index.html'));
  const result = audit(outDir);
  assert.ok(some(result, /сборка — в .* нет index\.html — сборка не завершена/));
});

test('черновик (draft) в production-сборке отсутствует; заглушка (unlisted) существует с noindex', () => {
  const build = correctBuild();
  // Черновик просочился в сборку и в sitemap, а заглушка EN исчезла.
  build.pages['/drafted/'] = {
    alternates: [['ru', '/ru/drafted/'], ['x-default', '/ru/drafted/']],
  };
  build.sitemaps.en.push('/drafted/');
  delete build.pages['/only-ru/'];
  const result = audit(render(build));

  assert.ok(some(result, /en \/drafted\/ — черновик \(draft\) попал в production-сборку/));
  assert.ok(some(result, /en \/drafted\/ — черновик \(draft\) попал в sitemap локали/));
  assert.ok(some(result, /en \/only-ru\/ — страница не найдена в сборке/));
  // ES наследует черновик EN: отсутствие страницы — норма, не поломка
  assert.ok(!some(result, /es \/es\/drafted\//));
});

test('открытая RU-страница не должна ссылаться на черновик EN', () => {
  const build = correctBuild();
  // Так было бы, считай карта черновик индексируемым: EN в hreflang и x-default.
  build.pages['/ru/drafted/'] = {
    alternates: [['en', '/drafted/'], ['ru', '/ru/drafted/'], ['x-default', '/drafted/']],
    og: ['en'],
  };
  const result = audit(render(build));

  // по сборке: цели нет
  assert.ok(some(result, /страница \/ru\/drafted\/ — hreflang en ведёт на отсутствующую страницу \/drafted\//));
  assert.ok(some(result, /страница \/ru\/drafted\/ — hreflang x-default ведёт на отсутствующую страницу \/drafted\//));
  // по карте: черновик не обещается
  assert.ok(some(result, /ru \/ru\/drafted\/ — hreflang обещает версию, которая закрыта или отсутствует: \/drafted\//));
  assert.ok(some(result, /ru \/ru\/drafted\/ — x-default должен указывать на \/ru\/drafted\/, а указывает на \/drafted\//));
  assert.ok(some(result, /ru \/ru\/drafted\/ — og:locale:alternate обещает закрытую или отсутствующую версию: en/));
});

test('переход: после снятия draft с EN карта ждёт en+ru и x-default en', () => {
  // Тот же сайт, но EN-статья опубликована; сборка осталась «черновой».
  const publishedSite = path.join(root, 'site-published');
  fs.cpSync(siteDir, publishedSite, {recursive: true});
  write(publishedSite, `${docs('en')}/drafted/index.mdx`, article());

  const stale = audit(render(correctBuild()), {siteDir: publishedSite});
  assert.ok(some(stale, /en \/drafted\/ — страница не найдена в сборке/));
  assert.ok(some(stale, /ru \/ru\/drafted\/ — потерян hreflang на индексируемую версию: \/drafted\//));
  assert.ok(some(stale, /ru \/ru\/drafted\/ — x-default должен указывать на \/drafted\/, а указывает на \/ru\/drafted\//));

  // Правильная сборка опубликованной статьи: EN и RU открыты, ES без файла
  // показывает английский текст и закрыт noindex.
  const build = correctBuild();
  const both = [['en', '/drafted/'], ['ru', '/ru/drafted/'], ['x-default', '/drafted/']];
  build.pages['/drafted/'] = {alternates: both, og: ['ru']};
  build.pages['/ru/drafted/'] = {alternates: both, og: ['en']};
  build.pages['/es/drafted/'] = {noindex: true, alternates: both, og: ['en', 'ru']};
  build.sitemaps.en.push('/drafted/');
  const fresh = audit(render(build), {siteDir: publishedSite});
  assert.deepEqual(messages(fresh), []);
});

test('пара draft + unlisted: страница ожидается отсутствующей, с предупреждением', () => {
  const site = path.join(root, 'site-both');
  fs.cpSync(siteDir, site, {recursive: true});
  write(site, `${docs('en')}/drafted/index.mdx`, article('draft: true\nunlisted: true'));

  const build = correctBuild();
  const result = audit(render(build), {siteDir: site});
  assert.deepEqual(messages(result), []);
  assert.ok(result.warnings.some((w) => /en \/drafted\/: в шапке одновременно draft и unlisted/.test(w)));

  // и как «нормальная» заглушка с noindex она тоже не принимается
  build.pages['/drafted/'] = {
    noindex: true,
    alternates: [['ru', '/ru/drafted/'], ['x-default', '/ru/drafted/']],
    og: ['ru'],
  };
  const leaked = audit(render(build), {siteDir: site});
  assert.ok(some(leaked, /en \/drafted\/ — черновик \(draft\) попал в production-сборку/));
});
