// Имя каждого теста повторяет формулировку правила.
// Ручка удаления на настоящем временном git: режим по ветке и её истории, подтверждение именно
// этого режима, корзина и возврат, статья-файл в общей папке, ссылка в пути.
import {afterEach, describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {deleteRoute} from '../src/adapters/deleteRoute.mjs';
import {trashRoute} from '../src/adapters/trashRoute.mjs';
import {saveDraft, saveSnapshot} from '../src/adapters/draftStore.mjs';
import {дверьGit} from '../src/adapters/gitEnv.mjs';
import {listArticles} from '../src/adapters/library.mjs';

const RU_ROOT = 'i18n/ru/docusaurus-plugin-content-docs/current';
const RU = `${RU_ROOT}/lessons/proba/index.mdx`;
const EN = 'docs/lessons/proba/index.mdx';
const БЛОГ = 'blog/2024-01-01-post.mdx';
const СОСЕД = 'blog/2024-02-02-other.mdx';

const НАСТРОЙКИ = {
  хранение: {файлСостояния: '_state.json', папкаЧерновиков: '.drafts', папкаСпоров: '.drafts-споры', папкаСнимков: '.history', снимковНаВерсию: 5, папкаКорзины: '.trash', корзинаДней: 30},
  контент: [
    {локаль: 'en', род: 'docs', папка: 'docs', наСайте: true},
    {локаль: 'ru', род: 'docs', папка: RU_ROOT, наСайте: true},
    {локаль: 'ru', род: 'blog', папка: 'blog', наСайте: true},
    {локаль: 'ru', род: 'проба', папка: 'editor/sandbox', наСайте: false},
  ],
  ошибкиСервера: {плохойЗапрос: 'неверный запрос', неверныйАдрес: 'неверный адрес', нетСтатьи: 'нет такой статьи'},
  ошибкиУдаления: {
    нетСтатьи: 'такой статьи нет', страницаРаздела: 'это страница раздела', подтверждениеНеТо: 'режим сменился',
    ссылкаВПути: 'ссылка в пути', переносНеЗавершён: 'перенос не завершён', нетЗаписи: 'нет записи',
    архивПовреждён: 'архив повреждён', возвратКонфликт: 'конфликт возврата', удалилосьНеВсё: 'удалилось не всё',
    остатки: 'остатки', осталисьКартинки: 'остались картинки',
  },
  локали: {en: 'English', ru: 'Русский'},
  основнойЯзык: 'ru',
  обязательныйЯзык: 'en',
  статусы: ['Черновик', 'Готова к публикации', 'Опубликована'],
  категорииПоПути: {},
  категорииПоРоду: {docs: 'инструкция', blog: 'блог', 'проба': 'проба'},
  категорияСлужебной: 'страница раздела',
  названияРазделов: {},
};

const песочницы = [];
afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

const git = (repo, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});

function записать(repo, rel, текст = '---\ntitle: Проба\n---\n\nтекст\n') {
  fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
  fs.writeFileSync(path.join(repo, rel), текст, 'utf8');
}

/**
 * Настоящий репозиторий: ветка `main` — опубликованная. В ней закоммичен сосед и блог;
 * статья `proba` по умолчанию не закоммичена — то есть никогда не публиковалась.
 */
function репозиторий({вВетке = [], снятыИзВетки = []} = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-delete-'));
  песочницы.push(repo);
  git(repo, 'init', '-q', '-b', 'main');
  for (const rel of [`${RU_ROOT}/lessons/other/index.mdx`, 'docs/lessons/other/index.mdx', БЛОГ, СОСЕД]) записать(repo, rel);
  записать(repo, 'blog/shared.png', 'общая картинка');
  записать(repo, 'blog/_2024-01-01-post.state.json', '{"готовность":"Черновик"}');
  for (const rel of вВетке) записать(repo, rel);
  for (const rel of снятыИзВетки) записать(repo, rel);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'сайт');
  if (снятыИзВетки.length > 0) {
    git(repo, 'rm', '-q', ...снятыИзВетки);
    git(repo, 'commit', '-q', '-m', 'снято');
  }
  for (const rel of [RU, EN]) if (!fs.existsSync(path.join(repo, rel))) записать(repo, rel);
  записать(repo, `${RU_ROOT}/lessons/proba/_state.json`, '{"готовность":"Черновик"}');
  записать(repo, `${RU_ROOT}/lessons/proba/img-01.png`, 'картинка');
  return repo;
}

async function ручка(repo, ручка, адрес, тело, ref = 'main') {
  const ответ = {};
  const принято = await ручка({
    req: {method: 'POST'}, res: {}, url: new URL(`http://localhost${адрес}`),
    repo, editorDir: path.join(repo, 'editor'), settings: НАСТРОЙКИ, git: дверьGit(repo),
    publishedRef: () => ref, тело: async () => тело,
    articles: async () => listArticles(repo, НАСТРОЙКИ, new Map(), new Set()),
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    последняяПравка: new Map(),
    send: (res, code, data) => { ответ.code = code; ответ.data = data; },
  });
  return {принято, ...ответ};
}

