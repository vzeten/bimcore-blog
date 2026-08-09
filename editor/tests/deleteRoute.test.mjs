// Имя каждого теста повторяет формулировку правила.
// Ручка удаления статьи: стирает только то, чего нет на сайте, и вместе со всеми следами.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {deleteRoute} from '../src/adapters/deleteRoute.mjs';
import {saveDraft, saveSnapshot} from '../src/adapters/draftStore.mjs';
import {listArticles} from '../src/adapters/library.mjs';

const RU_ROOT = 'i18n/ru/docusaurus-plugin-content-docs/current';
const RU = `${RU_ROOT}/lessons/proba/index.mdx`;
const EN = 'docs/lessons/proba/index.mdx';

const НАСТРОЙКИ = {
  хранение: {файлСостояния: '_state.json', папкаЧерновиков: '.drafts', папкаСнимков: '.history', снимковНаВерсию: 5},
  контент: [
    {локаль: 'en', род: 'docs', папка: 'docs', наСайте: true},
    {локаль: 'ru', род: 'docs', папка: RU_ROOT, наСайте: true},
    {локаль: 'ru', род: 'проба', папка: 'editor/sandbox', наСайте: false},
  ],
  ошибкиСервера: {плохойЗапрос: 'неверный запрос', неверныйАдрес: 'неверный адрес', нетСтатьи: 'нет такой статьи'},
  ошибкиУдаления: {
    нетСтатьи: 'такой статьи нет',
    ужеНаСайте: 'статья уже на сайте',
    ветканеизвестна: 'неизвестно, вышла ли статья',
    страницаРаздела: 'это страница раздела',
    папкаНеОдна: 'в папке ещё одна статья',
    удалилосьНеВсё: 'удалилось не всё',
    остатки: 'остались черновик или история',
    осталисьКартинки: 'осталась папка с картинками',
  },
  локали: {en: 'English', ru: 'Русский'},
  основнойЯзык: 'ru',
  обязательныйЯзык: 'en',
  статусы: ['Черновик', 'Готова к публикации', 'Опубликована'],
  категорииПоПути: {},
  категорииПоРоду: {docs: 'инструкция', 'проба': 'проба'},
  категорияСлужебной: 'страница раздела',
  названияРазделов: {},
};

const песочницы = [];

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Репозиторий с одной статьёй в двух языках и соседней статьёй в том же разделе. */
function репозиторий() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-delete-'));
  песочницы.push(repo);

  for (const rel of [RU, EN, `${RU_ROOT}/lessons/other/index.mdx`, 'docs/lessons/other/index.mdx']) {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), '---\ntitle: Проба\n---\n\nтекст\n', 'utf8');
  }

  fs.writeFileSync(path.join(repo, path.dirname(RU), '_state.json'), '{"готовность":"Черновик"}', 'utf8');
  fs.writeFileSync(path.join(repo, path.dirname(RU), 'img-01.png'), 'картинка', 'utf8');
  return repo;
}

/** Один запрос к ручке. `ветка` — файлы опубликованной ветки; `null` — ветку прочитать не удалось. */
async function запрос(repo, rel, ветка = []) {
  const ответ = {};
  const git = {
    raw: async () => {
      if (ветка === null) throw new Error('нет ветки');
      return ветка.join('\n');
    },
  };

  const принято = await deleteRoute({
    req: {method: 'POST'},
    res: {},
    url: new URL('http://localhost/api/article/delete'),
    repo,
    editorDir: path.join(repo, 'editor'),
    settings: НАСТРОЙКИ,
    git,
    publishedRef: () => 'origin/main',
    тело: async () => ({path: rel}),
    // Свод статей — тот же, что видит человек в списке: удалять можно только то, что там есть.
    articles: async () => listArticles(repo, НАСТРОЙКИ, new Map(), new Set()),
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, code, data) => {
      ответ.code = code;
      ответ.data = data;
    },
  });

  return {принято, ...ответ};
}

const есть = (repo, rel) => fs.existsSync(path.join(repo, rel));

