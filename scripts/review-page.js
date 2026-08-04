#!/usr/bin/env node
/**
 * Страница ревью — показывает владельцу, что именно изменилось в статье.
 *
 * Сравнивает две версии .mdx и собирает один HTML-файл: текст читается как статья,
 * удалённое зачёркнуто красным, добавленное подсвечено зелёным, у каждого изменения
 * свой номер. Локали EN/RU/ES — вкладками. Причины правок и пересказ иноязычных
 * версий берутся из review-notes.json (пишет Claude или Codex при правках).
 *
 *   node scripts/review-page.js                      сравнить последний коммит с рабочим деревом
 *   node scripts/review-page.js --from=HEAD~1        сравнить с предыдущим коммитом
 *   node scripts/review-page.js --from=A --to=B      сравнить два коммита
 *   node scripts/review-page.js --only=speed-up      только статьи с этой подстрокой в пути
 *
 * Результат: review/index.html (папка в .gitignore).
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'review');
const NOTES_FILE = path.join(ROOT, 'review-notes.json');

// ---------------------------------------------------------------- аргументы

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const FROM = argValue('from', 'HEAD');
const TO = argValue('to', 'WORK'); // WORK — рабочее дерево
const ONLY = argValue('only', '');

// ---------------------------------------------------------------- git

const git = (cmdArgs) =>
  execFileSync('git', cmdArgs, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function changedFiles() {
  const range = TO === 'WORK' ? [FROM] : [FROM, TO];
  const out = git(['diff', '--name-only', ...range, '--', '*.mdx', '*.md']);
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => !ONLY || f.includes(ONLY));
}

function readVersion(ref, file) {
  if (ref === 'WORK') {
    const abs = path.join(ROOT, file);
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
  }
  try {
    return git(['show', `${ref}:${file}`]);
  } catch {
    return ''; // файла в той версии не было
  }
}

// ---------------------------------------------------------------- сравнение

/** Наибольшая общая подпоследовательность: возвращает операции equal/del/ins. */
function diffSequences(a, b, eq = (x, y) => x === y) {
  const n = a.length;
  const m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = eq(a[i], b[j])
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      ops.push({ type: 'equal', a: a[i], b: b[j] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ type: 'del', a: a[i] });
      i++;
    } else {
      ops.push({ type: 'ins', b: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'del', a: a[i++] });
  while (j < m) ops.push({ type: 'ins', b: b[j++] });
  return ops;
}

const tokenize = (line) => line.match(/\s+|[^\s]+/g) || [];

const normalize = (line) => line.trim().replace(/\s+/g, ' ');

/** Доля общих слов — по ней решаем, переписана строка или заменена целиком. */
function similarity(x, y) {
  const wx = normalize(x).toLowerCase().split(' ').filter(Boolean);
  const wy = normalize(y).toLowerCase().split(' ').filter(Boolean);
  if (!wx.length || !wy.length) return 0;
  const pool = [...wy];
  let common = 0;
  for (const w of wx) {
    const at = pool.indexOf(w);
    if (at !== -1) {
      common++;
      pool.splice(at, 1);
    }
  }
  return (2 * common) / (wx.length + wy.length);
}

/**
 * Сводит операции по строкам к блокам страницы: неизменённые строки,
 * переписанные (пословный разбор), удалённые и добавленные целиком.
 */
/**
 * В .mdx абзац бывает разбит переносами строк. Для чтения это мусор:
 * один абзац превращается в четыре «изменения». Склеиваем подряд идущие
 * строки обычного текста в абзац; шапку, заголовки, списки и таблицы не трогаем.
 */
