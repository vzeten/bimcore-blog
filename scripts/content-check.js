#!/usr/bin/env node
/**
 * content-check — жёсткие проверки качества статей перед показом владельцу и публикацией.
 *
 * Человеческий стандарт живёт в базе My_brain: it/web/learn/content-quality-standard.md
 * Машинные правила: content-quality-rules.json (в корне репозитория)
 *
 * Запуск:
 *   node scripts/content-check.js            все статьи блога (EN/RU/ES)
 *   node scripts/content-check.js --all      блог + docs
 *   node scripts/content-check.js blog/speed-up-revit
 *   node scripts/content-check.js --json     машинный вывод
 *
 * Коды выхода: 0 — ошибок нет; 1 — есть error.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, 'content-quality-rules.json'), 'utf8'));

const LOCALES = [
  { code: 'en', blog: 'blog', docs: 'docs' },
  { code: 'ru', blog: 'i18n/ru/docusaurus-plugin-content-blog', docs: 'i18n/ru/docusaurus-plugin-content-docs/current' },
  { code: 'es', blog: 'i18n/es/docusaurus-plugin-content-blog', docs: 'i18n/es/docusaurus-plugin-content-docs/current' },
];

const SEVERITY = RULES.severity || {};
const findings = [];

// категория решает, блокирует находка сборку или только предупреждает
const add = (category, file, message, hint) => {
  const level = SEVERITY[category] || 'error';
  findings.push({ level, category, file, message, hint });
};

// ---------- сбор файлов ----------

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.mdx') || entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function collectArticles({ includeDocs }) {
  const files = [];
  for (const loc of LOCALES) {
    files.push(...walk(path.join(ROOT, loc.blog)).map((f) => ({ file: f, locale: loc.code, kind: 'blog' })));
    if (includeDocs) {
      files.push(...walk(path.join(ROOT, loc.docs)).map((f) => ({ file: f, locale: loc.code, kind: 'docs' })));
    }
  }
  return files.filter((f) => !f.file.endsWith('authors.yml'));
}

// ---------- разбор статьи ----------

function parse(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const frontmatter = fm ? fm[1] : '';
  const body = fm ? raw.slice(fm[0].length) : raw;

  const title = (frontmatter.match(/^title:\s*(.+)$/m) || [, ''])[1].replace(/^["']|["']$/g, '').trim();
  const slug = (frontmatter.match(/^slug:\s*(.+)$/m) || [, ''])[1].trim();

  const numbered = [];
  const headings = [];
  const headingRe = new RegExp(RULES.structure.numberedHeadingPattern);
  for (const line of body.split(/\r?\n/)) {
    if (/^#{2,3}\s/.test(line)) headings.push(line);
    if (headingRe.test(line)) numbered.push(line.replace(/^##\s*/, '').trim());
  }

  // первая markdown-таблица считается сводной
  const tableRows = [];
  const lines = body.split(/\r?\n/);
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\|[-\s|:]+\|$/.test(lines[i].trim())) { inTable = true; continue; }
    if (inTable) {
      if (!lines[i].trim().startsWith('|')) break;
      tableRows.push(lines[i]);
    }
  }

  const links = [];
  const linkRe = /\[([^\]]*)\]\(([^)\s]+)\)/g;
  let m;
  while ((m = linkRe.exec(body)) !== null) links.push({ text: m[1], href: m[2] });

  return { raw, frontmatter, body, title, slug, numbered, headings, tableRows, links };
}

// ---------- проверки ----------