const удалить = (repo, rel, подтверждено, ref) => ручка(repo, deleteRoute, '/api/article/delete', подтверждено === undefined ? {path: rel} : {path: rel, подтверждено}, ref);
const есть = (repo, rel) => fs.existsSync(path.join(repo, rel));
const корзина = (repo) => fs.existsSync(path.join(repo, 'editor/.trash')) ? fs.readdirSync(path.join(repo, 'editor/.trash')) : [];

describe('режим по настоящей ветке', () => {
  it('без подтверждения сервер только называет режим и ничего не трогает', async () => {
    const repo = репозиторий();
    const ответ = await удалить(repo, RU);
    expect(ответ.code).toBe(200);
    expect(ответ.data).toMatchObject({режим: 'навсегда', причина: 'неОпубликована', пути: [EN, RU], языки: ['en', 'ru'], дней: 30});
    expect(есть(repo, RU)).toBe(true);
  });

  it('статья не в ветке и не в её истории — навсегда после подтверждения; уходят все версии, папки, черновик, история', async () => {
    const repo = репозиторий();
    saveDraft(repo, НАСТРОЙКИ, {path: RU, body: 'черновик', frontmatterRaw: '', отпечатокБазы: 'x'});
    saveSnapshot(repo, НАСТРОЙКИ, RU, 'снимок', 'Автор', '2026-09-01T10:00:00.000Z');
    const ответ = await удалить(repo, RU, 'навсегда');
    expect(ответ.code).toBe(200);
    expect(ответ.data).toMatchObject({режим: 'навсегда', удалено: [EN, RU]});
    expect(есть(repo, RU)).toBe(false);
    expect(есть(repo, `${RU_ROOT}/lessons/proba`)).toBe(false);
    expect(есть(repo, 'docs/lessons/other/index.mdx')).toBe(true);
    expect(корзина(repo)).toEqual([]);
    expect(fs.readdirSync(path.join(repo, 'editor/.drafts'))).toEqual([]);
  });

  it('статья в опубликованной ветке — корзина, файлы и картинки в архиве, соседи целы', async () => {
    const repo = репозиторий({вВетке: [RU, EN]});
    expect((await удалить(repo, RU)).data).toMatchObject({режим: 'корзина', причина: 'опубликована'});
    const ответ = await удалить(repo, RU, 'корзина');
    expect(ответ.code).toBe(200);
    expect(ответ.data).toMatchObject({режим: 'корзина', удалено: [EN, RU]});
    expect(есть(repo, RU)).toBe(false);
    expect(есть(repo, `${RU_ROOT}/lessons/proba/img-01.png`)).toBe(false);
    expect(корзина(repo)).toHaveLength(1);
    expect(есть(repo, `editor/.trash/${корзина(repo)[0]}/repo/${RU_ROOT}/lessons/proba/img-01.png`)).toBe(true);
    expect(есть(repo, `${RU_ROOT}/lessons/other/index.mdx`)).toBe(true);
  });

  it('статья была в ветке раньше и снята коммитом — всё равно корзина: адрес у неё уже был', async () => {
    const repo = репозиторий({снятыИзВетки: [RU, EN]});
    expect((await удалить(repo, RU)).data).toMatchObject({режим: 'корзина', причина: 'опубликована'});
  });

  it('ветку прочитать не удалось — корзина, а не отказ', async () => {
    const repo = репозиторий();
    expect((await удалить(repo, RU, undefined, 'нет-такой-ветки')).data).toMatchObject({режим: 'корзина', причина: 'неизвестно'});
    const ответ = await удалить(repo, RU, 'корзина', 'нет-такой-ветки');
    expect(ответ.code).toBe(200);
    expect(корзина(repo)).toHaveLength(1);
  });

  it('подтверждён не тот режим — отказ, ничего не тронуто', async () => {
    const repo = репозиторий({вВетке: [RU, EN]});
    const ответ = await удалить(repo, RU, 'навсегда');
    expect(ответ.code).toBe(409);
    expect(ответ.data).toMatchObject({причина: 'подтверждениеНеТо', режим: 'корзина'});
    expect(есть(repo, RU)).toBe(true);
    expect(корзина(repo)).toEqual([]);
  });

  it('время удаления становится порогом свежести: поздний черновик не воскресит статью', async () => {
    const repo = репозиторий();
    const память = new Map();
    await deleteRoute({
      req: {method: 'POST'}, res: {}, url: new URL('http://localhost/api/article/delete'),
      repo, editorDir: path.join(repo, 'editor'), settings: НАСТРОЙКИ, git: дверьGit(repo), publishedRef: () => 'main',
      тело: async () => ({path: RU, подтверждено: 'навсегда'}), articles: async () => listArticles(repo, НАСТРОЙКИ, new Map(), new Set()),
      insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep), последняяПравка: память, send: () => {},
    });
    expect([...память.keys()]).toEqual([EN, RU]);
  });
});

