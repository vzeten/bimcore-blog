// Конвейер Word (.docx) → статья Docusaurus (index.mdx + img-NN co-location).
//
// Использование:
//   node scripts/word2mdx.js <конфиг.json>
//
// Конфиг (JSON):
//   {
//     "docx": "_word_inbox/файл.docx",          // путь от корня репозитория
//     "target": "docs/guides/families/<slug>",  // папка статьи (EN или i18n/ru/...)
//     "title": "...", "slug": "/guides/families/<slug>",
//     "sidebar_label": "NN Имя", "sidebar_position": NN,
//     "description": "...", "unlisted": true|false,
//     "en_title": "...", "en_sidebar_label": "..."   // (опц.) для авто-заглушки EN
//   }
//
// Что делает (обогащение по шаблону базы знаний, см. architecture.md в vault):
//   - pandoc → markdown, картинки co-location как img-NN (ASCII, по порядку появления)
//   - alt у картинок: «Title — текущий раздел»
//   - обложка image = первая картинка; <CTA type="guide" /> в конце
//   - H1 в теле → сдвиг уровней; «Название набора/Версия...» → список; плотные списки
//   - RU-статья docs без EN-двойника → авто-создание EN-заглушки (инвариант 15:
//     RU-only статья тихо не попадает в сборку)
//
// Требуется переносной pandoc в _tmp/pandoc/ (не в git). Если его нет:
//   качаем windows-x86_64.zip с https://github.com/jgm/pandoc/releases
//   и распаковываем в _tmp/pandoc/.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// Приводит уровни заголовков к чистому каскаду (без скачков уровней).
// Причина проблемы: в Word стили Heading расставлены непоследовательно
// (напр. «1,2,3» = Heading 1, а «4.» = Heading 2; подразделы вразнобой),
// pandoc переносит их как есть. Здесь нумерованные разделы вида «1. …»,
// «2. …» всегда становятся H2 (верхний уровень разделов; H1 рендерит
// Docusaurus из title), а остальные заголовки получают уровень
// «родитель + 1» по их исходной вложенности — без дыр и перескоков.
function normalizeHeadings(md) {
  const lines = md.split('\n');
  const stack = []; // [{orig, norm}]
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = lines[i].match(/^(#{1,6})\s+(.*\S)\s*$/);
    if (!m) continue;
    const orig = m[1].length;
    const textPart = m[2].replace(/^\*\*(.+?)\*\*$/, '$1').trim();
    let norm;
    if (/^\d+\.\s/.test(textPart)) {        // нумерованный раздел верхнего уровня
      norm = 2;
      stack.length = 0;
      stack.push({ orig, norm });
    } else {
      while (stack.length && stack[stack.length - 1].orig >= orig) stack.pop();
      norm = stack.length ? Math.min(stack[stack.length - 1].norm + 1, 6) : 2;
      stack.push({ orig, norm });
    }
    lines[i] = '#'.repeat(norm) + ' ' + textPart;
  }
  return lines.join('\n');
}

function findPandoc() {
  const base = path.join(ROOT, '_tmp', 'pandoc');
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      const exe = path.join(base, d, 'pandoc.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  throw new Error('pandoc не найден. Скачать windows-x86_64.zip с https://github.com/jgm/pandoc/releases и распаковать в _tmp/pandoc/');
}
const PANDOC = findPandoc();

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const work = fs.mkdtempSync(path.join(ROOT, '_tmp', 'w2m-'));
const rawPath = path.join(work, 'raw.md');
execFileSync(PANDOC, [
  path.join(ROOT, cfg.docx), '-t', 'gfm', '--wrap=none',
  `--extract-media=${work}`, '-o', rawPath,
]);

let text = fs.readFileSync(rawPath, 'utf8');

// 0. Windows-переводы строк → \n (иначе . и $ в регулярках не работают через \r)
text = text.replace(/\r\n?/g, '\n');
// картинка внутри заголовка → обычная строка с картинкой
text = text.replace(/^#{1,6}\s*(<img|!\[)/gm, '$1');
// H1 в теле запрещён (title рендерится как H1). Уровни заголовков нормализуются
// ниже (normalizeHeadings) — там же H1 уходит в H2.
// жирность внутри заголовков убрать
text = text.replace(/^(#{2,6}) \*\*(.+?)\*\*[^\S\n]*$/gm, '$1 $2');
// Word оформляет строки «Название набора / Версия...» заголовками — это пункты списка
text = text.replace(/^#{2,6}\s+((?:Set name|Название набора|Версия набора|Версия Revit|Revit version|Version \d).*)$/gim, '- $1');
// строки «\- текст» (автор писал дефисы руками, Word не сделал список) → настоящий список
text = text.replace(/^\\- /gm, '- ');
// рыхлые списки pandoc (пустая строка между пунктами) → плотные
text = text.replace(/^([-*] .*)\n\n(?=[-*] )/gm, '$1\n');
text = text.replace(/^(\d+\. .*)\n\n(?=\d+\. )/gm, '$1\n');

// Нормализация иерархии заголовков (после всех правок уровней/жирности выше)
text = normalizeHeadings(text);

// 1. Word-мусор: span-обёртки убрать (текст оставить), стили не нужны
text = text.replace(/<\/?span[^>]*>/g, '');
// неразрывные пробелы → обычные
text = text.replace(/ /g, ' ');

// 2. Целевая папка: очистить старые картинки и index.mdx (полная замена статьи)
const target = path.join(ROOT, cfg.target);
fs.mkdirSync(target, { recursive: true });
for (const f of fs.readdirSync(target)) {
  if (/^img-\d+\.\w+$/.test(f) || f === 'index.mdx') fs.unlinkSync(path.join(target, f));
}

// 3. Картинки: в порядке появления → img-NN, alt = «Title — текущий раздел»
const mediaMap = new Map(); // исходный файл → новое имя (на случай повторов)
let counter = 0;
let heading = '';
const out = [];
const imgRe = /<img src="([^"]+)"[^>]*\/>|!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;

for (const line of text.split('\n')) {
  const h = line.match(/^(#{2,6})\s+(.+)$/);
  if (h) { heading = h[2].replace(/[*_`#\[\]]/g, '').trim(); out.push(line); continue; }

  const replaced = line.replace(imgRe, (full, htmlSrc, mdSrc) => {
    const src = decodeURI(htmlSrc || mdSrc).replace(/\\/g, '/');
    const base = path.basename(src);
    const srcFile = path.join(work, 'media', base);
    if (!fs.existsSync(srcFile)) throw new Error('нет файла картинки: ' + src);
    let name = mediaMap.get(base);
    if (!name) {
      counter++;
      name = `img-${String(counter).padStart(2, '0')}${path.extname(base).toLowerCase()}`;
      fs.copyFileSync(srcFile, path.join(target, name));
      mediaMap.set(base, name);
    }
    const alt = heading ? `${cfg.title} — ${heading}` : cfg.title;
    return `![${alt}](./${name})`;
  });
  out.push(replaced);
}
text = out.join('\n');

// 4. Пустые заголовки и тройные пустые строки
text = text.replace(/^#{2,6}\s*$/gm, '');
text = text.replace(/\n{3,}/g, '\n\n');

// 5. Проверки ДО записи: ничего сырого не осталось
if (counter === 0) throw new Error('в документе не найдено ни одной картинки');
if (/<img\s/.test(text)) throw new Error('остались неконвертированные <img>');
if (/\]\((?!\.\/img-|https?:|pathname:|\/|#|mailto:)/.test(text)) throw new Error('остались сырые ссылки на media/');

// 6. Frontmatter + CTA
const cover = mediaMap.size ? `./${[...mediaMap.values()][0]}` : null;
const fm = [
  '---',
  `title: ${JSON.stringify(cfg.title)}`,
  `slug: ${cfg.slug}`,
  `sidebar_label: ${JSON.stringify(cfg.sidebar_label)}`,
  `sidebar_position: ${cfg.sidebar_position}`,
  `description: ${JSON.stringify(cfg.description)}`,
  cover ? `image: ${cover}` : null,
  cfg.unlisted ? 'unlisted: true' : null,
  '---',
].filter(Boolean).join('\n');

const body = `${fm}\n\n${text.trim()}\n\n<CTA type="guide" />\n`;
fs.writeFileSync(path.join(target, 'index.mdx'), body);

// 7. RU-only docs-статья без EN-двойника ТИХО не попадает в сборку (инвариант 15).
//    Создаём EN-заглушку «available in Russian» автоматически.
const RU_DOCS = 'i18n/ru/docusaurus-plugin-content-docs/current/';
const targetUnix = cfg.target.replace(/\\/g, '/');
if (targetUnix.startsWith(RU_DOCS)) {
  const enDir = path.join(ROOT, 'docs', targetUnix.slice(RU_DOCS.length));
  const enIndex = path.join(enDir, 'index.mdx');
  if (!fs.existsSync(enIndex)) {
    const enTitle = cfg.en_title || cfg.title;
    const enLabel = cfg.en_sidebar_label || cfg.sidebar_label;
    fs.mkdirSync(enDir, { recursive: true });
    fs.writeFileSync(enIndex, [
      '---',
      `title: ${JSON.stringify(enTitle)}`,
      `slug: ${cfg.slug}`,
      `sidebar_label: ${JSON.stringify(enLabel)}`,
      `sidebar_position: ${cfg.sidebar_position}`,
      'unlisted: true',
      `description: "Article available in Russian"`,
      '---',
      '',
      `This article is currently available in Russian only — [open the Russian version](pathname:///ru${cfg.slug}).`,
      '',
      '<CTA type="guide" />',
      '',
    ].join('\n'));
    console.log(`+ EN-заглушка создана: docs/${targetUnix.slice(RU_DOCS.length)}/index.mdx` +
      (cfg.en_title ? '' : ' (⚠ title взят из RU — проверь en_title в конфиге)'));
  }
}

fs.rmSync(work, { recursive: true, force: true });
console.log(`OK ${cfg.target}: картинок ${counter}, строк ${body.split('\n').length}`);
