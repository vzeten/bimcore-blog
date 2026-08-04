// Имя каждого теста повторяет формулировку правила.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {articleKey, categoryOf, groupArticles, missingOnSite, sectionOf, versionStates} from '../src/core/articles.mjs';
import {buildTree, filterArticles, lastEditOf, readinessOf, sortArticles, visibilityOf} from '../src/core/registry.mjs';
import {parseGitLog, parseGitStatus} from '../src/core/gitLog.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

const RU = 'i18n/ru/docusaurus-plugin-content-docs/current';
const ES = 'i18n/es/docusaurus-plugin-content-docs/current';

function файл(p, title, extra = {}) {
  return {path: p, title, скрыта: false, готовность: 'Черновик', правил: null, когда: 0, ...extra};
}

describe('статья как одна сущность', () => {
  it('версии одной статьи на разных языках имеют один ключ', () => {
    const корни = НАСТРОЙКИ['контент'];

    expect(articleKey(`${RU}/guides/families/chairs/index.mdx`, корни))
      .toBe(articleKey('docs/guides/families/chairs/index.mdx', корни));
    expect(articleKey(`${ES}/guides/families/chairs/index.mdx`, корни))
      .toBe(articleKey('docs/guides/families/chairs/index.mdx', корни));
  });

  it('статья документации и статья блога с одинаковым именем — разные статьи', () => {
    const корни = НАСТРОЙКИ['контент'];

    expect(articleKey('docs/foo/index.mdx', корни)).not.toBe(articleKey('blog/foo/index.mdx', корни));
  });

  it('три файла одной статьи собираются в одну строку списка', () => {
    const статьи = groupArticles(
      [
        файл('docs/guides/families/chairs/index.mdx', 'Armchair Revit Families'),
        файл(`${RU}/guides/families/chairs/index.mdx`, 'Кресла для Revit'),
        файл(`${ES}/guides/families/chairs/index.mdx`, 'Sillones para Revit'),
      ],
      НАСТРОЙКИ,
    );

    expect(статьи).toHaveLength(1);
    expect(Object.keys(статьи[0].versions).sort()).toEqual(['en', 'es', 'ru']);
  });

  it('версия на основном языке устаревшей не бывает', () => {
    const [статья] = groupArticles(
      [файл('docs/lessons/walls/index.mdx', 'Walls'), файл(`${RU}/lessons/walls/index.mdx`, 'Стены')],
      НАСТРОЙКИ,
    );

    expect(versionStates(статья, {ru: 100, en: 999}, НАСТРОЙКИ).ru).toBe('есть');
  });

  it('название берётся с основного языка', () => {
    const [статья] = groupArticles(
      [файл('docs/guides/families/chairs/index.mdx', 'Chairs'), файл(`${RU}/guides/families/chairs/index.mdx`, 'Кресла')],
      НАСТРОЙКИ,
    );

    expect(статья.title).toBe('Кресла');
    expect(статья.titleFromOtherLocale).toBe(false);
  });

  it('нет версии на основном языке — название берётся по порядку языков из настроек', () => {
    const [статья] = groupArticles(
      [файл(`${ES}/guides/families/chairs/index.mdx`, 'Sillas'), файл('docs/guides/families/chairs/index.mdx', 'Chairs')],
      НАСТРОЙКИ,
    );

    expect(статья.title).toBe('Chairs');
    expect(статья.titleFromOtherLocale).toBe(true);
  });

  it('нет ни одного названия — берётся путь к файлу, и программа не падает', () => {
    const [статья] = groupArticles([файл('docs/guides/families/chairs/index.mdx', '')], НАСТРОЙКИ);

    expect(статья.title).toContain('chairs');
  });

  it('разные названия у версий — норма, а не рассинхрон', () => {
    const [статья] = groupArticles(
      [файл('docs/lessons/walls/index.mdx', 'Walls in Revit'), файл(`${RU}/lessons/walls/index.mdx`, 'Стены в Revit')],
      НАСТРОЙКИ,
    );

    expect(статья.versions.en.title).toBe('Walls in Revit');
    expect(статья.versions.ru.title).toBe('Стены в Revit');
    expect(статья.title).toBe('Стены в Revit');
  });

  it('одинаковые названия в разных разделах — норма, статьи остаются разными', () => {
    const статьи = groupArticles(
      [файл('docs/lessons/walls/index.mdx', 'Стены'), файл('docs/guides/families/walls/index.mdx', 'Стены')],
      НАСТРОЙКИ,
    );

    expect(статьи).toHaveLength(2);
    expect(new Set(статьи.map((статья) => статья.key)).size).toBe(2);
  });

  it('отсутствие обязательного языка — не дыра в переводах, а отсутствие статьи на сайте', () => {
    const [статья] = groupArticles([файл(`${RU}/lessons/walls/index.mdx`, 'Стены')], НАСТРОЙКИ);

    expect(статья.нетНаСайте).toBe(true);
    expect(missingOnSite(статья, НАСТРОЙКИ)).toBe(true);
  });

  it('нет испанской версии — это дыра в переводах, а не отсутствие статьи на сайте', () => {
    const [статья] = groupArticles(
      [файл('docs/lessons/walls/index.mdx', 'Walls'), файл(`${RU}/lessons/walls/index.mdx`, 'Стены')],
      НАСТРОЙКИ,
    );

    expect(статья.нетНаСайте).toBe(false);
    expect(versionStates(статья, {}, НАСТРОЙКИ).es).toBe('нет');
  });

  it('песочница живёт вне сайта, поэтому отсутствие английской версии для неё не ошибка', () => {
    const [статья] = groupArticles([файл('editor/sandbox/proba/index.mdx', 'Проба')], НАСТРОЙКИ);

    expect(статья.нетНаСайте).toBe(false);
  });

  it('перевод, который правили раньше основной версии, помечен устаревшим', () => {
    const [статья] = groupArticles(
      [файл('docs/lessons/walls/index.mdx', 'Walls'), файл(`${RU}/lessons/walls/index.mdx`, 'Стены')],
      НАСТРОЙКИ,
    );

    expect(versionStates(статья, {ru: 200, en: 100}, НАСТРОЙКИ).en).toBe('устарела');
    expect(versionStates(статья, {ru: 100, en: 200}, НАСТРОЙКИ).en).toBe('есть');
  });

  it('категория берётся по пути, а если путь не подошёл — по роду', () => {
    expect(categoryOf('docs/guides/families/chairs/index.mdx', НАСТРОЙКИ)).toBe('семейство');
    expect(categoryOf('blog/post/index.mdx', НАСТРОЙКИ)).toBe('блог');
    expect(categoryOf('editor/sandbox/proba/index.mdx', НАСТРОЙКИ)).toBe('проба');
  });

  it('раздел статьи одинаков у всех языковых версий', () => {
    expect(sectionOf('docs/guides/families/chairs/index.mdx', НАСТРОЙКИ))
      .toEqual(sectionOf(`${RU}/guides/families/chairs/index.mdx`, НАСТРОЙКИ));
  });

  it('index-файл раздела с вложенными статьями — служебная страница со своей категорией', () => {
    const статьи = groupArticles(
      [
        файл('docs/guides/families/index.mdx', 'Revit Families'),
        файл('docs/guides/families/chairs/index.mdx', 'Chairs'),
      ],
      НАСТРОЙКИ,
    );
    const раздел = статьи.find((a) => a.folders.join('/') === 'docs/guides/families');
    const обычная = статьи.find((a) => a.folders.join('/') === 'docs/guides/families/chairs');

    expect(раздел.служебная).toBe(true);
    expect(раздел.category).toBe(НАСТРОЙКИ['категорияСлужебной']);
    expect(обычная.служебная).toBe(false);
    expect(обычная.category).toBe('семейство');
  });

  it('index в собственной папке-статье служебным не считается', () => {
    const [одна] = groupArticles([файл('docs/courses/revit-free/index.mdx', 'Курс')], НАСТРОЙКИ);
    expect(одна.служебная).toBe(false);
  });
});

