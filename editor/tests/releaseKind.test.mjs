// Имя каждого теста повторяет формулировку правила.
// Состав выпуска по ВИДУ записи: обычная статья, страница категории, корневая страница, запись вне
// канона. Правило вида живёт в `src/core/articleKind.mjs`, границы владения файлами — там же;
// здесь проверяется, что ручка состава этими границами и живёт.
import {afterEach, describe, expect, it, vi} from 'vitest';

import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {запрос, среда, убратьПесочницы} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

// Описание у пробных статей настоящее: ручка состава сама доказывает, что подготовка открытой
// версии прошла, и статья без описания до неё больше не доходит. Здесь проверяются границы владения
// файлами, а не правила подготовки, — поэтому статьи взяты исправные.
const СТАТЬЯ = '---\ntitle: "Проба"\nslug: /lessons/proba\ndescription: "Про пробу."\n---\n\nТекст статьи.\n';
const КОРЕНЬ = '---\ntitle: "Главная"\nslug: /\ndescription: "Главная страница."\n---\n\nТекст.\n';

afterEach(убратьПесочницы);

/**
 * Пути состава ОТКРЫТОЙ версии. Созданные заглушки соседних языков отсеиваются намеренно: здесь
 * проверяется граница владения файлами по виду записи, а не правило заглушек.
 */
async function состав(место, rel) {
  const {payload} = await запрос(releaseRoute, место, '/api/release', {path: rel});

  return {
    ...payload,
    файлы: (payload.файлы ?? []).filter((файл) => файл.источник === 'диск'),
  };
}

describe('состав выпуска по виду записи', () => {
  it('_category_.json пустой категории в состав её страницы не входит', async () => {
    // Категория без дочерних статей прежде считалась обычной статьёй, и её служебный файл уезжал бы
    // в коммит как «файл из папки статьи».
    const место = await среда({
      'docs/guides/курс/_category_.json': '{"label":"Курс"}',
      'docs/guides/курс/index.mdx': СТАТЬЯ,
      'docs/guides/курс/cover.png': 'обложка',
    });

    const payload = await состав(место, 'docs/guides/курс/index.mdx');
    const пути = payload.файлы.map((файл) => файл.путь);

    expect(пути).toContain('docs/guides/курс/index.mdx');
    expect(пути).toContain('docs/guides/курс/cover.png');
    expect(пути).not.toContain('docs/guides/курс/_category_.json');
  });

  it('состав страницы категории не забирает дочерние статьи и подкатегории', async () => {
    const место = await среда({
      'docs/guides/_category_.json': '{"label":"Guides"}',
      'docs/guides/index.mdx': СТАТЬЯ,
      'docs/guides/дочерняя/index.mdx': СТАТЬЯ,
      'docs/guides/дочерняя/cover.png': 'чужая обложка',
      'docs/guides/подкатегория/_category_.json': '{"label":"Под"}',
    });

    const payload = await состав(место, 'docs/guides/index.mdx');

    expect(payload.файлы.map((файл) => файл.путь)).toEqual(['docs/guides/index.mdx']);
    expect(payload.можно).toBe(true);
  });

  it('второй файл статьи на верхнем уровне категории — состав не доказан, а не молча потерян', async () => {
    // Дочерние статьи категории лежат в подкаталогах и соседями не считаются. Второй же файл
    // рядом с самой страницей — та же неоднозначность, что и у обычной статьи: чьи здесь картинки,
    // по путям не видно. Молча выбросить его из состава нельзя — он уехал бы на сайт без них.
    const место = await среда({
      'docs/guides/_category_.json': '{"label":"Guides"}',
      'docs/guides/index.mdx': СТАТЬЯ,
      'docs/guides/заметка.mdx': СТАТЬЯ,
      'docs/guides/cover.png': 'обложка',
    });

    const payload = await состав(место, 'docs/guides/index.mdx');

    expect(payload.можно).toBe(false);
    expect(payload.разрывы[0]).toMatchObject({причина: 'папкаНеОдна'});
  });

  it('корневая страница выпускается сама собой: весь корень контента в состав не идёт', async () => {
    const место = await среда({
      'docs/intro.mdx': КОРЕНЬ,
      'i18n/ru/docusaurus-plugin-content-docs/current/intro.mdx': КОРЕНЬ,
      'docs/чужая/index.mdx': СТАТЬЯ,
      'docs/чужая/cover.png': 'чужая обложка',
      'docs/_category_.json': '{"label":"Docs"}',
    });

    const payload = await состав(место, 'docs/intro.mdx');

    expect(payload.можно).toBe(true);
    // Публикуется ОТКРЫТАЯ версия: русский двойник корневой страницы человек не публиковал.
    expect(payload.файлы.map((файл) => файл.путь)).toEqual(['docs/intro.mdx']);
  });

  it('одиночный файл в корне без slug «/» выпускать нельзя: доказать его состав нечем', async () => {
    const место = await среда({'docs/что-то.mdx': СТАТЬЯ, 'docs/чужая/index.mdx': СТАТЬЯ});

    const payload = await состав(место, 'docs/что-то.mdx');

    expect(payload.можно).toBe(false);
    expect(payload.разрывы[0]).toMatchObject({причина: 'внеКанона'});
    expect(payload.файлы.map((файл) => файл.путь)).toEqual(['docs/что-то.mdx']);
  });
});
