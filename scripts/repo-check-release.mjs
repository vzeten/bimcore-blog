// Сверка локальной main с настоящей серверной main — одно из условий завершения выпуска кода сайта
// (CLAUDE.md «Код сайта Docusaurus», пункт 4); выкладку, проверку сайта и приёмку она не подтверждает. Только чтение: ls-remote без fetch, остальные команды git
// вызываются тем, кто передаёт run (repo-check добавляет --no-optional-locks, чтобы не трогать .git).
// Адресная публикация статьи двигает серверную main, не трогая локальные HEAD и индекс, поэтому
// refs/remotes/origin/main может быть устаревшей и не считается сервером.

// Незаконченные материалы не мешают завершению выпуска. Список консервативный: только тексты статей,
// их картинки и файл состояния редактора в папках статей. Настройки блога и категорий (options.json,
// _category_.json, authors.yml), code.json, static/ и любой код сюда не входят.
const MATERIAL_DIR = /^(?:blog|docs|i18n\/(?:en|ru|es)\/docusaurus-plugin-content-(?:blog|docs\/current))\//;
const MATERIAL_FILE = /(?:\.(?:mdx?|jpe?g|png|webp|gif|avif)|\/_state\.json)$/i;
export const isMaterialPath = (p) => MATERIAL_DIR.test(p) && MATERIAL_FILE.test(p) && !p.split('/').some((s) => s.startsWith('.'));

// `git status --porcelain=v1 -z`: у переименования и копии следом идёт исходный путь.
export function parseStatusZ(out) {
  const parts = out.split('\0');
  const entries = [];
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i];
    if (rec.length < 4) continue;
    const e = {code: rec.slice(0, 2), path: rec.slice(3)};
    if (/[RC]/.test(e.code)) e.from = parts[++i];
    entries.push(e);
  }
  return entries;
}

const REMOTE_TIMEOUT_MS = 15000;
const short = (sha) => (sha ? sha.slice(0, 8) : '—');

export function collectRelease(run) {
  const tryRun = (args, opts) => { try { return run(args, opts); } catch { return null; } };
  const status = tryRun(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const state = {
    branch: (tryRun(['rev-parse', '--abbrev-ref', 'HEAD']) ?? '?').trim(),
    head: (tryRun(['rev-parse', 'HEAD']) ?? '').trim() || null,
    tracking: (tryRun(['rev-parse', '--verify', '-q', 'refs/remotes/origin/main']) ?? '').trim() || null,
    remote: {sha: null, error: null},
    counts: null,
    entries: parseStatusZ(status ?? ''),
    statusRead: status !== null,
    hidden: [],
  };
  try {
    const out = run(['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], {
      timeout: REMOTE_TIMEOUT_MS,
      env: {...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never'},
    });
    const sha = out.split('\n').map((l) => l.split('\t')).find(([, ref]) => ref === 'refs/heads/main')?.[0];
    if (/^[0-9a-f]{40}$/.test(sha ?? '')) state.remote.sha = sha; else state.remote.error = 'ответ сервера без refs/heads/main';
  } catch (e) {
    state.remote.error = e.code === 'ETIMEDOUT' ? `нет ответа за ${REMOTE_TIMEOUT_MS / 1000} с` : 'сервер недоступен или ветки нет';
  }
  if (state.remote.sha && state.head && state.remote.sha !== state.head && tryRun(['cat-file', '-e', `${state.remote.sha}^{commit}`]) !== null) {
    const [ahead, behind] = (tryRun(['rev-list', '--left-right', '--count', `HEAD...${state.remote.sha}`]) ?? '').trim().split(/\s+/).map(Number);
    if (Number.isInteger(ahead) && Number.isInteger(behind)) state.counts = {ahead, behind};
  }
  // Скрытые флагами assume-unchanged (строчная буква) и skip-worktree (S) файлы status не показывает.
  const flags = tryRun(['ls-files', '-v', '-z']);
  state.hiddenRead = flags !== null;
  state.hidden = (flags ?? '').split('\0').filter((r) => /^[a-zS] /.test(r)).map((r) => r.slice(2));
  return state;
}

export function evaluateRelease(s) {
  const problems = [];
  const notes = [];
  if (s.branch !== 'main') problems.push(`основная папка на «${s.branch}», нужна main`);
  if (!s.remote.sha) {
    problems.push(`серверная main не прочитана (${s.remote.error}); совпадение с сервером не подтверждено`);
  } else if (s.head !== s.remote.sha) {
    const how = s.counts
      ? `локальных коммитов не на сервере: ${s.counts.ahead}, серверных не в локальной main: ${s.counts.behind}`
      : 'серверного коммита нет в локальном хранилище (fetch не выполняется)';
    problems.push(`локальная main ${short(s.head)} ≠ серверная ${short(s.remote.sha)}: ${how}`);
  }
  if (s.tracking !== (s.remote.sha ?? s.tracking)) notes.push(`origin/main ${short(s.tracking)} устарела относительно сервера ${short(s.remote.sha)}; сервером не считается`);
  if (!s.statusRead) problems.push('git status не прочитан; незакоммиченный код не проверен');
  const code = s.entries.filter((e) => !isMaterialPath(e.path) || (e.from && !isMaterialPath(e.from)));
  const materials = s.entries.length - code.length;
  if (code.length) problems.push(`незакоммиченный код, процессные или неопознанные файлы: ${code.length} (${code.slice(0, 5).map((e) => e.path).join(', ')}${code.length > 5 ? ', …' : ''})`);
  if (!s.hiddenRead) problems.push('git ls-files -v не прочитан; скрытые флагами изменения не проверены');
  const hiddenCode = s.hidden.filter((p) => !isMaterialPath(p));
  if (hiddenCode.length) problems.push(`файлы со скрытыми изменениями (assume-unchanged/skip-worktree): ${hiddenCode.slice(0, 5).join(', ')}`);
  if (materials) notes.push(`незаконченных материалов статей: ${materials} — завершению выпуска не мешают`);
  notes.push('игнорируемые файлы строгой проверкой не оцениваются');
  return {problems, notes};
}

// Строка для обычного отчёта: отличие и недоступность видны, но обычная работа не блокируется.
export function remoteSummary(s) {
  if (!s.remote.sha) return {ok: null, text: `серверная main НЕ ПРОВЕРЕНА: ${s.remote.error}`};
  if (s.head === s.remote.sha) return {ok: true, text: `локальная main совпадает с серверной ${short(s.remote.sha)}`};
  const {problems} = evaluateRelease({...s, branch: 'main', entries: [], hidden: [], statusRead: true, hiddenRead: true});
  return {ok: false, text: problems[0]};
}