describe('реестр статей', () => {
  const статьи = groupArticles(
    [
      файл('docs/guides/families/chairs/index.mdx', 'Chairs'),
      файл(`${RU}/guides/families/chairs/index.mdx`, 'Кресла', {когда: 100, правил: 'vzeten'}),
      файл('docs/lessons/walls/index.mdx', 'Walls'),
      файл(`${RU}/lessons/walls/index.mdx`, 'Стены', {скрыта: true, готовность: 'Опубликована', когда: 300, правил: 'claude'}),
      файл('blog/news/index.mdx', 'News'),
    ],
    НАСТРОЙКИ,
  );

  it('дерево строится только из существующих статей и считает статьи, а не файлы', () => {
    const дерево = buildTree(статьи, НАСТРОЙКИ);
    const корень = дерево.find((узел) => узел.id === 'docs');

    expect(корень.count).toBe(2);
    expect(дерево.map((узел) => узел.id)).toContain('docs/guides/families');
    expect(дерево.some((узел) => узел.count === 0)).toBe(false);
  });

  it('узел дерева показывается понятным именем из настроек, а не именем папки', () => {
    const дерево = buildTree(статьи, НАСТРОЙКИ);

    expect(дерево.find((узел) => узел.id === 'docs').label).toBe('Документация');
    expect(дерево.find((узел) => узел.id === 'docs/guides/families').label).toBe('Семейства Revit');
  });

  it('отбор по разделу берёт и вложенные разделы', () => {
    expect(filterArticles(статьи, {раздел: 'docs'}, НАСТРОЙКИ)).toHaveLength(2);
    expect(filterArticles(статьи, {раздел: 'docs/guides/families'}, НАСТРОЙКИ)).toHaveLength(1);
  });

  it('отбор и поиск действуют вместе', () => {
    expect(filterArticles(статьи, {раздел: 'docs', запрос: 'крес'}, НАСТРОЙКИ)).toHaveLength(1);
    expect(filterArticles(статьи, {раздел: 'blog', запрос: 'крес'}, НАСТРОЙКИ)).toHaveLength(0);
  });

  it('поиск находит статью и по названию перевода', () => {
    expect(filterArticles(статьи, {запрос: 'chairs'}, НАСТРОЙКИ)).toHaveLength(1);
  });

  it('отбор «нет на сайте» показывает только статьи без обязательного языка', () => {
    const без = groupArticles([файл(`${RU}/lessons/floors/index.mdx`, 'Полы')], НАСТРОЙКИ);
    expect(filterArticles([...статьи, ...без], {переводы: 'нетНаСайте'}, НАСТРОЙКИ)).toHaveLength(1);
  });

  it('готовность и видимость принадлежат версии, а расхождение версий видно отдельно', () => {
    const стены = статьи.find((статья) => статья.key.includes('walls'));

    expect(readinessOf(стены, НАСТРОЙКИ).разное).toBe(true);
    expect(visibilityOf(стены).скрыта).toBe(false);
    expect(visibilityOf(стены).разное).toBe(true);
  });

  it('кто и когда правил — по самой свежей из версий статьи', () => {
    const стены = статьи.find((статья) => статья.key.includes('walls'));

    expect(lastEditOf(стены).правил).toBe('claude');
    expect(lastEditOf(стены).когда).toBe(300);
  });

  it('пустые значения при сортировке уходят вниз в обе стороны', () => {
    const пусто = {
      автор: (статья) => lastEditOf(статья).правил === null,
      когда: (статья) => lastEditOf(статья).когда === 0,
    };

    for (const [колонка, пустая] of Object.entries(пусто)) {
      for (const сторона of ['вверх', 'вниз']) {
        const места = sortArticles(статьи, колонка, сторона, НАСТРОЙКИ).map(пустая);
        const первоеПустое = места.indexOf(true);

        // После первого пустого значения не должно встретиться ни одного заполненного.
        expect({колонка, сторона, вперемешку: места.slice(первоеПустое).includes(false)})
          .toEqual({колонка, сторона, вперемешку: false});
      }
    }
  });

  it('статья без даты правки не встаёт первой при сортировке по дате', () => {
    const по = sortArticles(статьи, 'когда', 'вверх', НАСТРОЙКИ);

    expect(lastEditOf(по[0]).когда).toBeGreaterThan(0);
  });

  it('сортировка по названию идёт по-русски', () => {
    const по = sortArticles(статьи, 'название', 'вверх', НАСТРОЙКИ).map((статья) => статья.title);

    expect(по).toEqual([...по].sort((a, b) => a.localeCompare(b, 'ru')));
  });
});

describe('кто и когда правил файл', () => {
  it('первая встреча пути в истории git — самая свежая правка', () => {
    const карта = parseGitLog([
      '@1700000200|claude',
      'docs/a/index.mdx',
      '',
      '@1700000100|vzeten',
      'docs/a/index.mdx',
      'docs/b/index.mdx',
    ].join('\n'));

    expect(карта.get('docs/a/index.mdx')).toEqual({когда: 1700000200, правил: 'claude'});
    expect(карта.get('docs/b/index.mdx')).toEqual({когда: 1700000100, правил: 'vzeten'});
  });

  it('переименование считается за новый путь, а не за старый', () => {
    const пути = parseGitStatus(' M docs/a/index.mdx\nR  docs/old/index.mdx -> docs/new/index.mdx');

    expect([...пути]).toEqual(['docs/a/index.mdx', 'docs/new/index.mdx']);
  });
});
