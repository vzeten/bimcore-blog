// Имя каждого теста повторяет формулировку правила.
// Состав выпуска по ВИДУ записи: обычная статья, страница категории, корневая страница, запись вне
// канона. Правило вида живёт в `src/core/articleKind.mjs`, границы владения файлами — там же;
// здесь проверяется, что ручка состава этими границами и живёт.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {releaseRoute} from '../src/adapters/releaseRoute.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

const СТАТЬЯ = '---\ntitle: "Проба"\nslug: /lessons/proba\n---\n\nТекст статьи.\n';
const КОРЕНЬ = '---\ntitle: "Главная"\nslug: /\n---\n\nТекст.\n';

const песочницы = [];
function среда(файлы) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-kind-'));
  песочницы.push(repo);

  for (const [rel, содержимое] of Object.entries(файлы)) {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), содержимое, 'utf8');
  }

  return repo;
}

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Один запрос к ручке состава. Сборщик не зовётся: сюда ходит только `/api/release`. */
async function состав(repo, rel) {
  const ответы = [];
  await releaseRoute({
    req: {method: 'POST'},
    res: {},
    url: {pathname: '/api/release'},
    repo,
    settings: НАСТРОЙКИ,
    тело: async () => ({path: rel}),
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, status, payload) => ответы.push({status, payload}),
  });

  return ответы[0]?.payload ?? {};
}

describe('состав выпуска по виду записи', () => {
  it('_category_.json пустой категории в состав её страницы не входит', async () => {
    // Категория без дочерних статей прежде считалась обычной статьёй, и её служебный файл уезжал бы
    // в коммит как «файл из папки статьи».
    const repo = среда({
      'docs/guides/курс/_category_.json': '{"label":"Курс"}',
      'docs/guides/курс/index.mdx': СТАТЬЯ,
      'docs/guides/курс/cover.png': 'обложка',
    });

    const payload = await состав(repo, 'docs/guides/курс/index.mdx');
    const пути = payload.файлы.map((файл) => файл.путь);

    expect(пути).toContain('docs/guides/курс/index.mdx');
    expect(пути).toContain('docs/guides/курс/cover.png');
    expect(пути).not.toContain('docs/guides/курс/_category_.json');
  });

  it('состав страницы категории не забирает дочерние статьи и подкатегории', async () => {
    const repo = среда({
      'docs/guides/_category_.json': '{"label":"Guides"}',
      'docs/guides/index.mdx': СТАТЬЯ,
      'docs/guides/дочерняя/index.mdx': СТАТЬЯ,
      'docs/guides/дочерняя/cover.png': 'чужая обложка',
      'docs/guides/подкатегория/_category_.json': '{"label":"Под"}',
    });

    const payload = await состав(repo, 'docs/guides/index.mdx');

    expect(payload.файлы.map((файл) => файл.путь)).toEqual(['docs/guides/index.mdx']);
    expect(payload.можно).toBe(true);
  });

  it('второй файл статьи на верхнем уровне категории — состав не доказан, а не молча потерян', async () => {
    // Дочерние статьи категории лежат в подкаталогах и соседями не считаются. Второй же файл
    // рядом с самой страницей — та же неоднозначность, что и у обычной статьи: чьи здесь картинки,
    // по путям не видно. Молча выбросить его из состава нельзя — он уехал бы на сайт без них.
    const repo = среда({
      'docs/guides/_category_.json': '{"label":"Guides"}',
      'docs/guides/index.mdx': СТАТЬЯ,
      'docs/guides/заметка.mdx': СТАТЬЯ,
      'docs/guides/cover.png': 'обложка',
    });

    const payload = await состав(repo, 'docs/guides/index.mdx');

    expect(payload.можно).toBe(false);
    expect(payload.разрывы[0]).toMatchObject({причина: 'папкаНеОдна'});
  });

  it('корневая страница выпускается сама собой: весь корень контента в состав не идёт', async () => {
    const repo = среда({
      'docs/intro.mdx': КОРЕНЬ,
      'i18n/ru/docusaurus-plugin-content-docs/current/intro.mdx': КОРЕНЬ,
      'docs/чужая/index.mdx': СТАТЬЯ,
      'docs/чужая/cover.png': 'чужая обложка',
      'docs/_category_.json': '{"label":"Docs"}',
    });

    const payload = await состав(repo, 'docs/intro.mdx');

    expect(payload.можно).toBe(true);
    expect(payload.файлы.map((файл) => файл.путь))
      .toEqual(['docs/intro.mdx', 'i18n/ru/docusaurus-plugin-content-docs/current/intro.mdx']);
  });

  it('одиночный файл в корне без slug «/» выпускать нельзя: доказать его состав нечем', async () => {
    const repo = среда({'docs/что-то.mdx': СТАТЬЯ, 'docs/чужая/index.mdx': СТАТЬЯ});

    const payload = await состав(repo, 'docs/что-то.mdx');

    expect(payload.можно).toBe(false);
    expect(payload.разрывы[0]).toMatchObject({причина: 'внеКанона'});
    expect(payload.файлы.map((файл) => файл.путь)).toEqual(['docs/что-то.mdx']);
  });
});
