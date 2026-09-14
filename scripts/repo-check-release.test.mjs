// Строгая проверка завершения выпуска кода сайта: ответы git подставлены, сеть и хранилище не используются.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectRelease, evaluateRelease, isMaterialPath, parseStatusZ, remoteSummary} from './repo-check-release.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);

// Заглушка git: ответы по первому аргументу; функция-ответ может бросить ошибку, как execFileSync.
function stub({branch = 'main', head = A, tracking = A, remote = `${A}\trefs/heads/main\n`, status = '', counts = '8\t1\n', known = true, lsFiles = ''} = {}) {
  const calls = [];
  const run = (args, opts) => {
    calls.push({args, opts});
    const answer = {
      'rev-parse': () => (args[1] === '--abbrev-ref' ? branch : args[1] === 'HEAD' ? head : tracking ?? (() => { throw new Error('нет'); })()),
      'ls-remote': () => (typeof remote === 'function' ? remote() : remote),
      status: () => status,
      'cat-file': () => { if (!known) throw new Error('нет объекта'); return ''; },
      'rev-list': () => counts,
      'ls-files': () => lsFiles,
    }[args[0]];
    if (!answer) throw new Error(`неожиданный вызов git ${args.join(' ')}`);
    return answer();
  };
  return {run, calls};
}
const check = (o) => evaluateRelease(collectRelease(stub(o).run));

test('main равна серверу и чиста — сверка main пройдена', () => {
  assert.deepEqual(check().problems, []);
});

test('чтение сервера: ls-remote с ограничением времени, без fetch и без записывающих команд', () => {
  const {run, calls} = stub();
  collectRelease(run);
  const ls = calls.find((c) => c.args[0] === 'ls-remote');
  assert.ok(ls.opts.timeout > 0);
  assert.equal(ls.opts.env.GIT_TERMINAL_PROMPT, '0');
  const allowed = new Set(['rev-parse', 'ls-remote', 'status', 'cat-file', 'rev-list', 'ls-files']);
  assert.ok(calls.every((c) => allowed.has(c.args[0])), calls.map((c) => c.args[0]).join(','));
});

test('разошлись: 8 локальных коммитов и 1 серверный — препятствие с числами', () => {
  const {problems} = check({head: A, tracking: B, remote: `${B}\trefs/heads/main\n`});
  assert.equal(problems.length, 1);
  assert.match(problems[0], /aaaaaaaa ≠ серверная bbbbbbbb.*не на сервере: 8.*не в локальной main: 1/);
});

test('серверного коммита нет локально — сказано прямо, fetch не выполняется', () => {
  assert.match(check({remote: `${B}\trefs/heads/main\n`, known: false}).problems[0], /нет в локальном хранилище/);
});

test('сервер недоступен или не ответил вовремя — неизвестность блокирует строгий режим', () => {
  const timeout = check({remote: () => { throw Object.assign(new Error('t'), {code: 'ETIMEDOUT'}); }});
  assert.match(timeout.problems[0], /не прочитана \(нет ответа за 15 с\)/);
  const down = check({remote: () => { throw new Error('exit 2'); }});
  assert.match(down.problems[0], /не подтверждено/);
  assert.equal(remoteSummary(collectRelease(stub({remote: ''}).run)).ok, null);
});

test('устаревшая origin/main не выдаётся за сервер', () => {
  // HEAD и origin/main совпадают, а сервер ушёл вперёд: это расхождение, а не «всё по схеме».
  const r = check({head: A, tracking: A, remote: `${B}\trefs/heads/main\n`, counts: '0\t1\n'});
  assert.match(r.problems[0], /≠ серверная bbbbbbbb/);
  assert.match(r.notes[0], /origin\/main aaaaaaaa устарела относительно сервера bbbbbbbb/);
  // Обратный случай: HEAD равен серверу, отстаёт только origin/main — сверка пройдена, но видно замечание.
  const stale = check({head: B, tracking: C, remote: `${B}\trefs/heads/main\n`});
  assert.deepEqual(stale.problems, []);
  assert.match(stale.notes[0], /устарела/);
});