function checkStructure(entry, doc) {
  const rel = path.relative(ROOT, entry.file);
  if (!RULES.structure.checkTitleCountMatchesSections) return;

  const numInTitle = doc.title.match(/(\d+)/);
  if (numInTitle && doc.numbered.length > 0) {
    const declared = parseInt(numInTitle[1], 10);
    if (declared !== doc.numbered.length) {
      add('structure', rel, `в заголовке число ${declared}, а нумерованных разделов ${doc.numbered.length}`,
        'считаются только H2 вида "## 1. ", FAQ и служебные разделы не в счёт');
    }
  }

  if (RULES.structure.checkSummaryTableMatchesSections && doc.numbered.length > 0 && doc.tableRows.length > 0) {
    if (doc.tableRows.length !== doc.numbered.length) {
      add('structure', rel, `строк в сводной таблице ${doc.tableRows.length}, а разделов ${doc.numbered.length}`,
        'таблица должна повторять состав и порядок пунктов');
    }
  }

  if (RULES.structure.checkNoLinksInHeadings) {
    for (const h of doc.headings) {
      if (/\]\(/.test(h)) add('structure', rel, `ссылка внутри заголовка: ${h.trim()}`, 'ссылки в H2/H3 уводят вес и ломают сниппет');
    }
  }
}

function checkHeadingNumerals(entry, doc) {
  const map = (RULES.headingNumerals || {})[entry.locale];
  if (!map) return;
  const rel = path.relative(ROOT, entry.file);
  const lines = doc.body.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    if (!/^## /.test(lines[i])) continue;
    const heading = lines[i];
    // \b в JS не знает кириллицы, поэтому границу слова задаём через отсутствие буквы
    const found = Object.keys(map).find((word) =>
      new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, 'iu').test(heading));
    if (!found) continue;

    // считаем жирные подпункты до следующего H2
    let bold = 0;
    for (let j = i + 1; j < lines.length && !/^## /.test(lines[j]); j++) {
      if (/^\*\*[^*]+\*\*/.test(lines[j].trim())) bold++;
    }
    if (bold > 0 && bold !== map[found]) {
      add('headingNumerals', `${rel}:${i + 1}`,
        `в заголовке «${found}» (${map[found]}), а подпунктов в разделе ${bold}`,
        'привести число в заголовке к содержимому или разбить раздел');
    }
  }
}

function checkSummaryTable(entry, doc) {
  const rel = path.relative(ROOT, entry.file);
  for (const row of doc.tableRows) {
    const low = row.toLowerCase();
    for (const bad of RULES.summaryTable.bannedCellPhrases) {
      if (low.includes(bad.toLowerCase())) {
        add('summaryTablePhrases', rel, `в сводной таблице пустая формула «${bad}»`, 'в таблице должен быть конкретный результат, а не оценка');
      }
    }
  }
}

function checkPhrases(entry, doc) {
  const rel = path.relative(ROOT, entry.file);
  const body = doc.body;
  const check = (list, level) => {
    for (const rule of list) {
      if (rule.lang && rule.lang !== entry.locale) continue;
      const idx = body.toLowerCase().indexOf(rule.bad.toLowerCase());
      if (idx !== -1) {
        const line = body.slice(0, idx).split(/\r?\n/).length;
        add(level, `${rel}:${line}`, `«${rule.bad}» — ${rule.why}`, `заменить на: ${rule.good}`);
      }
    }
  };
  check(RULES.phrases.strict, 'phrasesStrict');
  check(RULES.phrases.soft, 'phrasesSoft');
}

function checkTerms(entry, doc) {
  const rel = path.relative(ROOT, entry.file);
  const list = RULES.terms[entry.locale];
  if (!list) return;
  const paragraphs = doc.body.split(/\r?\n\r?\n/);
  for (const term of list) {
    for (const wrong of term.wrong) {
      const re = new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      for (const para of paragraphs) {
        if (!re.test(para)) continue;
        // некоторые термины законны вне диалога Revit: ошибкой считаем только нужный контекст
        if (term.requiresContext && !term.requiresContext.some((c) => para.includes(c))) continue;
        const idx = doc.body.indexOf(para);
        const line = doc.body.slice(0, idx).split(/\r?\n/).length;
        add('terms', `${rel}:${line}`, `термин Revit «${para.match(re)[0]}» не из локализации`,
          `правильно: ${term.right} (${term.context})`);
        break;
      }
    }
  }
}

