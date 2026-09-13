// Сборка обучающего сайта из тем (topics.mjs). Без библиотек, только Node: node build.mjs
// Результат: process-review.html (вход), <тема>.html на каждую тему, svg/<тема>.svg и svg/<тема>-vertical.svg,
// technical-maps.html (перенаправление со старого адреса). Это артефакт обучения, не часть сайта и не часть редактора.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AREAS, TOPICS} from './topics.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_SVG = path.join(HERE, 'svg');
fs.rmSync(OUT_SVG, {recursive: true, force: true});
fs.mkdirSync(OUT_SVG, {recursive: true});

// ---------- геометрия ----------
const CELL_W = 268, CELL_H = 138, BOX_W = 240, PAD = 28, FONT = 16, SUB = 14, CHAR = 0.56;
const N_CELL_W = 260, N_CELL_H = 170, N_BOX_W = 232, N_MAX_W = 560, N_CAP = N_MAX_W - 2 * PAD;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STYLE = {
  you:    {fill: '#e4ecfb', stroke: '#1257d6', width: 2.5},
  ai:     {fill: '#e3f2e9', stroke: '#1c7a45', width: 2},
  place:  {fill: '#ffffff', stroke: '#8a939b', width: 2},
  stop:   {fill: '#fbeadd', stroke: '#b4541a', width: 2},
  gap:    {fill: '#fff6d6', stroke: '#b8860b', width: 2},
  future: {fill: '#f3f4f6', stroke: '#9aa5ae', width: 2, dashed: true},
};
const TAG = {
  'Сейчас':       {fill: '#1c7a45', hint: 'так уже работает'},
  'Пробел':       {fill: '#b8860b', hint: 'правила или решения ещё нет'},
  'Не проверено': {fill: '#b4541a', hint: 'не подтверждено пробой'},
  'Будущее':      {fill: '#6b7680', hint: 'ещё не создано'},
};
const KIND_HINT = {you: 'ваш шаг', ai: 'шаг помощника', place: 'место или состояние', stop: 'остановка или запрет', gap: 'пробел', future: 'будущее'};

function wrap(text, maxChars) {
  const lines = [];
  for (const part of String(text).split('|')) {
    const words = part.trim().split(/\s+/);
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; }
      else cur = (cur + ' ' + w).trim();
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

function layout(d, vertical) {
  const nodes = new Map();
  const warnings = [];
  for (const n of d.nodes) {
    const w = vertical ? Math.min(n.w ?? N_BOX_W, N_CAP) : (n.w ?? BOX_W);
    const lines = wrap(n.text, Math.floor((w - 24) / (FONT * CHAR)));
    const subLines = n.sub ? wrap(n.sub, Math.floor((w - 24) / (SUB * CHAR))) : [];
    const h = Math.max(60, 22 + lines.length * (FONT + 5) + subLines.length * 18 + (n.tag ? 22 : 0));
    if (vertical && !n.n) warnings.push(`${d.id}: у блока ${n.id} нет узкой позиции n`);
    const col = vertical ? (n.n ? n.n[0] : n.col) : n.col;
    const row = vertical ? (n.n ? n.n[1] : n.row) : n.row;
    const x = PAD + col * (vertical ? N_CELL_W : CELL_W);
    const y = (d.padTop ?? 44) + row * (vertical ? N_CELL_H : CELL_H);
    for (const l of lines) if (l.length * FONT * CHAR > w - 20) warnings.push(`${d.id}: строка «${l}» шире блока ${n.id}`);
    nodes.set(n.id, {...n, w, h, x, y, lines, subLines});
  }
  const list = [...nodes.values()];
  const width = Math.ceil(Math.max(...list.map((n) => n.x + n.w)) + PAD);
  const height = Math.ceil(Math.max(...list.map((n) => n.y + n.h)) + PAD);
  if (vertical && width > N_MAX_W) warnings.push(`${d.id} (узкий): ширина ${width} больше ${N_MAX_W}`);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) warnings.push(`${d.id}${vertical ? ' (узкий)' : ''}: блоки ${a.id} и ${b.id} пересекаются`);
  }
  return {nodes, width, height, warnings};
}

function anchor(n, side) {
  switch (side) {
    case 'r': return [n.x + n.w, n.y + n.h / 2];
    case 'l': return [n.x, n.y + n.h / 2];
    case 't': return [n.x + n.w / 2, n.y];
    default:  return [n.x + n.w / 2, n.y + n.h];
  }
}

