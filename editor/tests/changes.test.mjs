// События «Действия» (ED-054): какие изменения серверной main — изменения статей сайта. Чистые правила.
import {describe, expect, it} from 'vitest';
import {РАЗДЕЛИТЕЛЬ, статьяСайта, разобратьЛог, счётСтрок, короче} from '../src/core/changes.mjs';

const roots = [
  {папка: 'docs', род: 'docs', локаль: 'en', наСайте: true},
  {папка: 'blog', род: 'blog', локаль: 'en', наСайте: true},
  {папка: 'i18n/ru/docusaurus-plugin-content-docs/current', род: 'docs', локаль: 'ru', наСайте: true},
  {папка: 'editor/sandbox', род: 'docs', локаль: 'ru', наСайте: false},
];
const коммит = (sha, автор = 'vzeten', дата = '2026-09-20T10:00:00+02:00') => `@${sha}${РАЗДЕЛИТЕЛЬ}${автор}${РАЗДЕЛИТЕЛЬ}${дата}`;

describe('файл статьи сайта', () => {
  it('статья в корне сайта — да; картинка, служебное, песочница и код — нет', () => {
    expect(статьяСайта('docs/lessons/a.mdx', roots)).toBe(true);
    expect(статьяСайта('blog/post/index.md', roots)).toBe(true);
    expect(статьяСайта('i18n/ru/docusaurus-plugin-content-docs/current/lessons/a.mdx', roots)).toBe(true);
    expect(статьяСайта('docs/lessons/img-01.png', roots)).toBe(false);
    expect(статьяСайта('docs/lessons/_category_.json', roots)).toBe(false);
    expect(статьяСайта('docs/_drafts/a.mdx', roots)).toBe(false);
    expect(статьяСайта('editor/sandbox/proba/a.mdx', roots)).toBe(false);
    expect(статьяСайта('src/theme/Card.js', roots)).toBe(false);
  });
});

describe('разбор истории', () => {
  it('виды изменений, переименование одной записью, код и картинки мимо', () => {
    const вывод = [
      коммит('c1'),
      'A\tdocs/lessons/a.mdx', 'A\tdocs/lessons/img-01.png', 'M\tsrc/css/custom.css', '',
      коммит('c2', 'сотрудник'),
      'M\tdocs/lessons/a.mdx', 'R087\tblog/old/index.mdx\tblog/new/index.mdx', 'D\tdocs/lessons/b.mdx', '',
      коммит('c3'),
      'R100\tdocs/lessons/c.mdx\tdocs/lessons/_c.mdx', 'R100\tdocs/_old/d.mdx\tdocs/lessons/d.mdx', 'C090\tdocs/lessons/a.mdx\tdocs/lessons/e.mdx',
    ].join('\n');
    const итог = разобратьЛог(вывод, roots);
    expect(итог.map((запись) => запись.коммит)).toEqual(['c1', 'c2', 'c3']);
    expect(итог[0].изменения).toEqual([{вид: 'добавление', путь: 'docs/lessons/a.mdx', прежнийПуть: null}]);
    expect(итог[1].автор).toBe('сотрудник');
    expect(итог[1].изменения).toEqual([
      {вид: 'правка', путь: 'docs/lessons/a.mdx', прежнийПуть: null},
      {вид: 'переименование', путь: 'blog/new/index.mdx', прежнийПуть: 'blog/old/index.mdx'},
      {вид: 'удаление', путь: 'docs/lessons/b.mdx', прежнийПуть: null},
    ]);
    // Переезд в служебное — удаление статьи; из служебного — добавление; копия — новая статья.
    expect(итог[2].изменения).toEqual([
      {вид: 'удаление', путь: 'docs/lessons/c.mdx', прежнийПуть: null},
      {вид: 'добавление', путь: 'docs/lessons/d.mdx', прежнийПуть: null},
      {вид: 'добавление', путь: 'docs/lessons/e.mdx', прежнийПуть: null},
    ]);
  });

  it('один путь в одном коммите — одна запись, даже если git показал его дважды', () => {
    const итог = разобратьЛог([коммит('m1'), 'M\tdocs/lessons/a.mdx', '', 'M\tdocs/lessons/a.mdx'].join('\n'), roots);
    expect(итог[0].изменения).toHaveLength(1);
  });
});

describe('разница', () => {
  it('строки считаются без заголовков файла', () => {
    const разница = ['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -1,2 +1,2 @@', '-старое', '+новое', '+ещё', ' общее'].join('\n');
    expect(счётСтрок(разница)).toEqual({добавлено: 2, убрано: 1});
  });

  it('длинная разница обрезается по строке и помечается', () => {
    const разница = Array.from({length: 100}, (_, н) => `+строка ${н}`).join('\n');
    const итог = короче(разница, 200, '…обрезано');
    expect(Buffer.byteLength(итог, 'utf8')).toBeLessThan(260);
    expect(итог.endsWith('…обрезано\n')).toBe(true);
    expect(короче('+коротко', 200, '…')).toBe('+коротко');
  });
});