describe('что уходит, а что остаётся', () => {
  it('статья-файл в общей папке блога уносит только свой текст и своё состояние: сосед и общая картинка на месте', async () => {
    const repo = репозиторий();
    const ответ = await удалить(repo, БЛОГ, 'корзина');
    expect(ответ.code).toBe(200);
    expect(есть(repo, БЛОГ)).toBe(false);
    expect(есть(repo, 'blog/_2024-01-01-post.state.json')).toBe(false);
    expect(есть(repo, СОСЕД)).toBe(true);
    expect(есть(repo, 'blog/shared.png')).toBe(true);
  });

  it('страница раздела не удаляется ни в каком режиме', async () => {
    const repo = репозиторий();
    записать(repo, 'docs/lessons/index.mdx');
    const ответ = await удалить(repo, 'docs/lessons/index.mdx', 'навсегда');
    expect(ответ.code).toBe(400);
    expect(ответ.data.причина).toBe('страницаРаздела');
    expect(есть(repo, 'docs/lessons/index.mdx')).toBe(true);
  });

  it('путь за пределы репозитория удалением не считается; картинка внутри папки — не статья', async () => {
    const repo = репозиторий();
    expect((await удалить(repo, '../secret.txt', 'навсегда')).code).toBe(400);
    expect((await удалить(repo, `${RU_ROOT}/lessons/proba/img-01.png`, 'навсегда')).code).toBe(404);
  });

  it('junction в папке статьи — отказ до единого действия', async () => {
    const repo = репозиторий({вВетке: [RU, EN]});
    try {
      fs.symlinkSync(path.join(repo, 'docs/lessons/other'), path.join(repo, `${RU_ROOT}/lessons/proba/link`), 'junction');
    } catch {
      return;
    }
    const ответ = await удалить(repo, RU, 'корзина');
    expect(ответ.code).toBe(400);
    expect(ответ.data.причина).toBe('ссылкаВПути');
    expect(есть(repo, RU)).toBe(true);
    expect(корзина(repo)).toEqual([]);
  });
});

describe('корзина и возврат через ручки', () => {
  it('перечень показывает запись со сроком, возврат кладёт всё на место и снимает запись', async () => {
    const repo = репозиторий({вВетке: [RU, EN]});
    await удалить(repo, RU, 'корзина');
    const список = await ручка(repo, (п) => trashRoute({...п, req: {method: 'GET'}}), '/api/trash', {});
    expect(список.code).toBe(200);
    expect(список.data.записи).toHaveLength(1);
    expect(список.data.записи[0]).toMatchObject({пути: [EN, RU], языки: ['en', 'ru'], состояние: 'готово', название: 'Проба'});
    const возврат = await ручка(repo, trashRoute, '/api/trash/restore', {id: список.data.записи[0].id});
    expect(возврат.code).toBe(200);
    expect(есть(repo, RU)).toBe(true);
    expect(есть(repo, `${RU_ROOT}/lessons/proba/img-01.png`)).toBe(true);
    expect(корзина(repo)).toEqual([]);
  });

  it('на месте уже другая статья — возврат отклонён целиком, файлы не перезаписаны', async () => {
    const repo = репозиторий({вВетке: [RU, EN]});
    await удалить(repo, RU, 'корзина');
    const id = корзина(repo)[0];
    записать(repo, EN, 'новая статья');
    const возврат = await ручка(repo, trashRoute, '/api/trash/restore', {id});
    expect(возврат.code).toBe(409);
    expect(возврат.data).toMatchObject({причина: 'возвратКонфликт', конфликты: [EN]});
    expect(fs.readFileSync(path.join(repo, EN), 'utf8')).toBe('новая статья');
    expect(есть(repo, RU)).toBe(false);
  });

  it('чужое имя записи — нет записи, а не выход за папку корзины', async () => {
    const repo = репозиторий();
    expect((await ручка(repo, trashRoute, '/api/trash/restore', {id: '../../docs'})).code).toBe(404);
  });
});

describe('неполная история', () => {
  /** Клон глубиной один от репозитория, где статья была опубликована и снята коммитом раньше среза. */
  function неполныйКлон() {
    const исток = репозиторий({снятыИзВетки: [RU, EN]});
    git(исток, 'commit', '-q', '--allow-empty', '-m', 'ещё один коммит поверх');
    const клон = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-shallow-'));
    песочницы.push(клон);
    execFileSync('git', ['clone', '-q', '--depth', '1', '--branch', 'main', `file://${исток.replace(/\\/g, '/')}`, клон], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
    for (const rel of [RU, EN]) записать(клон, rel);
    return {исток, клон};
  }

  it('в неполной копии пустой git log по пути — не доказательство: режим корзина, причина неизвестно', async () => {
    const {клон} = неполныйКлон();
    expect(execFileSync('git', ['rev-parse', '--is-shallow-repository'], {cwd: клон, encoding: 'utf8'}).trim()).toBe('true');
    expect((await удалить(клон, RU, undefined, 'origin/main')).data).toMatchObject({режим: 'корзина', причина: 'неизвестно'});
  });

  it('в полной истории та же статья — корзина по доказанной прошлой публикации', async () => {
    const {исток} = неполныйКлон();
    expect((await удалить(исток, RU)).data).toMatchObject({режим: 'корзина', причина: 'опубликована'});
  });
});