test('неверная ветка — препятствие', () => {
  assert.match(check({branch: 'fix/site-menu'}).problems[0], /«fix\/site-menu», нужна main/);
});

test('HEAD равен серверу, но в папке незакоммиченный код и процессные файлы — препятствие', () => {
  const status = [' M plugins/translation-map/map.mjs', ' M docusaurus.config.js', '?? editor/TASKS.md', ' M content-quality-rules.json', ''].join('\0');
  const {problems} = check({status});
  assert.equal(problems.length, 1);
  assert.match(problems[0], /код, процессные или неопознанные файлы: 4 \(plugins\/translation-map\/map\.mjs/);
});

test('незаконченные статьи, их картинки и _state.json не мешают', () => {
  const status = [
    '?? blog/built-in-wardrobes-revit/index.mdx', '?? blog/free-revit-families-risks/_state.json',
    ' M docs/guides/families/beds-for-revit/product.png', '?? i18n/ru/docusaurus-plugin-content-blog/revit-furniture-enscape/index.mdx',
    ' M i18n/ru/docusaurus-plugin-content-docs/current/guides/families/beds-for-revit/_state.json', '',
  ].join('\0');
  const r = check({status});
  assert.deepEqual(r.problems, []);
  assert.match(r.notes.join('\n'), /материалов статей: 5/);
});

test('allowlist материалов консервативный: настройки, static, код и скрытые папки не материалы', () => {
  for (const p of ['i18n/ru/docusaurus-plugin-content-blog/options.json', 'docs/guides/families/_category_.json', 'blog/authors.yml',
    'i18n/ru/code.json', 'static/img/authors/ivan.jpg', 'docs/guides/x/data.json', 'blog/post/Widget.jsx', 'src/pages/index.mdx',
    'i18n/de/docusaurus-plugin-content-blog/x/index.mdx', 'blog/.drafts/x.mdx', 'content-quality-rules.json']) {
    assert.equal(isMaterialPath(p), false, p);
  }
  assert.equal(isMaterialPath('i18n/es/docusaurus-plugin-content-docs/current/guides/a/index.md'), true);
});

test('переименование из кода в папку статьи засчитывается как код; разбор -z с исходным путём', () => {
  const out = ['R  blog/moved/index.mdx', 'src/components/Old.mdx', '?? blog/a/index.mdx', ''].join('\0');
  assert.deepEqual(parseStatusZ(out), [{code: 'R ', path: 'blog/moved/index.mdx', from: 'src/components/Old.mdx'}, {code: '??', path: 'blog/a/index.mdx'}]);
  assert.match(check({status: out}).problems[0], /: 1 \(blog\/moved\/index\.mdx\)/);
});

test('непрочитанный status и скрытые флагами изменения кода — препятствия', () => {
  const {run} = stub();
  const broken = (args, opts) => { if (args[0] === 'status') throw new Error('lock'); return run(args, opts); };
  assert.match(evaluateRelease(collectRelease(broken)).problems[0], /status не прочитан/);
  const hidden = check({lsFiles: ['H docusaurus.config.js', 'S src/theme/Root.js', 'h blog/a/index.mdx', ''].join('\0')});
  assert.equal(hidden.problems.length, 1);
  assert.match(hidden.problems[0], /скрытыми изменениями.*src\/theme\/Root\.js/);
  assert.doesNotMatch(hidden.problems[0], /docusaurus\.config\.js/);
});

test('ошибка ls-files -v — неизвестность скрытых флагов блокирует, а не даёт пустой список', () => {
  const {run} = stub();
  const broken = (args, opts) => { if (args[0] === 'ls-files') throw new Error('lock'); return run(args, opts); };
  const state = collectRelease(broken);
  assert.equal(state.hiddenRead, false);
  const {problems} = evaluateRelease(state);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ls-files -v не прочитан/);
});