function edgePath(a, b) {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
  const dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  let fs_, ts;
  if (Math.abs(dx) >= Math.abs(dy)) { fs_ = dx > 0 ? 'r' : 'l'; ts = dx > 0 ? 'l' : 'r'; }
  else { fs_ = dy > 0 ? 'b' : 't'; ts = dy > 0 ? 't' : 'b'; }
  const [x1, y1] = anchor(a, fs_);
  const [x2, y2] = anchor(b, ts);
  let dpath, lx, ly;
  if ((fs_ === 'r' || fs_ === 'l') && Math.abs(y1 - y2) > 2) {
    const mx = (x1 + x2) / 2;
    dpath = `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`; lx = mx; ly = (y1 + y2) / 2;
  } else if ((fs_ === 't' || fs_ === 'b') && Math.abs(x1 - x2) > 2) {
    const my = (y1 + y2) / 2;
    dpath = `M ${x1} ${y1} L ${x1} ${my} L ${x2} ${my} L ${x2} ${y2}`; lx = (x1 + x2) / 2; ly = my;
  } else {
    dpath = `M ${x1} ${y1} L ${x2} ${y2}`; lx = (x1 + x2) / 2; ly = (y1 + y2) / 2;
  }
  return {dpath, lx, ly};
}

function renderSvg(d, vertical = false) {
  const {nodes, width, height, warnings} = layout(d, vertical);
  const p = [];
  const mid = `${d.id}${vertical ? '-v' : ''}`;
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Segoe UI, Arial, sans-serif" font-size="${FONT}" role="img" aria-label="${esc(d.title)}">`);
  p.push(`<defs><marker id="${mid}-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#5b6770"/></marker></defs>`);
  p.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`);
  for (const g of d.groups ?? []) {
    const m = g.nodes.map((id) => nodes.get(id));
    const x = Math.min(...m.map((n) => n.x)) - 12, y = Math.min(...m.map((n) => n.y)) - 32;
    const x2 = Math.max(...m.map((n) => n.x + n.w)) + 12, y2 = Math.max(...m.map((n) => n.y + n.h)) + 12;
    p.push(`<rect x="${x}" y="${y}" width="${x2 - x}" height="${y2 - y}" rx="12" fill="#f7f8fa" stroke="#c5cad0"/>`);
    const gt = (vertical && g.ntitle) ? g.ntitle : g.title;
    if (gt.length * 12.5 * CHAR > (x2 - x) - 24) warnings.push(`${d.id}${vertical ? ' (узкий)' : ''}: заголовок группы «${gt}» шире рамки`);
    p.push(`<text x="${x + 12}" y="${y + 20}" font-size="12.5" font-weight="700" fill="#5b6770" letter-spacing="0.5">${esc(gt.toUpperCase())}</text>`);
  }
  const labels = [];
  const hits = (x1, y1, x2, y2, skip) => {
    for (const n of nodes.values()) {
      if (skip.includes(n.id)) continue;
      const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
      if (maxX > n.x + 1 && minX < n.x + n.w - 1 && maxY > n.y + 1 && minY < n.y + n.h - 1) return n.id;
    }
    return null;
  };
  for (const e of d.edges ?? []) {
    const a = nodes.get(e.a), b = nodes.get(e.b);
    if (!a || !b) { warnings.push(`${d.id}: стрелка на неизвестный блок ${e.a}→${e.b}`); continue; }
    let {dpath, lx, ly} = edgePath(a, b);
    if (e.shift) { lx += e.shift[0]; ly += e.shift[1]; }
    const pts = dpath.match(/-?[\d.]+ -?[\d.]+/g).map((s) => s.split(' ').map(Number));
    for (let i = 1; i < pts.length; i++) { const h = hits(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], [a.id, b.id]); if (h) warnings.push(`${d.id}${vertical ? ' (узкий)' : ''}: стрелка ${e.a}→${e.b} проходит через блок ${h}`); }
    p.push(`<path d="${dpath}" fill="none" stroke="#5b6770" stroke-width="2"${e.dashed ? ' stroke-dasharray="6 5"' : ''} marker-end="url(#${mid}-arr)"/>`);
    const label = (vertical && e.nlabel !== undefined) ? e.nlabel : e.label;
    if (label) {
      const tw = label.length * 12 * CHAR + 14;
      const lh = hits(lx - tw / 2, ly - 10, lx + tw / 2, ly + 10, []);
      if (lh) warnings.push(`${d.id}${vertical ? ' (узкий)' : ''}: подпись «${label}» лежит на блоке ${lh}`);
      labels.push(`<rect x="${lx - tw / 2}" y="${ly - 10}" width="${tw}" height="20" rx="4" fill="#ffffff" stroke="#e1e5ea"/>`);
      labels.push(`<text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="12" fill="#3a4550">${esc(label)}</text>`);
    }
  }
  for (const n of nodes.values()) {
    const st = STYLE[n.kind ?? 'place'];
    p.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.width}"${st.dashed ? ' stroke-dasharray="7 5"' : ''}/>`);
    let ty = n.y + 24;
    if (n.tag) {
      const t = TAG[n.tag];
      if (!t) warnings.push(`${d.id}: неизвестная метка «${n.tag}» у ${n.id}`);
      const tw = n.tag.length * 11 * CHAR + 16;
      p.push(`<rect x="${n.x + 10}" y="${n.y + 8}" width="${tw}" height="18" rx="9" fill="${t?.fill ?? '#999'}"/>`);
      p.push(`<text x="${n.x + 10 + tw / 2}" y="${n.y + 21}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${esc(n.tag)}</text>`);
      ty += 20;
    }
    for (const l of n.lines) { p.push(`<text x="${n.x + n.w / 2}" y="${ty}" text-anchor="middle" font-weight="700" fill="#1f2a33">${esc(l)}</text>`); ty += FONT + 5; }
    for (const l of n.subLines) { p.push(`<text x="${n.x + n.w / 2}" y="${ty}" text-anchor="middle" font-size="${SUB}" fill="#3a4550">${esc(l)}</text>`); ty += 18; }
  }
  p.push(...labels, '</svg>');
  return {svg: p.join('\n'), warnings, width, height};
}