function toParagraphs(text) {
  const lines = text.split('\n');
  const out = [];
  let inFront = lines[0] && lines[0].trim() === '---';
  let buffer = '';

  const flush = () => {
    if (buffer) out.push(buffer);
    buffer = '';
  };

  lines.forEach((line, i) => {
    const raw = line.trim();
    if (inFront) {
      out.push(line);
      if (i > 0 && raw === '---') inFront = false;
      return;
    }
    const standalone = !raw || isService(line) || /^([#>|]|[-*+]\s|\d+\.\s)/.test(raw);
    if (standalone) {
      flush();
      out.push(line);
    } else {
      buffer = buffer ? `${buffer} ${raw}` : line;
    }
  });
  flush();
  return out;
}

function buildBlocks(oldText, newText) {
  const oldLines = toParagraphs(oldText);
  const newLines = toParagraphs(newText);
  const ops = diffSequences(oldLines, newLines, (x, y) => normalize(x) === normalize(y));

  const blocks = [];
  let k = 0;
  while (k < ops.length) {
    const op = ops[k];

    if (op.type === 'equal') {
      blocks.push({ kind: 'same', line: op.a });
      k++;
      continue;
    }

    // собираем подряд идущие удаления и вставки в одну группу
    const dels = [];
    const ins = [];
    while (k < ops.length && ops[k].type !== 'equal') {
      if (ops[k].type === 'del') dels.push(ops[k].a);
      else ins.push(ops[k].b);
      k++;
    }

    const usedIns = new Set();
    dels.forEach((delLine) => {
      let bestAt = -1;
      let bestScore = 0.34; // ниже — считаем разными строками, а не правкой
      ins.forEach((insLine, idx) => {
        if (usedIns.has(idx)) return;
        const score = similarity(delLine, insLine);
        if (score > bestScore) {
          bestScore = score;
          bestAt = idx;
        }
      });
      if (bestAt === -1) {
        if (normalize(delLine)) blocks.push({ kind: 'removed', line: delLine });
      } else {
        usedIns.add(bestAt);
        blocks.push({
          kind: 'changed',
          words: diffSequences(tokenize(delLine), tokenize(ins[bestAt])),
          before: delLine,
          after: ins[bestAt],
        });
      }
    });
    ins.forEach((insLine, idx) => {
      if (!usedIns.has(idx) && normalize(insLine)) blocks.push({ kind: 'added', line: insLine });
    });
  }
  return blocks;
}

// ---------------------------------------------------------------- разметка

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Лёгкая отрисовка markdown, чтобы текст читался как статья, а не как код. */
function md(fragment) {
  let s = esc(fragment);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="lnk" title="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  return s;
}

const isService = (line) =>
  /^(import |export |<[A-Z]|\/>|<\/)/.test(line.trim()) || /^(---|:::)/.test(line.trim());

const FRONTMATTER_KEYS = [
  'title', 'slug', 'description', 'image', 'date', 'authors', 'tags', 'keywords',
  'sidebar_label', 'sidebar_position', 'unlisted', 'draft', 'hide_table_of_contents',
];

/** Поле шапки статьи (frontmatter) или пусто — нужно, чтобы пометить служебные правки. */
function frontmatterField(line) {
  const hit = String(line).match(/^\s*(-\s+)?([a-z_]+):\s*/);
  return hit && FRONTMATTER_KEYS.includes(hit[2]) ? hit[2] : '';
}

function renderLine(line, cls = '') {
  const raw = line.trim();
  if (!raw) return '';
  if (isService(line)) return `<div class="service">${esc(raw)}</div>`;
  const heading = raw.match(/^(#{2,4})\s+(.*)$/);
  if (heading) {
    const level = heading[1].length;
    return `<div class="h h${level} ${cls}">${md(heading[2])}</div>`;
  }
  if (raw.startsWith('|')) return `<div class="row ${cls}">${md(raw)}</div>`;
  return `<div class="p ${cls}">${md(raw)}</div>`;
}

function renderChanged(block, number, note) {
  // Сильно переписанную строку пословный разбор превращает в кашу —
  // такие показываем двумя блоками целиком: было и стало.
  const changedWeight = block.words
    .filter((w) => w.type !== 'equal')
    .reduce((sum, w) => sum + (w.a || w.b || '').trim().length, 0);
  const totalWeight = block.words.reduce((sum, w) => sum + (w.a || w.b || '').trim().length, 0);
  const rewritten = totalWeight > 0 && changedWeight / totalWeight > 0.55;

  let body;
  if (rewritten) {
    body = `<div class="side"><div class="side-h">было</div>${renderLine(
      block.before,
      'del-block'
    )}</div><div class="side"><div class="side-h">стало</div>${renderLine(
      block.after,
      'ins-block'
    )}</div>`;
  } else {
    const parts = block.words
      .map((w) => {
        if (w.type === 'equal') return md(w.a);
        if (w.type === 'del') return `<del>${md(w.a)}</del>`;
        return `<ins>${md(w.b)}</ins>`;
      })
      .join('');
    const heading = block.after.trim().match(/^(#{2,4})\s+/);
    body = heading
      ? `<div class="h h${heading[1].length}">${parts.replace(/#{2,4}\s*/g, '')}</div>`
      : `<div class="p">${parts}</div>`;
  }

  const field = frontmatterField(block.after) || frontmatterField(block.before);
  const tag = field ? `<div class="tag field">служебное поле: ${esc(field)}</div>` : '';

  return `<div class="change" id="c${number}">
    <div class="num">${number}</div>
    <div class="body">${tag}${body}${note ? `<div class="why">${esc(note)}</div>` : ''}</div>
  </div>`;
}

function renderWhole(block, number, note, kind) {
  const label = kind === 'added' ? 'добавлено' : 'удалено';
  const inner = renderLine(block.line, kind === 'added' ? 'ins-block' : 'del-block');
  return `<div class="change" id="c${number}">
    <div class="num">${number}</div>
    <div class="body"><div class="tag ${kind}">${label}</div>${inner}${
      note ? `<div class="why">${esc(note)}</div>` : ''
    }</div>
  </div>`;
}

// ---------------------------------------------------------------- сборка

const localeOf = (file) => {
  if (file.startsWith('i18n/ru/')) return 'ru';
  if (file.startsWith('i18n/es/')) return 'es';
  return 'en';
};

const slugOf = (file) => {
  const parts = file.split('/');
  const idx = parts.findIndex((p) => /^index\.mdx?$/.test(p));
  return idx > 0 ? parts[idx - 1] : parts[parts.length - 1].replace(/\.mdx?$/, '');
};

const LOCALE_TITLE = { ru: 'Русский (мастер)', en: 'English', es: 'Español' };

function loadNotes() {
  if (!fs.existsSync(NOTES_FILE)) return { changes: {}, summaries: {}, caption: '' };
  try {
    const parsed = JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8'));
    return { changes: {}, summaries: {}, caption: '', ...parsed };
  } catch (e) {
    console.warn('review-notes.json не читается:', e.message);
    return { changes: {}, summaries: {}, caption: '' };
  }
}

function runContentCheck() {
  try {
    return execSync('node scripts/content-check.js', { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    return `${e.stdout || ''}${e.stderr || ''}`;
  }
}

function main() {
  const files = changedFiles();
  if (!files.length) {
    console.log('Изменений в статьях нет — сравнивать нечего.');
    console.log(`Сравнивались: ${FROM} → ${TO}${ONLY ? `, фильтр «${ONLY}»` : ''}`);
    return;
  }

  const notes = loadNotes();
  const articles = new Map();
  let counter = 0;

  files.forEach((file) => {
    const blocks = buildBlocks(readVersion(FROM, file), readVersion(TO, file));
    const changes = blocks.filter((b) => b.kind !== 'same').length;
    if (!changes) return;

    const slug = slugOf(file);
    if (!articles.has(slug)) articles.set(slug, new Map());

    const html = blocks
      .map((b) => {
        if (b.kind === 'same') return renderLine(b.line, 'dim');
        counter += 1;
        const note = notes.changes[String(counter)];
        if (b.kind === 'changed') return renderChanged(b, counter, note);
        return renderWhole(b, counter, note, b.kind);
      })
      .join('\n');

    articles.get(slug).set(localeOf(file), { file, html, changes });
  });

  if (!counter) {
    console.log('Смысловых изменений не найдено (правки только в служебных строках).');
    return;
  }

  const check = runContentCheck();
  const page = renderPage(articles, notes, counter, check);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, 'index.html');
  fs.writeFileSync(out, page, 'utf8');

  console.log(`Страница ревью собрана: ${out}`);
  console.log(`Статей: ${articles.size}, изменений: ${counter}. Сравнение: ${FROM} → ${TO}`);
}

function renderPage(articles, notes, total, check) {
  const slugs = [...articles.keys()];

  const tabsArticles = slugs
    .map(
      (slug, i) =>
        `<button class="tab art-tab${i === 0 ? ' on' : ''}" data-art="${esc(slug)}">${esc(slug)}</button>`
    )
    .join('');

  const panels = slugs
    .map((slug, i) => {
      const byLocale = articles.get(slug);
      const order = ['ru', 'en', 'es'].filter((l) => byLocale.has(l));
      const locTabs = order
        .map(
          (l, j) =>
            `<button class="tab loc-tab${j === 0 ? ' on' : ''}" data-loc="${l}">${
              LOCALE_TITLE[l]
            } <span class="cnt">${byLocale.get(l).changes}</span></button>`
        )
        .join('');

      const locPanels = order
        .map((l, j) => {
          const data = byLocale.get(l);
          const summary =
            l !== 'ru' && notes.summaries[l]
              ? `<div class="summary"><div class="summary-h">Что здесь сказано по-русски (пересказ вслепую)</div>${esc(
                  notes.summaries[l]
                )}</div>`
              : '';
          return `<section class="loc-panel${j === 0 ? ' on' : ''}" data-loc="${l}">
            <div class="file">${esc(data.file)}</div>
            ${summary}
            <article class="text">${data.html}</article>
          </section>`;
        })
        .join('');

      return `<section class="art-panel${i === 0 ? ' on' : ''}" data-art="${esc(slug)}">
        <div class="tabs">${locTabs}</div>
        ${locPanels}
      </section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ревью правок — ${esc(slugs.join(', '))}</title>
<style>
  :root {
    --bg: #ffffff; --fg: #1c1c1e; --dim: #8a8a8e; --line: #e3e3e6;
    --del-bg: #ffe3e3; --del-fg: #8c1c1c; --ins-bg: #dcf6e3; --ins-fg: #14622f;
    --accent: #2b6cb0; --panel: #f7f7f8;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #17181a; --fg: #e8e8ea; --dim: #86868b; --line: #2e2f33;
      --del-bg: #4a1f22; --del-fg: #ff9d9d; --ins-bg: #163a24; --ins-fg: #86e0a5;
      --accent: #7cb0e8; --panel: #202124;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 17px/1.65 -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  }
  .wrap { max-width: 860px; margin: 0 auto; padding: 28px 20px 120px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .lead { color: var(--dim); font-size: 15px; margin-bottom: 22px; }
  .caption { background: var(--panel); border-left: 3px solid var(--accent);
    padding: 12px 16px; border-radius: 6px; margin-bottom: 22px; font-size: 15.5px; }
  .tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 18px 0 14px; }
  .tab { border: 1px solid var(--line); background: transparent; color: var(--fg);
    padding: 7px 13px; border-radius: 999px; cursor: pointer; font-size: 14.5px; font-family: inherit; }
  .tab.on { background: var(--accent); border-color: var(--accent); color: #fff; }
  .cnt { opacity: .75; font-size: 12.5px; }
  .art-panel, .loc-panel { display: none; }
  .art-panel.on, .loc-panel.on { display: block; }
  .file { font-size: 12.5px; color: var(--dim); margin-bottom: 14px; font-family: ui-monospace, Consolas, monospace; }
  .summary { background: var(--panel); border-radius: 8px; padding: 14px 16px; margin-bottom: 20px; font-size: 15.5px; }
  .summary-h { font-size: 12.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--dim); margin-bottom: 6px; }
  .text .p { margin: 0 0 13px; }
  .text .h { font-weight: 700; margin: 26px 0 12px; line-height: 1.35; }
  .h2 { font-size: 20px; } .h3 { font-size: 18px; } .h4 { font-size: 16.5px; }
  .row { font-family: ui-monospace, Consolas, monospace; font-size: 13.5px; margin: 0 0 4px; white-space: pre-wrap; }
  .service { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: var(--dim); margin: 0 0 6px; opacity: .6; }
  .dim { color: var(--dim); }
  body.only-changes .dim, body.only-changes .service { display: none; }
  del { background: var(--del-bg); color: var(--del-fg); text-decoration: line-through; padding: 1px 2px; border-radius: 3px; }
  ins { background: var(--ins-bg); color: var(--ins-fg); text-decoration: none; padding: 1px 2px; border-radius: 3px; }
  .change { display: flex; gap: 12px; align-items: flex-start; margin: 0 0 16px;
    border-left: 3px solid var(--accent); padding: 10px 0 10px 12px; background: var(--panel); border-radius: 0 8px 8px 0; }
  .change .num { flex: 0 0 auto; min-width: 26px; height: 26px; border-radius: 50%;
    background: var(--accent); color: #fff; font-size: 13.5px; display: flex;
    align-items: center; justify-content: center; margin-top: 2px; }
  .change .body { flex: 1 1 auto; min-width: 0; padding-right: 12px; }
  .change .body .p:last-child, .change .body .h:last-child { margin-bottom: 0; }
  .why { font-size: 14px; color: var(--dim); margin-top: 7px; padding-top: 7px; border-top: 1px dashed var(--line); }
  .tag { display: inline-block; font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em;
    padding: 2px 7px; border-radius: 4px; margin-bottom: 6px; }
  .tag.added { background: var(--ins-bg); color: var(--ins-fg); }
  .tag.removed { background: var(--del-bg); color: var(--del-fg); }
  .tag.field { background: var(--panel); color: var(--dim); border: 1px solid var(--line); }
  .side { margin-bottom: 8px; }
  .side:last-child { margin-bottom: 0; }
  .side-h { font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--dim); margin-bottom: 3px; }
  .del-block { text-decoration: line-through; color: var(--del-fg); }
  .ins-block { color: var(--ins-fg); }
  .lnk { color: var(--accent); text-decoration: underline dotted; cursor: help; }
  code { font-family: ui-monospace, Consolas, monospace; font-size: .92em;
    background: var(--panel); padding: 1px 5px; border-radius: 4px; }
  .bar { position: fixed; left: 0; right: 0; bottom: 0; background: var(--bg);
    border-top: 1px solid var(--line); padding: 10px 20px; display: flex; gap: 14px;
    align-items: center; justify-content: center; font-size: 14.5px; flex-wrap: wrap; }
  .bar label { display: flex; gap: 6px; align-items: center; cursor: pointer; }
  .hint { color: var(--dim); }
  .bar button { border: 1px solid var(--line); background: transparent; color: var(--fg);
    padding: 7px 13px; border-radius: 8px; cursor: pointer; font-size: 14.5px; font-family: inherit; }
  .bar button.main { background: var(--accent); border-color: var(--accent); color: #fff; }
  .bar button:disabled { opacity: .45; cursor: default; }

  /* комментарии к выделению */
  mark.note { background: #ffe9a8; color: inherit; border-radius: 3px; padding: 1px 0; cursor: pointer; }
  @media (prefers-color-scheme: dark) { mark.note { background: #5a4a12; } }
  mark.note.active { outline: 2px solid var(--accent); }
  #pop { position: absolute; z-index: 40; display: none; }
  #pop button { background: var(--accent); color: #fff; border: 0; border-radius: 8px;
    padding: 8px 14px; font-size: 14.5px; font-family: inherit; cursor: pointer;
    box-shadow: 0 4px 14px rgba(0,0,0,.25); }
  #editor { position: fixed; z-index: 50; right: 20px; bottom: 64px; width: min(420px, calc(100vw - 40px));
    background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 14px;
    box-shadow: 0 10px 34px rgba(0,0,0,.28); display: none; }
  #editor .quote { font-size: 14px; color: var(--dim); border-left: 3px solid var(--accent);
    padding-left: 10px; margin-bottom: 10px; max-height: 92px; overflow: auto; }
  #editor textarea { width: 100%; min-height: 92px; resize: vertical; font: inherit; font-size: 15px;
    background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-radius: 8px; padding: 9px 11px; }
  #editor .acts { display: flex; gap: 8px; margin-top: 10px; align-items: center; flex-wrap: wrap; }
  #editor button { border: 1px solid var(--line); background: transparent; color: var(--fg);
    border-radius: 8px; padding: 7px 12px; font-size: 14.5px; font-family: inherit; cursor: pointer; }
  #editor button.main { background: var(--accent); border-color: var(--accent); color: #fff; }
  #editor button.mic.rec { background: #c0392b; border-color: #c0392b; color: #fff; }
  #editor .micstate { font-size: 13px; color: var(--dim); }
  #list { margin-top: 34px; border-top: 1px solid var(--line); padding-top: 18px; }
  #list h2 { font-size: 17px; margin: 0 0 12px; }
  .note-item { background: var(--panel); border-radius: 8px; padding: 11px 13px; margin-bottom: 10px; }
  .note-item .meta { font-size: 12.5px; color: var(--dim); margin-bottom: 5px; }
  .note-item .q { font-size: 14px; color: var(--dim); border-left: 3px solid var(--line); padding-left: 9px; margin-bottom: 6px; }
  .note-item .txt { font-size: 15.5px; white-space: pre-wrap; }
  .note-item .rm { float: right; border: 0; background: transparent; color: var(--dim);
    cursor: pointer; font-size: 18px; line-height: 1; font-family: inherit; }
  details.check { margin-top: 26px; border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; }
  details.check pre { white-space: pre-wrap; font-size: 12.5px; color: var(--dim); margin: 8px 0 0; }
  summary { cursor: pointer; font-size: 14.5px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Ревью правок</h1>
  <div class="lead">Сравнение ${esc(FROM)} → ${esc(TO)}. Изменений: ${total}. Собрано ${new Date().toLocaleString('ru-RU')}.</div>
  ${notes.caption ? `<div class="caption">${esc(notes.caption)}</div>` : ''}

  <div class="tabs">${tabsArticles}</div>
  ${panels}

  <details class="check"><summary>Что сказала проверка content:check</summary><pre>${esc(
    check.trim() || 'нет вывода'
  )}</pre></details>

  <div id="list"><h2>Ваши правки <span class="cnt" id="cnt">0</span></h2><div id="items"></div></div>
</div>

<div id="pop"><button type="button" id="addNote">Комментарий</button></div>

<div id="editor">
  <div class="quote" id="q"></div>
  <textarea id="txt" placeholder="Что здесь не так и как правильно"></textarea>
  <div class="acts">
    <button type="button" class="main" id="save">Сохранить</button>
    <button type="button" class="mic" id="mic">🎤 Диктовать</button>
    <button type="button" id="cancel">Отмена</button>
    <span class="micstate" id="micstate"></span>
  </div>
</div>

<div class="bar">
  <label><input type="checkbox" id="only"> только изменения</label>
  <button type="button" class="main" id="download" disabled>Выгрузить правки файлом</button>
  <button type="button" id="copy" disabled>Скопировать</button>
  <span class="hint">выделите текст мышью — появится кнопка «Комментарий»</span>
</div>

<script>
  document.querySelectorAll('.art-tab').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('.art-tab').forEach(function (x) { x.classList.remove('on'); });
      t.classList.add('on');
      document.querySelectorAll('.art-panel').forEach(function (p) {
        p.classList.toggle('on', p.dataset.art === t.dataset.art);
      });
    });
  });
  document.querySelectorAll('.loc-tab').forEach(function (t) {
    t.addEventListener('click', function () {
      var panel = t.closest('.art-panel');
      panel.querySelectorAll('.loc-tab').forEach(function (x) { x.classList.remove('on'); });
      t.classList.add('on');
      panel.querySelectorAll('.loc-panel').forEach(function (p) {
        p.classList.toggle('on', p.dataset.loc === t.dataset.loc);
      });
    });
  });
  document.getElementById('only').addEventListener('change', function (e) {
    document.body.classList.toggle('only-changes', e.target.checked);
  });

  // ---------- комментарии к выделению ----------
  var STORE = 'review-notes-' + ${JSON.stringify(slugs.join('+'))};
  var notes = [];
  try { notes = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch (e) { notes = []; }

  var pop = document.getElementById('pop');
  var editor = document.getElementById('editor');
  var txt = document.getElementById('txt');
  var qBox = document.getElementById('q');
  var pending = null;

  function currentContext(node) {
    var art = node.closest ? node.closest('.art-panel') : node.parentElement.closest('.art-panel');
    var loc = node.closest ? node.closest('.loc-panel') : node.parentElement.closest('.loc-panel');
    var chg = node.closest ? node.closest('.change') : node.parentElement.closest('.change');
    return {
      slug: art ? art.dataset.art : '',
      loc: loc ? loc.dataset.loc : '',
      num: chg ? chg.id.replace('c', '') : ''
    };
  }

  document.addEventListener('mouseup', function (e) {
    if (editor.style.display === 'block') return;
    var tgt = e.target && e.target.nodeType === 1 ? e.target : (e.target ? e.target.parentElement : null);
    if (tgt && (tgt.closest('#pop') || tgt.closest('#editor'))) return;
    var sel = window.getSelection();
    var text = sel && String(sel).trim();
    if (!text || !sel.rangeCount) { pop.style.display = 'none'; return; }
    var range = sel.getRangeAt(0);
    var host = range.commonAncestorContainer;
    var el = host.nodeType === 1 ? host : host.parentElement;
    if (!el || !el.closest('.text')) { pop.style.display = 'none'; return; }
    pending = { range: range.cloneRange(), quote: text, ctx: currentContext(el) };
    var r = range.getBoundingClientRect();
    pop.style.left = (window.scrollX + r.left) + 'px';
    pop.style.top = (window.scrollY + r.bottom + 6) + 'px';
    pop.style.display = 'block';
  });

  document.getElementById('addNote').addEventListener('click', function () {
    if (!pending) return;
    pop.style.display = 'none';
    qBox.textContent = pending.quote.length > 400 ? pending.quote.slice(0, 400) + '…' : pending.quote;
    txt.value = '';
    editor.style.display = 'block';
    txt.focus();
  });

  function highlight(range, id) {
    var mark = document.createElement('mark');
    mark.className = 'note';
    mark.dataset.id = id;
    try { range.surroundContents(mark); }
    catch (e) { mark.appendChild(range.extractContents()); range.insertNode(mark); }
  }

  document.getElementById('save').addEventListener('click', function () {
    var value = txt.value.trim();
    if (!pending || !value) { closeEditor(); return; }
    var id = 'n' + Date.now();
    notes.push({
      id: id, text: value, quote: pending.quote,
      slug: pending.ctx.slug, loc: pending.ctx.loc, num: pending.ctx.num
    });
    highlight(pending.range, id);
    persist();
    closeEditor();
  });

  document.getElementById('cancel').addEventListener('click', closeEditor);

  function closeEditor() {
    stopMic();
    editor.style.display = 'none';
    pending = null;
    window.getSelection().removeAllRanges();
  }

  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify(notes)); } catch (e) {}
    render();
  }

  function render() {
    var items = document.getElementById('items');
    document.getElementById('cnt').textContent = notes.length;
    document.getElementById('download').disabled = notes.length === 0;
    document.getElementById('copy').disabled = notes.length === 0;
    items.innerHTML = notes.map(function (n, i) {
      var where = [n.loc ? n.loc.toUpperCase() : '', n.num ? 'изменение №' + n.num : ''].filter(Boolean).join(' · ');
      return '<div class="note-item"><button class="rm" data-id="' + n.id + '" title="удалить">×</button>' +
        '<div class="meta">' + (i + 1) + '. ' + n.slug + (where ? ' · ' + where : '') + '</div>' +
        '<div class="q">' + escapeHtml(n.quote) + '</div>' +
        '<div class="txt">' + escapeHtml(n.text) + '</div></div>';
    }).join('');
    items.querySelectorAll('.rm').forEach(function (b) {
      b.addEventListener('click', function () {
        notes = notes.filter(function (n) { return n.id !== b.dataset.id; });
        var mark = document.querySelector('mark.note[data-id="' + b.dataset.id + '"]');
        if (mark) mark.replaceWith.apply(mark, Array.from(mark.childNodes));
        persist();
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function asText() {
    var lines = ['# Правки владельца — ' + ${JSON.stringify(slugs.join(', '))},
      'Собрано: ' + new Date().toLocaleString('ru-RU'), ''];
    notes.forEach(function (n, i) {
      var where = [n.slug, n.loc ? n.loc.toUpperCase() : '', n.num ? 'изменение №' + n.num : ''].filter(Boolean).join(' · ');
      lines.push('## ' + (i + 1) + '. ' + where);
      lines.push('> ' + n.quote.replace(/\\n/g, ' '));
      lines.push('');
      lines.push(n.text);
      lines.push('');
    });
    return lines.join('\\n');
  }

  document.getElementById('download').addEventListener('click', function () {
    var blob = new Blob([asText()], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'review-comments.md';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });

  document.getElementById('copy').addEventListener('click', function () {
    var btn = this;
    navigator.clipboard.writeText(asText()).then(function () {
      btn.textContent = 'Скопировано';
      setTimeout(function () { btn.textContent = 'Скопировать'; }, 1800);
    });
  });

  // ---------- диктовка ----------
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null;
  var micBtn = document.getElementById('mic');
  var micState = document.getElementById('micstate');

  function stopMic() {
    if (rec) { try { rec.stop(); } catch (e) {} rec = null; }
    micBtn.classList.remove('rec');
    micState.textContent = '';
  }

  micBtn.addEventListener('click', function () {
    if (!Rec) {
      micState.textContent = 'браузер не умеет — нажмите Win+H и говорите';
      return;
    }
    if (rec) { stopMic(); return; }
    rec = new Rec();
    rec.lang = 'ru-RU';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = function (e) {
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          txt.value = (txt.value ? txt.value + ' ' : '') + e.results[i][0].transcript.trim();
        }
      }
    };
    rec.onerror = function (e) {
      micState.textContent = 'микрофон недоступен (' + e.error + ') — Win+H тоже работает';
      stopMic();
    };
    rec.onend = function () { micBtn.classList.remove('rec'); micState.textContent = ''; rec = null; };
    try {
      rec.start();
      micBtn.classList.add('rec');
      micState.textContent = 'слушаю…';
    } catch (e) {
      micState.textContent = 'не удалось включить микрофон';
      stopMic();
    }
  });

  render();
</script>
</body>
</html>`;
}

main();
