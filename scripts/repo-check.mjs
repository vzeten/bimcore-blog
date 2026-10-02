#!/usr/bin/env node
// Отчёт о состоянии репозитория сайта и редактора (CLAUDE.md «Ветки и папки», решение владельца 2026-09-12).
// Запуск: `npm run repo:check` из корня. Помощник смотрит его в начале сессии и перед отчётом.
//
// Скрипт только показывает. Он ничего не исправляет и не удаляет, а найденное несоответствие не является
// разрешением что-либо удалять: решение о лишнем принимает владелец. Показывает:
//   1. на какой ветке основная папка;
//   2. какие рабочие копии есть, на каких ветках, и есть ли у временной копии владелец-операция
//      (`editor/.coordination/run-status.json` клона редактора), перенесена ли её ветка в `main` (копии кода сайта —
//      в `C:/My_code/bimcore-blog-worktrees`) или в `editor` клона, осталась ли в ней несохранённая работа
//      (незакоммиченные, неотслеживаемые и игнорируемые файлы);
//   3. какие ветки есть, кроме `main`, `backup/*`;
//   4. откуда работает экземпляр 4780 и какую папку материалов он читает (`/api/identity`);
//   5. кто ещё слушает порты редактора 4779–4799 и из какой папки;
//   6. посторонние папки среди копий сайта и клона, старая `editor/.coordination` на диске сайта, кэш-копии в корне;
//   7. совпадает ли локальная main с настоящей серверной (ls-remote с ограничением времени, без fetch).
// `--release-site` — строгая сверка main, одно из условий завершения выпуска кода сайта (CLAUDE.md, «Код сайта
// Docusaurus», п. 4); выкладку, проверку сайта и приёмку не подтверждает. Ненулевой выход при другой ветке,
// расхождении или неизвестности сервера, незакоммиченном коде, непрочитанном состоянии или ошибке помощника.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Корень — основная папка репозитория, а не папка самого скрипта: из временной копии
// скрипт проверяет ту же основную папку и не принимает копию за неё.
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Каждый вызов git получает адресное safe.directory именно той папки, которую проверяет: в чужой среде (владелец папки
// считается другим, safe.directory задан только для копии) git иначе отвергает основную папку. Глобальные настройки не меняются.
// `--no-optional-locks`: status и прочие чтения не обновляют индекс, скрипт не пишет в .git.
const gitAt = (dir, args, opts = {}) => execFileSync('git', ['--no-optional-locks', '-c', 'safe.directory=' + path.resolve(dir).split(path.sep).join('/'), '-C', dir, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts});
// Принятый код редактора — отдельный клон закрытого bimcore-editor (решение владельца 2026-10-02). Запуск из
// него (или из копии операции внутри него) проверяет основную папку материалов, а не сам клон.
const КЛОН = process.env.REPO_CHECK_CLONE ?? 'C:/My_code/bimcore-editor';
const МАТЕРИАЛЫ = 'C:/My_code/bimcore-blog';
const корень = path.resolve(HERE, gitAt(HERE, ['rev-parse', '--git-common-dir']).trim(), '..');
const ROOT = path.resolve(корень).split(path.sep).join('/').toLowerCase() === КЛОН.toLowerCase() ? path.resolve(МАТЕРИАЛЫ) : корень;
const git = (...args) => gitAt(ROOT, args).trim();
const gitIn = (dir, ...args) => gitAt(dir, args).trim();
const предок = (ветка, цель) => { try { gitAt(ROOT, ['merge-base', '--is-ancestor', ветка, цель], {stdio: 'ignore'}); return 'да'; } catch { return 'НЕТ'; } };
const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
const КЛОН_ЕСТЬ = fs.existsSync(path.join(КЛОН, '.git'));
// Код 4780 — только из клона редактора.
const ПРИНЯТЫЙ = norm(КЛОН);
// Временные копии кода сайта — рядом с основной папкой, вне её (вынос редактора 2026-10-03).
const КОПИИ_САЙТА = path.join(path.dirname(ROOT), 'bimcore-blog-worktrees');
// Рабочая ветка одной одобренной операции: код редактора (`…/editor-…`, в клоне, цель editor) или код сайта
// (`…/site-…`, в КОПИИ_САЙТА, цель main). Запись операции одна — в клоне редактора.
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
const statusPath = path.join(КЛОН, 'editor/.coordination/run-status.json');
if (fs.existsSync(statusPath)) {
  try { текущаяОперация = JSON.parse(fs.readFileSync(statusPath, 'utf8')); } catch { /* сломанный файл покажем ниже */ }
  if (текущаяОперация) info(`последняя записанная операция: ${текущаяОперация.operation ?? '?'} на ${текущаяОперация.branch ?? '?'}, состояние ${текущаяОперация.state ?? '?'}`);
  else bad(`${statusPath} не читается`);
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
  const внутри = p.startsWith(norm(КОПИИ_САЙТА) + '/');
  const рабочая = !!(к.branch && WORK.test(к.branch) && /\/site-/.test(к.branch));
  let описание = `копия ${к.path} (${к.branch ?? 'без ветки'})`;
  if (fs.existsSync(к.path)) {
    const незакоммич = gitIn(к.path, 'status', '--short').split('\n').filter(Boolean).length;
    const игнорируемые = gitIn(к.path, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory').split('\n').filter(Boolean).length;
    let перенесена = 'нет ветки';
    const цель = 'main';
    if (к.branch) перенесена = предок(к.branch, цель);
    const владелец = текущаяОперация && текущаяОперация.branch === к.branch ? `операция ${текущаяОперация.operation} (${текущаяОперация.state})` : 'операция не записана';
    описание += `: ${владелец}; ветка перенесена в ${цель}: ${перенесена}; незакоммиченных файлов: ${незакоммич}; игнорируемых (черновики/история/передача): ${игнорируемые}`;
  } else {
    описание += ': папки нет на диске';
  }
  if (внутри && рабочая && текущаяОперация && текущаяОперация.branch === к.branch) info(описание);
  else bad(описание + ' — по схеме такой копии быть не должно; решает владелец');
}
if (копии.length === 1) ok('рабочая копия сайта одна: основная папка');
// 2б. клон редактора и копии его операций — тем же порядком, что копии основной папки.
const копииКлона = [];
if (КЛОН_ЕСТЬ) try {
  const вет = gitIn(КЛОН, 'rev-parse', '--abbrev-ref', 'HEAD');
  const st = gitIn(КЛОН, 'status', '--short');
  if (вет === 'editor' && st === '') ok(`клон редактора ${КЛОН} на editor, без незакоммиченных правок`);
  else bad(`клон редактора ${КЛОН}: ветка «${вет}», незакоммиченных файлов: ${st === '' ? 0 : st.split('\n').length}`);
  const операцияКлона = текущаяОперация;
  let к = null;
  for (const line of gitIn(КЛОН, 'worktree', 'list', '--porcelain').split('\n')) {
    if (line.startsWith('worktree ')) к = {path: line.slice(9), branch: null};
    else if (line.startsWith('branch ') && к) к.branch = line.slice(7).replace('refs/heads/', '');
    else if (line === '' && к) { копииКлона.push(к); к = null; }
  }
  if (к) копииКлона.push(к);
  const wtКлона = norm(path.join(КЛОН, 'editor/.coordination/worktrees'));
  for (const копия of копииКлона) {
    if (norm(копия.path) === norm(КЛОН)) continue;
    let описание = `копия в клоне ${копия.path} (${копия.branch ?? 'без ветки'})`;
    if (fs.existsSync(копия.path)) {
      const незакоммич = gitIn(копия.path, 'status', '--short').split('\n').filter(Boolean).length;
      let перенесена = 'нет ветки';
      if (копия.branch) { try { gitAt(КЛОН, ['merge-base', '--is-ancestor', копия.branch, 'editor'], {stdio: 'ignore'}); перенесена = 'да'; } catch { перенесена = 'НЕТ'; } }
      const чья = операцияКлона && операцияКлона.branch === копия.branch ? `операция ${операцияКлона.operation} (${операцияКлона.state})` : 'операция не записана';
      описание += `: ${чья}; ветка перенесена в editor: ${перенесена}; незакоммиченных файлов: ${незакоммич}`;
    } else описание += ': папки нет на диске';
    const внутри = norm(копия.path).startsWith(wtКлона + '/');
    if (внутри && копия.branch && WORK.test(копия.branch) && операцияКлона && операцияКлона.branch === копия.branch) info(описание);
    else bad(описание + ' — по схеме такой копии быть не должно; решает владелец');
  }
  const wtDirКлона = path.join(КЛОН, 'editor/.coordination/worktrees');
  if (fs.existsSync(wtDirКлона)) {
    const известные = new Set(копииКлона.map((копия) => norm(копия.path)));
    for (const name of fs.readdirSync(wtDirКлона)) {
      if (!известные.has(norm(path.join(wtDirКлона, name)))) bad(`папка в worktrees клона без рабочей копии: ${name} (что внутри — смотреть перед любым решением)`);
    }
  }
} catch (e) {
  bad(`клон редактора ${КЛОН} не читается git: ${e?.message?.split('\n')[0] ?? e}`);
} else bad(`клона редактора ${КЛОН} нет — 4780 работать неоткуда`);

// 3. ветки
const ветки = git('branch', '--format=%(refname:short)').split('\n').filter(Boolean);
const лишние = ветки.filter((b) => !(b === 'main' || b.startsWith('backup/') || (текущаяОперация && b === текущаяОперация.branch && WORK.test(b))));
if (лишние.length === 0) ok(`ветки: ${ветки.join(', ')}`);
else for (const b of лишние) bad(`ветка вне схемы: ${b} (перенесена в main: ${предок(b, 'main')})`);

// 4. экземпляр 4780
try {
  const r = execFileSync('curl', ['-s', '--max-time', '4', 'http://localhost:4780/api/identity'], {encoding: 'utf8'});
  const id = JSON.parse(r);
  const кодOk = norm(id.code ?? '').startsWith(ПРИНЯТЫЙ + '/');
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
  const разрешённые = [norm(ROOT), ...копии.map((к) => norm(к.path)), ...копииКлона.map((к) => norm(к.path))];
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
if (fs.existsSync(КОПИИ_САЙТА)) {
  const известные = new Set(копии.map((к) => norm(к.path)));
  for (const name of fs.readdirSync(КОПИИ_САЙТА)) {
    if (!известные.has(norm(path.join(КОПИИ_САЙТА, name)))) bad(`папка среди копий сайта без рабочей копии: ${name} (что внутри — смотреть перед любым решением)`);
  }
}
if (fs.existsSync(path.join(ROOT, 'editor/.coordination'))) bad('на диске сайта снова есть editor/.coordination — служебные записи живут в клоне редактора (что внутри — смотреть перед любым решением)');
for (const name of fs.readdirSync(ROOT)) {
  if (/^\.cache-/.test(name) && name !== '.cache-loader' && fs.statSync(path.join(ROOT, name)).isDirectory()) bad(`кэш-копия в корне: ${name}`);
}

// 7. серверная main. Помощник лежит рядом со скриптом; копия скрипта без него честно сообщает о пропуске.
const строгий = process.argv.includes('--release-site');
let выпуск = null;
let ошибкаСверки = null;
const помощник = path.join(HERE, 'scripts/repo-check-release.mjs');
if (!fs.existsSync(помощник)) {
  info('сверка с серверной main пропущена: нет scripts/repo-check-release.mjs');
} else try {
  const r = await import(pathToFileURL(помощник).href);
  const состояние = r.collectRelease((args, opts) => gitAt(ROOT, args, opts));
  const сводка = r.remoteSummary(состояние);
  if (сводка.ok === true) ok(сводка.text); else if (сводка.ok === false) bad(сводка.text); else info(сводка.text);
  выпуск = r.evaluateRelease(состояние);
} catch (e) {
  ошибкаСверки = `сверка с серверной main не выполнена: ошибка помощника (${e?.message ?? e})`;
  info(ошибкаСверки);
}

console.log(несоответствия.length === 0 ? 'repo-check: состояние по схеме' : `repo-check: несоответствий схеме: ${несоответствия.length} (ничего не удалять без решения владельца)`);
for (const s of строки) console.log(s);
if (строгий) {
  const препятствия = выпуск ? выпуск.problems : [ошибкаСверки ?? 'сверка не выполнена: нет scripts/repo-check-release.mjs'];
  console.log(препятствия.length === 0
    ? 'release-site: сверка main пройдена — локальная main равна серверной, незакоммиченного кода нет (выкладку, проверку сайта и приёмку не подтверждает)'
    : `release-site: сверка main НЕ пройдена, препятствий: ${препятствия.length}`);
  for (const s of препятствия) console.log(`  ✗ ${s}`);
  for (const s of выпуск?.notes ?? []) console.log(`  · ${s}`);
  process.exit(препятствия.length === 0 ? 0 : 1);
}
process.exit(0);
