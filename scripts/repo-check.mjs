#!/usr/bin/env node
// Проверка порядка в репозитории сайта (правило владельца 2026-09-12, CLAUDE.md «Ветки и папки»).
// Запуск: `npm run repo:check` из корня. Помощник запускает её в начале сессии и перед отчётом.
// Красный итог означает: сначала убрать лишнее, потом работать. Скрипт ничего не меняет и не удаляет.
//
// Что считается порядком:
//   1. основная папка стоит на `main`;
//   2. рабочих копий (worktree) ровно две — основная и `accepted-editor` на `editor` — и не больше
//      одной временной для текущей операции `feature/editor-*` или `fix/editor-*`;
//   3. веток не больше: `main`, `editor`, страховки `backup/*` и одна рабочая `feature/editor-*` | `fix/editor-*`;
//   4. в корне нет кэш-копий `.cache-*`, в `editor/.coordination/worktrees` нет посторонних папок;
//   5. копия `accepted-editor` без незакоммиченных правок;
//   6. серверы редактора запущены только из основной папки, `accepted-editor` или разрешённой временной копии.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, {cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
const ACCEPTED = norm(path.join(ROOT, 'editor/.coordination/worktrees/accepted-editor'));
const WORK = /^(feature|fix)\/editor-[a-z0-9-]+$/;

const плохо = [];
const хорошо = [];

// 1. ветка основной папки
const ветка = git('rev-parse', '--abbrev-ref', 'HEAD');
if (ветка === 'main') хорошо.push('основная папка на main');
else плохо.push(`основная папка стоит на «${ветка}», а должна на main`);

// 2. рабочие копии
const копии = [];
let текущая = null;
for (const line of git('worktree', 'list', '--porcelain').split('\n')) {
  if (line.startsWith('worktree ')) текущая = {path: line.slice(9), branch: null};
  else if (line.startsWith('branch ') && текущая) текущая.branch = line.slice(7).replace('refs/heads/', '');
  else if (line === '' && текущая) { копии.push(текущая); текущая = null; }
}
if (текущая) копии.push(текущая);
let временных = 0;
for (const к of копии) {
  const p = norm(к.path);
  if (p === norm(ROOT)) continue;
  if (p === ACCEPTED) {
    if (к.branch === 'editor') хорошо.push('копия accepted-editor на editor');
    else плохо.push(`копия accepted-editor стоит на «${к.branch}», а должна на editor`);
    continue;
  }
  const внутри = p.startsWith(norm(path.join(ROOT, 'editor/.coordination/worktrees')) + '/');
  if (внутри && к.branch && WORK.test(к.branch)) {
    временных += 1;
    if (временных === 1) хорошо.push(`одна временная копия операции: ${к.branch}`);
    else плохо.push(`лишняя временная копия: ${к.path} (${к.branch})`);
  } else {
    плохо.push(`посторонняя рабочая копия: ${к.path} (${к.branch ?? 'без ветки'})`);
  }
}

// 3. ветки
const ветки = git('branch', '--format=%(refname:short)').split('\n').filter(Boolean);
let рабочих = 0;
for (const b of ветки) {
  if (b === 'main' || b === 'editor' || b.startsWith('backup/')) continue;
  if (WORK.test(b)) { рабочих += 1; if (рабочих > 1) плохо.push(`лишняя рабочая ветка: ${b}`); continue; }
  плохо.push(`посторонняя ветка: ${b}`);
}
if (рабочих <= 1 && !плохо.some((s) => s.includes('ветка'))) хорошо.push(`веток: ${ветки.length} (${ветки.join(', ')})`);

// 4. кэш-копии и посторонние папки
for (const name of fs.readdirSync(ROOT)) {
  if (/^\.cache-/.test(name) && name !== '.cache-loader' && fs.statSync(path.join(ROOT, name)).isDirectory()) плохо.push(`кэш-копия в корне: ${name}`);
}
const wtDir = path.join(ROOT, 'editor/.coordination/worktrees');
if (fs.existsSync(wtDir)) {
  const разрешённые = new Set(копии.map((к) => norm(к.path)));
  for (const name of fs.readdirSync(wtDir)) {
    const full = norm(path.join(wtDir, name));
    if (!разрешённые.has(full)) плохо.push(`посторонняя папка в worktrees: ${name} (не числится рабочей копией)`);
  }
}

// 5. чистота accepted-editor
if (fs.existsSync(ACCEPTED)) {
  const st = execFileSync('git', ['-C', ACCEPTED, 'status', '--short'], {encoding: 'utf8'}).trim();
  if (st === '') хорошо.push('accepted-editor без незакоммиченных правок');
  else плохо.push(`в accepted-editor незакоммиченные правки: ${st.split('\n').length} файл(ов)`);
} else {
  плохо.push('копии accepted-editor нет на диске');
}
const stMain = git('status', '--short').split('\n').filter((l) => l && !l.startsWith('??'));
if (stMain.length > 0) хорошо.push(`в основной папке ${stMain.length} изменённых отслеживаемых файл(ов) — допустимо только во время текущей операции`);

// 6. экземпляры редактора: кто слушает порты 4779–4799 и из какой папки запущен (Windows)
try {
  const out = execFileSync('powershell', ['-NoProfile', '-Command',
    "$l = Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -ge 4779 -and $_.LocalPort -le 4799 } | Select-Object -Unique LocalPort, OwningProcess; foreach ($c in $l) { $p = Get-CimInstance Win32_Process -Filter \"ProcessId = $($c.OwningProcess)\"; Write-Output (\"$($c.LocalPort)`t$($c.OwningProcess)`t$($p.CommandLine)\") }"],
  {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  const строки = out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  const разрешённые = new Set([norm(ROOT), ACCEPTED, ...копии.map((к) => norm(к.path))]);
  let чужих = 0;
  for (const line of строки) {
    const [port, pid, cmd = ''] = line.split('\t');
    const путь = (cmd.match(/[A-Za-z]:[^"]*?(server|panel)\.mjs/) ?? [''])[0];
    const ok = путь && [...разрешённые].some((r) => norm(путь).startsWith(r + '/'));
    if (!ok) { чужих += 1; плохо.push(`порт ${port}: экземпляр редактора вне разрешённых папок (PID ${pid}): ${cmd.slice(0, 100)}`); }
  }
  if (чужих === 0) хорошо.push(`экземпляры редактора только из разрешённых папок (портов занято: ${строки.length})`);
} catch {
  хорошо.push('проверка экземпляров пропущена (нет PowerShell)');
}

const hook = process.argv.includes('--hook');
console.log(плохо.length === 0 ? 'repo-check: порядок' : `repo-check: НЕПОРЯДОК (${плохо.length})`);
for (const s of хорошо) console.log(`  ✓ ${s}`);
for (const s of плохо) console.log(`  ✗ ${s}`);
if (плохо.length > 0) console.log('  → сначала убрать лишнее по CLAUDE.md «Ветки и папки», потом работать.');
process.exit(плохо.length === 0 || hook ? 0 : 1);
