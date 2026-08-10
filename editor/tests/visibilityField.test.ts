// Имя каждого теста повторяет формулировку правила.
// Видимость как обычное поле шапки: флажок в свойствах статьи, дословность нетронутого поля
// и правда о том, что видит сайт. Отдельной ручки видимости в программе нет.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  buildFrontmatter, parseFrontmatter, изменениеНеНаСайте, показанныеПоля, порядокПолей, скрытаВОкне,
} from '../src/ui/headFields';
import {путиДругихВерсий} from '../src/core/articles.mjs';
import {walk} from '../src/adapters/library.mjs';
import type {Settings} from '../src/ui/types';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(EDITOR, '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8')) as Settings;
const КОРНИ = НАСТРОЙКИ.контент;
const DOCS = 'docs/lessons/foo/index.mdx';
const порядок = порядокПолей(НАСТРОЙКИ, DOCS);

const поля = (шапка: string) => показанныеПоля(parseFrontmatter(шапка, DOCS, КОРНИ), порядок);
const собрать = (шапка: string, изменить: (список: ReturnType<typeof поля>) => ReturnType<typeof поля>) =>
  buildFrontmatter(шапка, изменить(поля(шапка)), DOCS, КОРНИ, порядок);

const переключить = (список: ReturnType<typeof поля>, значение: string) =>
  список.map((поле) => (поле.key === 'unlisted' ? {...поле, display: значение} : поле));

describe('видимость в свойствах статьи', () => {
  it('поле видимости показывается, даже когда строки unlisted в шапке нет вовсе', () => {
    // Видимая статья живёт без этой строки, и узнать о видимости человек должен из окна,
    // а не из чужого текстового редактора.
    const поле = поля('title: A').find((item) => item.key === 'unlisted');

    expect(поле).toEqual({key: 'unlisted', raw: '', kind: 'флаг', display: ''});
  });

  it('видимость показывается флажком, а не словом true в строке ввода', () => {
    expect(поля('title: A\nunlisted: true').find((поле) => поле.key === 'unlisted')?.kind).toBe('флаг');
  });

  it('всё, кроме true, читается как «в меню сайта» — тем же правилом, каким видимость читает сайт', () => {
    expect(скрытаВОкне(поля('title: A\nunlisted: false'))).toBe(false);
    expect(скрытаВОкне(поля('title: A\nunlisted: да'))).toBe(false);
    expect(скрытаВОкне(поля('title: A\nunlisted: true'))).toBe(true);
  });

  it('включённый флажок дописывает строку видимости в шапку', () => {
    expect(собрать('title: A', (список) => переключить(список, 'true'))).toBe('title: A\nunlisted: true');
  });

  it('снятый флажок убирает строку видимости целиком, а не оставляет пустое значение', () => {
    // Голое `unlisted:` YAML прочитает как `null`, а видимая статья живёт вообще без строки.
    expect(собрать('title: A\nunlisted: true', (список) => переключить(список, ''))).toBe('title: A');
  });

  it('включил и снова выключил до сохранения — шапка возвращается прежней, файл менять нечем', () => {
    const шапка = 'title: A\ndescription: "Б"';
    const туда = переключить(поля(шапка), 'true');
    const обратно = переключить(туда, '');

    expect(buildFrontmatter(шапка, обратно, DOCS, КОРНИ, порядок)).toBe(шапка);
  });

  it('нетронутая видимость возвращается дословно — и когда строки нет, и когда стоит false', () => {
    // Иначе одно только открытие и сохранение переписывало бы чужой файл (SPEC 5.1).
    for (const шапка of ['title: A', 'title: A\nunlisted: false', 'title: A\nunlisted: true']) {
      expect(собрать(шапка, (список) => список), шапка).toBe(шапка);
    }
  });

  it('правка соседнего поля строку видимости не трогает', () => {
    const шапка = 'title: A\nunlisted: true';
    const собрано = собрать(шапка, (список) => список.map((поле) => (поле.key === 'title' ? {...поле, display: 'Б'} : поле)));

    expect(собрано).toBe('title: "Б"\nunlisted: true');
  });

  it('нетронутая видимость возвращается дословно на всех настоящих статьях сайта', () => {
    const files = КОРНИ.flatMap((root) => walk(path.join(REPO, root.папка)) as string[]);

    for (const file of files) {
      const rel = path.relative(REPO, file).split(path.sep).join('/');
      const raw = fs.readFileSync(file, 'utf8');
      const head = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
      if (!head) continue;

      const шапка = head[1];
      const свой = порядокПолей(НАСТРОЙКИ, rel);
      const список = показанныеПоля(parseFrontmatter(шапка, rel, КОРНИ), свой);

      expect(buildFrontmatter(шапка, список, rel, КОРНИ, свой), rel).toBe(шапка.replace(/\r\n/g, '\n'));
    }
  });
});