// ---------- страницы ----------
const css = `
  *{box-sizing:border-box}
  body{margin:0;background:#f5f7f9;color:#1f2a33;font-family:"Segoe UI",Arial,sans-serif;font-size:17px;line-height:1.45}
  main{max-width:1180px;margin:0 auto;padding:22px 24px 60px}
  .crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:15px;color:#5b6770;margin-bottom:16px}
  .crumbs a{color:#1257d6;text-decoration:none}
  .crumbs .cur{color:#1f2a33;font-weight:700}
  .crumbs .back{margin-left:auto;border:1px solid #d5dce2;border-radius:999px;padding:6px 14px;background:#fff}
  h1{font-size:28px;margin:0 0 6px}
  .lead{color:#3a4550;max-width:78ch;margin:0 0 16px;font-size:17px}
  .fig{background:#fff;border:1px solid #d5dce2;border-radius:14px;padding:16px}
  .fig svg{display:block;width:100%;height:auto}
  .fig .v{display:none}
  @media (max-width:820px){.fig .w{display:none}.fig .v{display:block}}
  .notes{margin:14px 0 0;padding-left:20px;color:#3a4550;font-size:16px}
  .legend{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:14px;font-size:14px;color:#3a4550}
  .legend span{display:inline-flex;align-items:center;gap:6px}
  .sw{width:14px;height:14px;border-radius:3px;border:2px solid;display:inline-block}
  .pill{display:inline-block;font-size:11px;font-weight:700;color:#fff;border-radius:9px;padding:1px 8px}
  .areas{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:8px}
  @media (max-width:820px){.areas{grid-template-columns:1fr}}
  .area{background:#fff;border:1px solid #d5dce2;border-radius:14px;padding:18px 20px}
  .area h2{font-size:22px;margin:0 0 4px}
  .area p{margin:0 0 12px;color:#3a4550}
  .topics{display:flex;flex-direction:column;gap:8px}
  .topic{display:block;border:1px solid #d5dce2;border-radius:10px;padding:10px 14px;text-decoration:none;color:#1f2a33;background:#fafbfc}
  .topic b{display:block;font-size:17px;color:#1257d6}
  .topic span{font-size:14px;color:#5b6770}
  .proj{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#5b6770;font-weight:700;margin:6px 0 6px}
  .next{margin-top:18px;display:flex;flex-wrap:wrap;gap:10px}
  .next a{border:1px solid #d5dce2;border-radius:999px;padding:7px 14px;background:#fff;text-decoration:none;color:#1257d6;font-size:15px}
  .stamp{font-size:13px;color:#5b6770;margin-top:22px}
`;
const areaOf = (id) => AREAS.find((a) => a.id === id);
const topicsOf = (areaId) => TOPICS.filter((t) => t.area === areaId);
const page = (title, body) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body><main>${body}</main></body></html>`;
const legend = () => '<div class="legend">' +
  Object.entries(STYLE).map(([k, st]) => `<span><i class="sw" style="background:${st.fill};border-color:${st.stroke}"></i>${esc(KIND_HINT[k])}</span>`).join('') +
  Object.entries(TAG).map(([name, t]) => `<span><i class="pill" style="background:${t.fill}">${esc(name)}</i>${esc(t.hint)}</span>`).join('') + '</div>';
const STAMP = 'Факты сверены 13 сентября 2026. Это обучающие схемы, не инструкция для помощников.';

const allWarnings = [];
for (const t of TOPICS) {
  const wide = renderSvg(t, false), vert = renderSvg(t, true);
  allWarnings.push(...wide.warnings, ...vert.warnings);
  fs.writeFileSync(path.join(OUT_SVG, `${t.id}.svg`), wide.svg);
  fs.writeFileSync(path.join(OUT_SVG, `${t.id}-narrow.svg`), vert.svg);
  const area = areaOf(t.area);
  const back = t.area === 'blog' && t.id !== 'blog-overview' ? 'blog-overview.html' : 'process-review.html';
  const mid = t.area === 'blog' ? `<a href="blog-overview.html">Проекты · bimcore-blog</a>` : `<span>${esc(area.title)}</span>`;
  const crumbs = `<div class="crumbs"><a href="process-review.html">Обзор</a><span>›</span>${mid}<span>›</span><span class="cur">${esc(t.title)}</span><a class="back" href="${back}">← к обзору</a></div>`;
  const siblings = topicsOf(t.area).filter((s) => s.id !== t.id);
  const body = crumbs + `<h1>${esc(t.title)}</h1><p class="lead">${esc(t.lead)}</p>` +
    `<div class="fig"><div class="w">${wide.svg}</div><div class="v">${vert.svg}</div></div>` +
    (t.notes?.length ? `<ul class="notes">${t.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '') +
    legend() +
    `<div class="next">${siblings.map((s) => `<a href="${s.id}.html">${esc(s.title)}</a>`).join('')}</div>` +
    `<p class="stamp">${STAMP}</p>`;
  fs.writeFileSync(path.join(HERE, `${t.id}.html`), page(t.title, body));
}