describe('удаление статьи', () => {
  it('статьи нет на сайте — уходят обе языковые версии', async () => {
    const repo = репозиторий();
    const ответ = await запрос(repo, RU);

    expect(ответ.code).toBe(200);
    expect(есть(repo, RU)).toBe(false);
    expect(есть(repo, EN)).toBe(false);
  });

  it('вместе со статьёй уходят её картинки и файл состояния', async () => {
    // Картинки лежат в папке статьи и принадлежат ей: оставить их значит оставить мусор,
    // на который никто уже не сошлётся.
    const repo = репозиторий();
    await запрос(repo, RU);

    expect(есть(repo, `${RU_ROOT}/lessons/proba`)).toBe(false);
  });

  it('соседняя статья того же раздела остаётся на месте', async () => {
    const repo = репозиторий();
    await запрос(repo, RU);

    expect(есть(repo, `${RU_ROOT}/lessons/other/index.mdx`)).toBe(true);
    expect(есть(repo, 'docs/lessons/other/index.mdx')).toBe(true);
  });

  it('одна из версий уже на сайте — не удаляется ничего', async () => {
    const repo = репозиторий();
    const ответ = await запрос(repo, RU, [EN]);

    expect(ответ.code).toBe(409);
    expect(ответ.data.причина).toBe('ужеНаСайте');
    expect(есть(repo, RU)).toBe(true);
    expect(есть(repo, EN)).toBe(true);
  });

  it('опубликованную ветку прочитать не удалось — отказ, файлы на месте', async () => {
    const repo = репозиторий();
    const ответ = await запрос(repo, RU, null);

    expect(ответ.data.причина).toBe('ветканеизвестна');
    expect(есть(repo, RU)).toBe(true);
  });

  it('черновик и история удалённой статьи не остаются мусором', async () => {
    const repo = репозиторий();
    const editorDir = path.join(repo, 'editor');
    saveDraft(editorDir, НАСТРОЙКИ, {path: RU, body: 'черновик', frontmatterRaw: 'title: A', отпечаток: 'x', когда: 1});
    saveSnapshot(editorDir, НАСТРОЙКИ, RU, 'старый текст', 'vzeten', '2026-08-09T10:00:00.000Z');

    await запрос(repo, RU);

    const черновики = fs.readdirSync(path.join(editorDir, '.drafts'));
    const история = fs.existsSync(path.join(editorDir, '.history')) ? fs.readdirSync(path.join(editorDir, '.history')) : [];

    expect(черновики).toEqual([]);
    expect(история).toEqual([]);
  });

  it('страница раздела не удаляется: под ней лежат другие статьи', async () => {
    const repo = репозиторий();
    fs.writeFileSync(path.join(repo, `${RU_ROOT}/lessons/index.mdx`), '---\ntitle: Уроки\n---\n', 'utf8');

    const ответ = await запрос(repo, `${RU_ROOT}/lessons/index.mdx`);

    expect(ответ.data.причина).toBe('страницаРаздела');
    expect(есть(repo, `${RU_ROOT}/lessons/index.mdx`)).toBe(true);
  });

  it('путь за пределы репозитория удалением не считается', async () => {
    const repo = репозиторий();
    const ответ = await запрос(repo, '../снаружи.mdx');

    expect(ответ.code).toBeGreaterThanOrEqual(400);
    expect(ответ.data.error).toBeTruthy();
  });

  it('пути нет в запросе — это плохой запрос, а не внутренняя ошибка', async () => {
    const repo = репозиторий();
    const ответ = await запрос(repo, 42);

    expect(ответ.code).toBe(400);
  });

  it('стереть файл не удалось — это ошибка, а не тихий успех', async () => {
    // Отменить удаление на середине нечем: стёртого файла не вернуть. Значит человеку говорят,
    // что удалено не всё, а не показывают «готово» поверх половины статьи.
    const repo = репозиторий();
    // Вместо файла состояния — папка с содержимым: обычное стирание на ней спотыкается.
    // Состояние идёт в списке последним, поэтому обе версии статьи к этому моменту уже стёрты —
    // ровно тот случай, когда удаление разваливается на середине.
    const состояние = path.join(repo, RU_ROOT, 'lessons/proba/_state.json');
    fs.rmSync(состояние);
    fs.mkdirSync(состояние);
    fs.writeFileSync(path.join(состояние, 'внутри.txt'), 'мешает', 'utf8');

    const ответ = await запрос(repo, RU);

    expect(ответ.code).toBe(500);
    expect(ответ.data.причина).toBe('удалилосьНеВсё');
    // Перечень уже стёртого уходит человеку точным: попади сюда файл, который на самом деле
    // остался, человек искал бы пропажу, которой не было, и наоборот — молча лишился бы того,
    // о чём ему не сказали.
    expect(ответ.data.стёрто).toEqual([EN, RU]);
    expect(есть(repo, RU)).toBe(false);
  });

  it('путь к картинке статьёй не считается: вместе с ней уехал бы и текст', async () => {
    // Ручка стирает папку статьи целиком, поэтому принять картинку за «версию» значит удалить
    // статью, о которой никто не просил.
    const repo = репозиторий();
    const ответ = await запрос(repo, `${RU_ROOT}/lessons/proba/img-01.png`);

    expect(ответ.code).toBe(404);
    expect(есть(repo, RU)).toBe(true);
    expect(есть(repo, `${RU_ROOT}/lessons/proba/img-01.png`)).toBe(true);
  });

  it('статьи по такому пути нет — 404, и ничего не стирается', async () => {
    const repo = репозиторий();
    const ответ = await запрос(repo, `${RU_ROOT}/lessons/выдумка/index.mdx`);

    expect(ответ.code).toBe(404);
    expect(есть(repo, RU)).toBe(true);
  });
});
