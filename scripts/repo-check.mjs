#!/usr/bin/env node
// Отчёт о состоянии репозитория сайта и редактора (CLAUDE.md «Ветки и папки», решение владельца 2026-09-12).
// Запуск: `npm run repo:check` из корня. Помощник смотрит его в начале сессии и перед отчётом.
//
// Скрипт только показывает. Он ничего не исправляет и не удаляет, а найденное несоответствие не является
// разрешением что-либо удалять: решение о лишнем принимает владелец. Показывает:
//   1. на какой ветке основная папка;
//   2. какие рабочие копии есть, на каких ветках, и есть ли у временной копии владелец-операция
//      (`editor/.coordination/run-status.json`), перенесена ли её ветка в `editor` (или в `main` для кода сайта), осталась ли в ней
//      несохранённая работа (незакоммиченные, неотслеживаемые и игнорируемые файлы);
//   3. какие ветки есть, кроме `main`, `editor`, `backup/*`;
//   4. откуда работает экземпляр 4780 и какую папку материалов он читает (`/api/identity`);
//   5. кто ещё слушает порты редактора 4779–4799 и из какой папки;
//   6. посторонние папки в `editor/.coordination/worktrees` и кэш-копии в корне.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Корень — основная папка репозитория, а не папка самого скрипта: из копии (accepted-editor или временной)
// скрипт проверяет ту же основную папку и не принимает копию за неё.
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(HERE, execFileSync('git', ['-C', HERE, 'rev-parse', '--git-common-dir'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(), '..');
const git = (...args) => execFileSync('git', args, {cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
const gitIn = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
const ACCEPTED = norm(path.join(ROOT, 'editor/.coordination/worktrees/accepted-editor'));
// Рабочая ветка одной одобренной операции: код редактора (`…/editor-…`, цель editor) или код сайта
// (`…/site-…`, цель main). Оба вида живут в одной временной папке внутри editor/.coordination/worktrees.
const WORK = /^(feature|fix)\/(editor|site)-[a-z0-9-]+$/;

const строки = [];
const несоответствия = [];
const ok = (s) => строки.push(`  ✓ ${s}`);
const info = (s) => строки.push(`  · ${s}`);
const bad = (s) => { строки.push(`  ✗ ${s}`); несоответствия.push(s); };

// 0. откуда запущен
if (norm(HERE) !== norm(ROOT)) info(`запущено из копии ${HERE}; проверяется основная папка ${ROOT}`);

// 1. ветка основной папки
const ветка = git('rev-parse', '--abbrev-ref', 'HEAD');
if (ветка === 'main') ok('основная папка на main'); else bad(`основная папка на «${ветка}», по схеме должна быть на main`);
const изменённые = git('status', '--short').split('\n').filter((l) => l && !l.startsWith('??'));
const неотслеж = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
info(`в основной папке изменённых отслеживаемых файлов: ${изменённые.length}, неотслеживаемых (черновики и т.п.): ${неотслеж.length}`);

// 2. рабочие копии
let текущаяОперация = null;
const statusPath = path.join(ROOT, 'editor/.coordination/run-status.json');
if (fs.existsSync(statusPath)) {
  try { текущаяОперация = JSON.parse(fs.readFileSync(statusPath, 'utf8')); } catch { /* сломанный файл покажем ниже */ }
  if (текущаяОперация) info(`последняя записанная операция: ${текущаяОперация.operation ?? '?'} на ${текущаяОперация.branch ?? '?'}, состояние ${текущаяОперация.state ?? '?'}`);
  else bad('editor/.coordination/run-status.json не читается');
}
const копии = [];
let cur = null;
for (const line of git('worktree', 'list', '--porcelain').split('\n')) {
  if (line.startsWith('worktree ')) cur = {path: line.slice(9), branch: null};
  else if (line.startsWith('branch ') && cur) cur.branch = line.slice(7).replace('refs/heads/', '');
  else if (line === '' && cur) { копии.push(cur); cur = null; }
}
if (cur) копии.push(cur);
for (const к of копии) {
  const p = norm(к.path);
  if (p === norm(ROOT)) continue;
  if (p === ACCEPTED) {
    const st = fs.existsSync(к.path) ? gitIn(к.path, 'status', '--short') : 'НЕТ НА ДИСКЕ';
    if (к.branch === 'editor' && st === '') ok(`accepted-editor на editor, без незакоммиченных правок`);
    else bad(`accepted-editor: ветка «${к.branch}», незакоммиченных файлов: ${st === '' ? 0 : st.split('\n').length}`);
    continue;
  }
  const внутри = p.startsWith(norm(path.join(ROOT, 'editor/.coordination/worktrees')) + '/');
  const рабочая = !!(к.branch && WORK.test(к.branch));
  let описание = `копия ${к.path} (${к.branch ?? 'без ветки'})`;
  if (fs.existsSync(к.path)) {
    const незакоммич = gitIn(к.path, 'status', '--short').split('\n').filter(Boolean).length;
    const игнорируемые = gitIn(к.path, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory').split('\n').filter(Boolean).length;
    let перенесена = 'нет ветки';
    const цель = к.branch && /\/site-/.test(к.branch) ? 'main' : 'editor';
    if (к.branch) {
      try { execFileSync('git', ['merge-base', '--is-ancestor', к.branch, цель], {cwd: ROOT, stdio: 'ignore'}); перенесена = 'да'; } catch { перенесена = 'НЕТ'; }
    }
    const владелец = текущаяОперация && текущаяОперация.branch === к.branch ? `операция ${текущаяОперация.operation} (${текущаяОперация.state})` : 'операция не записана';
    описание += `: ${владелец}; ветка перенесена в ${цель}: ${перенесена}; незакоммиченных файлов: ${незакоммич}; игнорируемых (черновики/история/передача): ${игнорируемые}`;
  } else {
    описание += ': папки нет на диске';
  }
  if (внутри && рабочая && текущаяОперация && текущаяОперация.branch === к.branch) info(описание);
  else bad(описание + ' — по схеме такой копии быть не должно; решает владелец');
}
if (копии.length === 2) ok('рабочих копий две: основная и accepted-editor');

// 3. ветки
const ветки = git('branch', '--format=%(refname:short)').split('\n').filter(Boolean);
const лишние = ветки.filter((b) => !(b === 'main' || b === 'editor' || b.startsWith('backup/') || (текущаяОперация && b === текущаяОперация.branch && WORK.test(b))));
if (лишние.length === 0) ok(`ветки: ${ветки.join(', ')}`);
else for (const b of лишние) { const цель = /\/site-/.test(b) ? 'main' : 'editor'; bad(`ветка вне схемы: ${b} (перенесена в ${цель}: ${(() => { try { execFileSync('git', ['merge-base', '--is-ancestor', b, цель], {cwd: ROOT, stdio: 'ignore'}); return 'да'; } catch { return 'НЕТ'; } })()})`); }

// 4. экземпляр 4780
try {
  const r = execFileSync('curl', ['-s', '--max-time', '4', 'http://localhost:4780/api/identity'], {encoding: 'utf8'});
  const id = JSON.parse(r);
  const кодOk = norm(id.code ?? '').startsWith(ACCEPTED + '/');
  const матOk = norm(id.materials ?? '') === norm(ROOT);
  const s = `экземпляр 4780: код ${id.branch}@${id.commit} из ${id.code}, материалы ${id.materials}, принят: ${id.accepted}`;
  if (кодOk && матOk && id.accepted) ok(s); else bad(s + ' — код или материалы не из схемы');
} catch {
  info('экземпляр 4780 не отвечает (редактор не запущен)');
}

// 5. порты редактора (Windows)
try {
  const out = execFileSync('powershell', ['-NoProfile', '-Command',
    "$l = Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -ge 4779 -and $_.LocalPort -le 4799 } | Select-Object -Unique LocalPort, OwningProcess; foreach ($c in $l) { $p = Get-CimInstance Win32_Process -Filter \"ProcessId = $($c.OwningProcess)\"; Write-Output (\"$($c.LocalPort)`t$($c.OwningProcess)`t$($p.CommandLine)\") }"],
  {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  const порты = out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  const разрешённые = [norm(ROOT), ...копии.map((к) => norm(к.path))];
  for (const line of порты) {
    const [port, pid, cmd = ''] = line.split('\t');
    const путь = (cmd.match(/[A-Za-z]:[^"]*?(server|panel)\.mjs/) ?? [''])[0];
    const свой = путь && разрешённые.some((r) => norm(путь).startsWith(r + '/'));
    if (свой) info(`порт ${port}: ${путь}`); else bad(`порт ${port} (PID ${pid}) занят процессом вне известных копий: ${cmd.slice(0, 100)}`);
  }
  if (порты.length === 0) info('порты редактора 4779–4799 свободны');
} catch {
  info('проверка портов пропущена (нет PowerShell)');
}

// 6. посторонние папки
const wtDir = path.join(ROOT, 'editor/.coordination/worktrees');
if (fs.existsSync(wtDir)) {
  const известные = new Set(копии.map((к) => norm(к.path)));
  for (const name of fs.readdirSync(wtDir)) {
    if (!известные.has(norm(path.join(wtDir, name)))) bad(`папка в worktrees без рабочей копии: ${name} (что внутри — смотреть перед любым решением)`);
  }
}
for (const name of fs.readdirSync(ROOT)) {
  if (/^\.cache-/.test(name) && name !== '.cache-loader' && fs.statSync(path.join(ROOT, name)).isDirectory()) bad(`кэш-копия в корне: ${name}`);
}

console.log(несоответствия.length === 0 ? 'repo-check: состояние по схеме' : `repo-check: несоответствий схеме: ${несоответствия.length} (ничего не удалять без решения владельца)`);
for (const s of строки) console.log(s);
process.exit(0);
