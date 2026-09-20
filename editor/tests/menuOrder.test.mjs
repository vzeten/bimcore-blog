// Порядок статей как в боковом меню сайта: правило на выдуманных данных и сверка с настоящим
// деревом материалов владельца. Имя каждого теста повторяет формулировку правила.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {groupArticles} from '../src/core/articles.mjs';
import {ПОРЯДОК_МЕНЮ, расставитьПоМеню} from '../src/core/menuOrder.mjs';
import {nodeChain, порядокПоУмолчанию, sortArticles} from '../src/core/registry.mjs';
import {ПАПКА_ВЛАДЕЛЬЦА} from '../src/core/materialRoot.mjs';
import {listArticles} from '../src/adapters/library.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

function файл(p, позиция = null) {
  return {path: p, title: p, скрыта: false, готовность: null, правил: null, когда: 0, позиция};
}

/** Пути статей в порядке меню: ровно то, что окно получает готовыми числами. */
function поМеню(файлы, каталоги = []) {
  const статьи = groupArticles(файлы, НАСТРОЙКИ);
  const номера = расставитьПоМеню(статьи, new Map(каталоги), НАСТРОЙКИ);

  return статьи
    .filter((статья) => номера.has(статья.key))
    .sort((одна, другая) => номера.get(одна.key) - номера.get(другая.key))
    .map((статья) => Object.values(статья.versions)[0].path);
}

describe('порядок статей как в боковом меню сайта', () => {
  it('каталоги идут по позиции из своего `_category_.json`, а не по имени', () => {
    expect(поМеню(
      [файл('docs/alpha/one/index.mdx', 1), файл('docs/beta/one/index.mdx', 1)],
      [['docs/alpha', 2], ['docs/beta', 1]],
    )).toEqual(['docs/beta/one/index.mdx', 'docs/alpha/one/index.mdx']);
  });

  it('внутри каталога статьи идут по `sidebar_position`', () => {
    expect(поМеню(
      [файл('docs/alpha/x/index.mdx', 5), файл('docs/alpha/y/index.mdx', 1)],
      [['docs/alpha', 1]],
    )).toEqual(['docs/alpha/y/index.mdx', 'docs/alpha/x/index.mdx']);
  });

  it('без позиции — вниз своего уровня, а равные позиции разводит имя папки', () => {
    expect(поМеню(
      [файл('docs/alpha/a2/index.mdx'), файл('docs/alpha/b/index.mdx', 3), файл('docs/alpha/a1/index.mdx')],
      [['docs/alpha', 1]],
    )).toEqual(['docs/alpha/b/index.mdx', 'docs/alpha/a1/index.mdx', 'docs/alpha/a2/index.mdx']);
  });

  it('страница каталога стоит над своими статьями, а не среди них по алфавиту', () => {
    // В меню она и ЕСТЬ этот каталог: Docusaurus показывает её ссылкой на его заголовке.
    expect(поМеню(
      [файл('docs/alpha/aaa/index.mdx', 1), файл('docs/alpha/index.mdx', 9)],
      [['docs/alpha', 1]],
    )).toEqual(['docs/alpha/index.mdx', 'docs/alpha/aaa/index.mdx']);
  });

  it('позиция из `_category_.json` сильнее позиции индексной страницы этого каталога', () => {
    // У `alpha` позиция объявлена файлом категории (1), у `beta` её объявляет своя индексная
    // страница (5). Возьми правило позицию индекса там, где файл категории есть, — `alpha`
    // уехала бы вниз со своей девяткой.
    expect(поМеню(
      [файл('docs/alpha/index.mdx', 9), файл('docs/beta/index.mdx', 5)],
      [['docs/alpha', 1], ['docs/beta', null]],
    )).toEqual(['docs/alpha/index.mdx', 'docs/beta/index.mdx']);
  });

  it('статья ленты номера в меню не получает вовсе', () => {
    const статьи = groupArticles([файл('blog/proba/index.mdx', 1)], НАСТРОЙКИ);

    expect(расставитьПоМеню(статьи, new Map(), НАСТРОЙКИ).size).toBe(0);
  });

  it('статья без места в меню уходит вниз списка, а не наверх нулём', () => {
    const статьи = groupArticles(
      [файл('docs/alpha/one/index.mdx', 1), файл('blog/proba/index.mdx', 1)],
      НАСТРОЙКИ,
    );
    const номера = расставитьПоМеню(статьи, new Map([['docs/alpha', 1]]), НАСТРОЙКИ);
    const свод = статьи.map((статья) => ({...статья, порядокМеню: номера.get(статья.key) ?? null}));

    expect(sortArticles(свод, ПОРЯДОК_МЕНЮ, 'вверх', НАСТРОЙКИ).map((статья) => статья.kind))
      .toEqual(['docs', 'blog']);
  });
});

