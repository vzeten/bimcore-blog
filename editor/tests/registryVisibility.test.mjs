// Имя каждого теста повторяет формулировку правила.
// Как реестр показывает видимость: она принадлежит языковой версии (SPEC 2.8), поэтому
// смешанное состояние законно и называется именами языков, а не звёздочкой «разное».
// Вынесено из `registry.test.mjs` ради предела размера файла (SPEC 4.9).
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {groupArticles} from '../src/core/articles.mjs';
import {sortArticles, видимостьРангом, visibilityOf} from '../src/core/registry.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

const RU = 'i18n/ru/docusaurus-plugin-content-docs/current';
const ES = 'i18n/es/docusaurus-plugin-content-docs/current';

const файл = (p, title, extra = {}) =>
  ({path: p, title, скрыта: false, готовность: 'Черновик', правил: null, когда: 0, ...extra});

/** Одна статья из перечисленных файлов: реестр сшивает их в языковые версии по пути. */
const статья = (...файлы) => groupArticles(файлы, НАСТРОЙКИ)[0];

describe('видимость в реестре', () => {
  it('все версии видимы — скрытых языков нет вовсе', () => {
    const своя = статья(
      файл('docs/lessons/walls/index.mdx', 'Walls'),
      файл(`${RU}/lessons/walls/index.mdx`, 'Стены'),
    );

    expect(visibilityOf(своя, НАСТРОЙКИ)).toEqual({скрытые: [], всего: 2});
    expect(видимостьРангом(своя, НАСТРОЙКИ)).toBe(0);
  });

  it('скрыта часть версий — реестр называет именно их, а не считает статью скрытой', () => {
    // Так уже живут три статьи сайта: русская версия в меню, английская скрыта.
    const своя = статья(
      файл('docs/lessons/walls/index.mdx', 'Walls', {скрыта: true}),
      файл(`${RU}/lessons/walls/index.mdx`, 'Стены'),
    );

    expect(visibilityOf(своя, НАСТРОЙКИ)).toEqual({скрытые: ['en'], всего: 2});
    expect(видимостьРангом(своя, НАСТРОЙКИ)).toBe(1);
  });

  it('скрытые языки перечисляются в порядке настройки, а не в порядке обхода файлов', () => {
    // Иначе порядок в ячейке зависел бы от того, в какой папке файл нашёлся раньше,
    // и поехал бы при добавлении четвёртого языка.
    const своя = статья(
      файл(`${ES}/lessons/floors/index.mdx`, 'Suelos', {скрыта: true}),
      файл(`${RU}/lessons/floors/index.mdx`, 'Полы', {скрыта: true}),
      файл('docs/lessons/floors/index.mdx', 'Floors'),
    );

    expect(visibilityOf(своя, НАСТРОЙКИ).скрытые).toEqual(Object.keys(НАСТРОЙКИ['локали']).filter((код) => код !== 'en'));
  });

  it('статья с единственной скрытой версией скрыта целиком, а не «смешанная»', () => {
    // «Все скрыты» считается по существующим версиям, а не по числу языков в настройках:
    // у статьи бывает одна версия из трёх, и это нормальное состояние.
    const своя = статья(файл(`${RU}/lessons/roofs/index.mdx`, 'Кровли', {скрыта: true}));

    expect(visibilityOf(своя, НАСТРОЙКИ)).toEqual({скрытые: ['ru'], всего: 1});
    expect(видимостьРангом(своя, НАСТРОЙКИ)).toBe(2);
  });

  it('сортировка идёт состоянием: сначала видимые, потом смешанные, потом скрытые целиком', () => {
    // По голому числу скрытых версий статья с одной скрытой версией встала бы вровень
    // со смешанной статьёй из двух языков, хотя это разные состояния.
    const набор = [
      статья(файл('docs/lessons/a/index.mdx', 'A'), файл(`${RU}/lessons/a/index.mdx`, 'А', {скрыта: true})),
      статья(файл(`${RU}/lessons/b/index.mdx`, 'Б', {скрыта: true})),
      статья(файл('docs/lessons/c/index.mdx', 'C'), файл(`${RU}/lessons/c/index.mdx`, 'В')),
    ];

    const ранги = sortArticles(набор, 'видимость', 'вверх', НАСТРОЙКИ)
      .map((своя) => видимостьРангом(своя, НАСТРОЙКИ));

    expect(ранги).toEqual([0, 1, 2]);
  });

  it('обратная сортировка ставит скрытые целиком первыми, а видимые последними', () => {
    const набор = [
      статья(файл('docs/lessons/a/index.mdx', 'A'), файл(`${RU}/lessons/a/index.mdx`, 'А', {скрыта: true})),
      статья(файл(`${RU}/lessons/b/index.mdx`, 'Б', {скрыта: true})),
      статья(файл('docs/lessons/c/index.mdx', 'C'), файл(`${RU}/lessons/c/index.mdx`, 'В')),
    ];

    const ранги = sortArticles(набор, 'видимость', 'вниз', НАСТРОЙКИ)
      .map((своя) => видимостьРангом(своя, НАСТРОЙКИ));

    expect(ранги).toEqual([2, 1, 0]);
  });
});
