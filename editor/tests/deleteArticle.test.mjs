// Имя каждого теста повторяет формулировку правила.
// Удаление статьи с диска: режим один — корзина (решение владельца 2026-09-18). Снятие с сайта —
// отдельный шаг хода до корзины, правило удаления про сайт не судит.
import {describe, expect, it} from 'vitest';
import {решениеОбУдалении} from '../src/core/deleteArticle.mjs';

const RU = {
  path: 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx',
  состояние: 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/_state.json',
  папка: 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba',
  локаль: 'ru',
  наСайте: true,
  служебная: false,
  своя: true,
};

const EN = {
  path: 'docs/lessons/proba/index.mdx',
  состояние: null,
  папка: 'docs/lessons/proba',
  локаль: 'en',
  наСайте: true,
  служебная: false,
  своя: true,
};

const решение = (правки = {}) => решениеОбУдалении({версии: [RU, EN], ...правки});

describe('режим удаления', () => {
  it('режим один — корзина, все языковые версии сразу', () => {
    expect(решение()).toEqual({
      режим: 'корзина', пути: [RU.path, EN.path], языки: ['ru', 'en'],
      файлы: [RU.path, RU.состояние, EN.path], папки: [RU.папка, EN.папка],
    });
  });

  it('про сайт правило не судит: песочница уходит в корзину так же', () => {
    const проба = {...RU, path: 'editor/sandbox/proba/index.mdx', папка: 'editor/sandbox/proba', наСайте: false};
    expect(решение({версии: [проба]})).toMatchObject({режим: 'корзина', пути: [проба.path]});
  });
});

describe('что уходит вместе со статьёй', () => {
  it('файл состояния уходит, отсутствующий в список не попадает', () => {
    expect(решение().файлы).toEqual([RU.path, RU.состояние, EN.path]);
  });

  it('своя папка статьи уходит: в ней лежали только её картинки', () => {
    expect(решение().папки).toEqual([RU.папка, EN.папка]);
  });

  it('общая папка со статьёй-файлом не уходит: соседи и общие картинки остаются', () => {
    const блог = {...RU, path: 'blog/2024-post.mdx', состояние: 'blog/_2024-post.state.json', папка: 'blog', своя: false};
    expect(решение({версии: [блог]})).toMatchObject({папки: [], файлы: ['blog/2024-post.mdx', 'blog/_2024-post.state.json']});
  });

  it('страница раздела не удаляется ни в каком режиме: под ней лежат другие статьи', () => {
    expect(решение({версии: [{...RU, служебная: true}, EN]})).toEqual({ошибка: 'страницаРаздела'});
  });

  it('статьи нет вовсе — удалять нечего', () => {
    expect(решение({версии: []})).toEqual({ошибка: 'нетСтатьи'});
  });
});