const areaBlock = (a) => {
  const items = topicsOf(a.id).map((t) => `<a class="topic" href="${t.id}.html"><b>${esc(t.title)}</b><span>${esc(t.lead)}</span></a>`).join('');
  const proj = a.id === 'blog' ? '<div class="proj">Сайт learn · bimcore-blog</div>' : '';
  return `<section class="area"><h2>${esc(a.title)}</h2><p>${esc(a.lead)}</p>${proj}<div class="topics">${items}</div></section>`;
};
const index = `<div class="crumbs"><span class="cur">Обзор</span></div><h1>Моя работа с ИИ и проекты</h1><p class="lead">Две области. Выберите тему — откроется одна схема со связями и короткими подписями.</p>` +
  `<div class="areas">${AREAS.map(areaBlock).join('')}</div>` + legend() + `<p class="stamp">${STAMP}</p>`;
fs.writeFileSync(path.join(HERE, 'process-review.html'), page('Моя работа с ИИ и проекты', index));

fs.writeFileSync(path.join(HERE, 'technical-maps.html'), `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=process-review.html"><title>Переход к обзору</title></head><body style="font-family:Segoe UI,Arial,sans-serif;padding:32px"><p>Этой страницы больше нет: технические карты разложены по темам. Открывается <a href="process-review.html">обзор</a>.</p></body></html>`);

console.log('страниц тем:', TOPICS.length, '· вход: process-review.html · svg:', OUT_SVG);
if (allWarnings.length) { console.log('предупреждения:'); for (const w of allWarnings) console.log('  -', w); process.exitCode = 1; }
else console.log('предупреждений нет: подписи помещаются, блоки не пересекаются, стрелки и их подписи не лежат на чужих блоках, узкие варианты не шире 560 px');