function buildKnownRoutes(articles) {
  const routes = new Set();
  for (const a of articles) {
    const doc = parse(a.file);
    if (a.kind === 'blog') {
      const slug = doc.slug || path.basename(path.dirname(a.file));
      routes.add(`/blog/${slug.replace(/^\//, '')}`);
    } else if (doc.slug) {
      routes.add(doc.slug.startsWith('/') ? doc.slug : `/${doc.slug}`);
    }
    if (a.kind === 'docs') {
      const rel = path.relative(ROOT, a.file).replace(/\\/g, '/');
      const m = rel.match(/(?:^docs|current)\/(.+)\/index\.mdx?$/);
      if (m) routes.add(`/${m[1]}`);
    }
  }
  routes.add('/blog');
  routes.add('/lessons');
  return routes;
}

function checkLinks(entry, doc, routes) {
  const rel = path.relative(ROOT, entry.file);
  for (const link of doc.links) {
    const href = link.href;
    if (href.startsWith('http')) {
      const domain = href.replace(/^https?:\/\//, '').split('/')[0];
      if (!RULES.links.allowedExternalDomains.includes(domain)) {
        add('linksExternal', rel, `внешний домен вне белого списка: ${domain}`, 'добавить домен в content-quality-rules.json или убрать ссылку');
      }
      continue;
    }
    if (!href.startsWith('/')) continue;
    const clean = href.split('#')[0].replace(/\/$/, '');
    if (!clean) continue;
    const isInternal = RULES.links.internalPrefixes.some((p) => clean.startsWith(p));
    if (!isInternal) continue;
    if (!routes.has(clean)) {
      add('linksInternal', rel, `внутренняя ссылка ведёт в никуда: ${href}`, 'проверить slug целевой статьи');
    }
  }
}

function checkLocaleParity(articles) {
  if (!RULES.structure.checkLocaleParity) return;
  const bySlug = new Map();
  for (const a of articles.filter((x) => x.kind === 'blog')) {
    const doc = parse(a.file);
    const slug = doc.slug || path.basename(path.dirname(a.file));
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push({ locale: a.locale, count: doc.numbered.length, file: path.relative(ROOT, a.file) });
  }
  const exceptions = RULES.structure.parityExceptions || {};
  for (const [slug, list] of bySlug) {
    if (list.length < 2) continue;
    if (exceptions[slug]) continue; // осознанное расхождение локалей, причина записана в правилах
    const counts = [...new Set(list.map((x) => x.count))];
    if (counts.length > 1) {
      add('structure', slug, `разное число пунктов по локалям: ${list.map((x) => `${x.locale}=${x.count}`).join(', ')}`,
        'RU, EN и ES должны совпадать по составу и порядку пунктов');
    }
  }
}

// ---------- запуск ----------

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const includeDocs = args.includes('--all');
  const filter = args.find((a) => !a.startsWith('--'));

  const all = collectArticles({ includeDocs });
  const routes = buildKnownRoutes(collectArticles({ includeDocs: true }));
  const articles = filter
    ? all.filter((a) => path.relative(ROOT, a.file).replace(/\\/g, '/').includes(filter.replace(/\\/g, '/')))
    : all;

  for (const entry of articles) {
    const doc = parse(entry.file);
    checkStructure(entry, doc);
    checkHeadingNumerals(entry, doc);
    checkSummaryTable(entry, doc);
    checkPhrases(entry, doc);
    checkTerms(entry, doc);
    checkLinks(entry, doc, routes);
  }
  checkLocaleParity(articles);

  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warning');

  if (asJson) {
    console.log(JSON.stringify({ checked: articles.length, errors, warnings }, null, 2));
  } else {
    console.log(`\ncontent-check: проверено файлов ${articles.length}\n`);
    const print = (list, label) => {
      if (!list.length) return;
      console.log(`${label} (${list.length}):`);
      for (const f of list) {
        console.log(`  ${f.file}`);
        console.log(`     ${f.message}`);
        if (f.hint) console.log(`     → ${f.hint}`);
      }
      console.log('');
    };
    print(errors, 'ОШИБКИ');
    print(warnings, 'ПРЕДУПРЕЖДЕНИЯ');
    if (!errors.length && !warnings.length) console.log('чисто\n');
    else console.log(`итог: ошибок ${errors.length}, предупреждений ${warnings.length}\n`);
  }

  process.exit(errors.length ? 1 : 0);
}

main();