describe('изменение ещё не на сайте', () => {
  const статья = (правки: Record<string, unknown>) => ({
    видимостьВВетке: {ru: false, en: false}, веткаИзвестна: true, внеСайта: false, ...правки,
  });

  it('видимость в окне совпала с веткой по всем версиям — про сайт сказать нечего', () => {
    expect(изменениеНеНаСайте(статья({видимостьВВетке: {ru: true, en: true}}), true)).toBe(false);
  });

  it('соседняя версия ещё не уехала — расхождение считается по всей статье, а не по открытой версии', () => {
    // Видимость — признак статьи целиком: скрыта русская, а английская на сайте всё ещё в меню.
    expect(изменениеНеНаСайте(статья({видимостьВВетке: {ru: true, en: false}}), true)).toBe(true);
  });

  it('версии нет в опубликованной ветке — это тоже «ещё не на сайте», а не «в меню»', () => {
    // Новая статья: файла в ветке нет вовсе, и сайт про неё ничего не знает.
    expect(изменениеНеНаСайте(статья({видимостьВВетке: {ru: null}}), false)).toBe(true);
  });

  it('окно молчит про сайт там, где сайт проверить не удалось', () => {
    // «Ветку прочитать не удалось» и «версии в ветке нет» — разные вещи, и первое не выдаётся
    // за второе: иначе при недоступном git статус говорил бы «изменение ещё не на сайте»
    // у статьи, которая на сайте давно и в том же виде. Правило то же, каким живёт удаление:
    // «не знаю» не значит «нет».
    expect(изменениеНеНаСайте(статья({веткаИзвестна: false, видимостьВВетке: {ru: null}}), true)).toBe(false);
  });

  it('статья вне сайта про сайт не говорит вовсе: песочница живёт отдельно', () => {
    expect(изменениеНеНаСайте(статья({внеСайта: true, видимостьВВетке: {ru: null}}), true)).toBe(false);
  });

  it('статья не открыта — говорить не о чем', () => {
    expect(изменениеНеНаСайте(null, true)).toBe(false);
  });
});

describe('какие файлы считаются версиями одной статьи', () => {
  it('версии документации находятся во всех локалях, кроме своей', () => {
    expect(путиДругихВерсий('docs/lessons/foo/index.mdx', КОРНИ)).toEqual([
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/foo/index.mdx',
      'i18n/es/docusaurus-plugin-content-docs/current/lessons/foo/index.mdx',
    ]);
  });

  it('версии блога ищутся среди блога, а не среди документации', () => {
    expect(путиДругихВерсий('i18n/ru/docusaurus-plugin-content-blog/bar/index.mdx', КОРНИ)).toEqual([
      'blog/bar/index.mdx',
      'i18n/es/docusaurus-plugin-content-blog/bar/index.mdx',
    ]);
  });

  it('раздел, живущий в одной локали, соседей не даёт: песочница живёт вне сайта', () => {
    expect(путиДругихВерсий('editor/sandbox/proba/index.mdx', КОРНИ)).toEqual([]);
  });

  it('путь вне известных корней соседей не даёт, а не выдумывает их', () => {
    expect(путиДругихВерсий('README.md', КОРНИ)).toEqual([]);
  });

  it('windows-слеши в пути не мешают найти языковые версии', () => {
    expect(путиДругихВерсий('docs\\lessons\\foo\\index.mdx', КОРНИ)).toEqual([
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/foo/index.mdx',
      'i18n/es/docusaurus-plugin-content-docs/current/lessons/foo/index.mdx',
    ]);
  });
});