describe('порядок, в котором раздел открывается сам', () => {
  it('блог и все статьи — сверху те, что менялись последними', () => {
    for (const раздел of [null, '', 'blog']) {
      expect(порядокПоУмолчанию(раздел, НАСТРОЙКИ)).toEqual({колонка: 'когда', сторона: 'вниз'});
    }
  });

  it('раздел документации — в порядке бокового меню сайта', () => {
    for (const раздел of ['docs', 'docs/guides/families', 'проба']) {
      expect(порядокПоУмолчанию(раздел, НАСТРОЙКИ)).toEqual({колонка: ПОРЯДОК_МЕНЮ, сторона: 'вверх'});
    }
  });
});

// --- Сверка с настоящим деревом материалов владельца (только чтение) ---

/** `sidebar_position` из шапки файла. Разбор нарочно свой: сверка не должна звать правило. */
function позицияФайла(файл) {
  const строка = fs.readFileSync(файл, 'utf8').split(/\r?\n/).find((s) => s.startsWith('sidebar_position:'));
  if (!строка) return undefined;

  const число = Number(строка.slice('sidebar_position:'.length).trim());
  return Number.isFinite(число) ? число : undefined;
}

function позицияКатегории(dir) {
  const файл = path.join(dir, '_category_.json');
  if (!fs.existsSync(файл)) return undefined;

  const значение = JSON.parse(fs.readFileSync(файл, 'utf8').replace(/^﻿/, ''))['position'];
  return typeof значение === 'number' ? значение : undefined;
}

/**
 * Ожидаемый порядок меню, собранный независимо от кода программы — повтором самого Docusaurus
 * (`DefaultSidebarItemsGenerator`): дерево папок, на каждом уровне `sortBy` по паре
 * «позиция, имя», индексная страница папки становится ссылкой её заголовка.
 */
function каталогМеню(dir, имя) {
  const дети = [];

  for (const запись of fs.readdirSync(dir, {withFileTypes: true})) {
    if (запись.name.startsWith('_') || запись.name.startsWith('.')) continue;
    const полный = path.join(dir, запись.name);

    if (запись.isDirectory()) дети.push(каталогМеню(полный, запись.name));
    else if (/\.mdx?$/.test(запись.name)) {
      дети.push({имя: запись.name, файл: полный, позиция: позицияФайла(полный)});
    }
  }

  const индексные = ['index', 'readme', String(имя ?? '').toLowerCase()];
  const индекс = имя === null
    ? undefined
    : дети.find((дитя) => дитя.файл && индексные.includes(дитя.имя.replace(/\.[^.]+$/, '').toLowerCase()));

  return {
    имя,
    ссылка: индекс?.файл ?? null,
    позиция: позицияКатегории(dir) ?? индекс?.позиция,
    дети: дети.filter((дитя) => дитя !== индекс),
  };
}

const поУровню = (одна, другая) => {
  if (одна.позиция !== другая.позиция) {
    if (одна.позиция === undefined) return 1;
    if (другая.позиция === undefined) return -1;
    return одна.позиция - другая.позиция;
  }

  return одна.имя < другая.имя ? -1 : Number(одна.имя > другая.имя);
};

function развернуть(узел, вышло = []) {
  if (узел.ссылка) вышло.push(узел.ссылка);
  if (узел.файл) return вышло.push(узел.файл), вышло;

  for (const дитя of [...узел.дети].sort(поУровню)) развернуть(дитя, вышло);
  return вышло;
}

describe('порядок раздела документации совпадает с боковым меню настоящего сайта', () => {
  const корень = path.join(ПАПКА_ВЛАДЕЛЬЦА, 'docs');
  const материалы = fs.existsSync(корень);
  const ожидание = материалы ? развернуть(каталогМеню(корень, null)).map((файл) => path.relative(ПАПКА_ВЛАДЕЛЬЦА, файл).split(path.sep).join('/')) : [];
  const статьи = материалы ? listArticles(ПАПКА_ВЛАДЕЛЬЦА, НАСТРОЙКИ, new Map(), new Set()) : [];

  it.runIf(материалы)('сверка не пустая: в дереве владельца есть чему расходиться', () => {
    expect(ожидание.length).toBeGreaterThan(20);
  });

  it.runIf(материалы)('статьи документации идут ровно так, как их выстроит сайт', () => {
    const мой = sortArticles(
      статьи.filter((статья) => nodeChain(статья).includes('docs')),
      ПОРЯДОК_МЕНЮ,
      'вверх',
      НАСТРОЙКИ,
    )
      .map((статья) => статья.versions['en']?.path)
      .filter(Boolean);

    // Русская статья без английской версии в английском меню не стоит, и сравнивать её не с чем.
    expect(мой).toEqual(ожидание);
  });

  it.runIf(материалы)('у записей ленты места в меню нет', () => {
    const лента = статьи.filter((статья) => статья.kind === 'blog');

    expect(лента.length).toBeGreaterThan(0);
    expect(лента.every((статья) => статья.порядокМеню === null)).toBe(true);
  });
});
