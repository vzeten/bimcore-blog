// Имя каждого теста повторяет формулировку правила.
// Поле обложки в свойствах статьи: показ, место среди полей и неизменность файла.
// Отделено от cover.test.ts, чтобы файл держался в пределе размера (SPEC 4.9).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {buildFrontmatter, parseFrontmatter, показанныеПоля, порядокПолей} from '../src/ui/headFields';
import type {Settings} from '../src/ui/types';
import {walk} from '../src/adapters/library.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(EDITOR, '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8')) as Settings;
const КОРНИ = НАСТРОЙКИ.контент;
const DOCS = 'docs/help/foo/index.mdx';

describe('общая картинка сайта, вписанная в статью', () => {
  const ОБЩАЯ = '/img/social-card.jpg';
  const порядок = порядокПолей(НАСТРОЙКИ, DOCS);
  const шапка = 'title: "Проба"\nimage: /img/social-card.jpg\nunlisted: true';

  it('общая картинка сайта в поле обложки показывается пустым полем', () => {
    // Своей обложки у статьи нет: сайт и так возьмёт общую, а написанный путь ничего не добавляет.
    const поля = parseFrontmatter(шапка, DOCS, КОРНИ, ОБЩАЯ);
    expect(поля.find((поле) => поле.key === 'image')?.display).toBe('');
  });

  it('своя обложка пустым полем не показывается', () => {
    const поля = parseFrontmatter('title: "Проба"\nimage: ./cover.png', DOCS, КОРНИ, ОБЩАЯ);
    expect(поля.find((поле) => поле.key === 'image')?.display).toBe('./cover.png');
  });

  it('строка с общей картинкой остаётся в файле нетронутой', () => {
    // Статья опубликована с этой строкой: переписывать её без действия человека нельзя.
    const поля = parseFrontmatter(шапка, DOCS, КОРНИ, ОБЩАЯ);
    expect(buildFrontmatter(шапка, поля, DOCS, КОРНИ, порядок, ОБЩАЯ)).toBe(шапка);
  });

  it('строка с общей картинкой в кавычках тоже остаётся нетронутой', () => {
    // YAML разрешает и кавычки. Сравнивай мы сырую строку — правка соседнего поля молча удалила бы
    // строку из опубликованной статьи.
    const вКавычках = 'title: "Проба"\nimage: "/img/social-card.jpg"\nunlisted: true';
    const поля = parseFrontmatter(вКавычках, DOCS, КОРНИ, ОБЩАЯ)
      .map((поле) => (поле.key === 'title' ? {...поле, display: 'Другое имя'} : поле));

    expect(buildFrontmatter(вКавычках, поля, DOCS, КОРНИ, порядок, ОБЩАЯ))
      .toBe('title: "Другое имя"\nimage: "/img/social-card.jpg"\nunlisted: true');
  });

  it('загруженная обложка заменяет строку с общей картинкой', () => {
    const поля = parseFrontmatter(шапка, DOCS, КОРНИ, ОБЩАЯ)
      .map((поле) => (поле.key === 'image' ? {...поле, display: './cover.png'} : поле));

    expect(buildFrontmatter(шапка, поля, DOCS, КОРНИ, порядок, ОБЩАЯ))
      .toBe('title: "Проба"\nimage: ./cover.png\nunlisted: true');
  });

  it('второго поля обложки у такой статьи не появляется', () => {
    const поля = показанныеПоля(parseFrontmatter(шапка, DOCS, КОРНИ, ОБЩАЯ), порядок);
    expect(поля.filter((поле) => поле.key === 'image')).toHaveLength(1);
  });

  it('очистка поля после своей обложки убирает строку, а не возвращает общую картинку', () => {
    // Человек поставил свою обложку, потом передумал и очистил поле. Пустое поле здесь значит
    // «обложки нет», а не «в файле снова общая картинка»: смотреть надо на то, что стоит в шапке
    // сейчас, а не на значение, с которым статью открыли.
    const сОбложкой = parseFrontmatter(шапка, DOCS, КОРНИ, ОБЩАЯ)
      .map((поле) => (поле.key === 'image' ? {...поле, display: './cover.png'} : поле));
    const послеЗагрузки = buildFrontmatter(шапка, сОбложкой, DOCS, КОРНИ, порядок, ОБЩАЯ);

    const очищено = сОбложкой.map((поле) => (поле.key === 'image' ? {...поле, display: ''} : поле));

    expect(buildFrontmatter(послеЗагрузки, очищено, DOCS, КОРНИ, порядок, ОБЩАЯ))
      .toBe('title: "Проба"\nunlisted: true');
  });

  it('общая картинка узнаётся и в windows-шапке с хвостовым возвратом каретки', () => {
    // Шапка приходит и в таком виде: строка кончается одиноким `\r`. Разбирать её своей регуляркой
    // значило бы завести второе правило рядом с общим — и строку опубликованной статьи стёрло бы.
    const windows = 'title: "Проба"\r\nimage: /img/social-card.jpg\r\r\nunlisted: true';
    const поля = parseFrontmatter(windows, DOCS, КОРНИ, ОБЩАЯ);

    expect(buildFrontmatter(windows, поля, DOCS, КОРНИ, порядок, ОБЩАЯ)).toContain('image: /img/social-card.jpg');
  });

  it('очистка поля убирает свою обложку и в кавычках', () => {
    const вКавычках = 'title: "Проба"\nimage: "./cover.png"\nunlisted: true';
    const поля = parseFrontmatter(вКавычках, DOCS, КОРНИ, ОБЩАЯ)
      .map((поле) => (поле.key === 'image' ? {...поле, display: ''} : поле));

    expect(buildFrontmatter(вКавычках, поля, DOCS, КОРНИ, порядок, ОБЩАЯ))
      .toBe('title: "Проба"\nunlisted: true');
  });
});

describe('поле обложки в свойствах статьи', () => {
  const порядок = порядокПолей(НАСТРОЙКИ, DOCS);

  it('поле обложки видно и у статьи, в шапке которой image нет', () => {
    // Отсутствие обложки — нормальное состояние статьи, но поставить её человек должен из окна,
    // а не из чужого текстового редактора.
    const поля = показанныеПоля(parseFrontmatter('title: "Проба"\nunlisted: true', DOCS, КОРНИ), порядок);
    expect(поля.map((поле) => поле.key)).toContain('image');
  });

  it('поле обложки, которого нет в шапке, показывается пустым', () => {
    const поля = показанныеПоля(parseFrontmatter('title: "Проба"', DOCS, КОРНИ), порядок);
    expect(поля.find((поле) => поле.key === 'image')?.display).toBe('');
  });

  it('поле обложки показывается на своём месте по порядку полей рода', () => {
    const шапка = 'title: "Проба"\nslug: /help/foo\ndescription: "О чём"\nunlisted: true';
    const поля = показанныеПоля(parseFrontmatter(шапка, DOCS, КОРНИ), порядок);
    // Человек видит все поля принятого порядка своего рода, а не именной список: очищенное поле
    // иначе исчезало бы из окна навсегда — строка уходит из файла, а показать её некому.
    // Пустыми в файл они при этом не пишутся.
    expect(поля.map((поле) => поле.key)).toEqual(порядок);
  });

  it('второго поля обложки у статьи с image не появляется', () => {
    const поля = показанныеПоля(parseFrontmatter('title: "Проба"\nimage: ./cover.png', DOCS, КОРНИ), порядок);
    expect(поля.filter((поле) => поле.key === 'image')).toHaveLength(1);
  });

  it('статью без обложки можно открыть и сохранить, и шапка не изменится ни на знак', () => {
    // Показанное поле — это показ, а не правка: файл трогает только настоящая работа человека.
    const шапка = 'title: "Проба"\nslug: /help/foo\nunlisted: true';
    const поля = показанныеПоля(parseFrontmatter(шапка, DOCS, КОРНИ), порядок);
    expect(buildFrontmatter(шапка, поля, DOCS, КОРНИ, порядок)).toBe(шапка);
  });

  it('поле обложки показывается там же, куда строка ляжет в файл', () => {
    // Шапка написана не в принятом порядке. Считай окно место по-своему — после сохранения поле
    // прыгнуло бы на другую строку, и человек увидел бы не то, что записал.
    const шапка = 'title: "Проба"\ndescription: "О чём"\nsidebar_position: 3\nslug: /help/foo';
    const поля = показанныеПоля(parseFrontmatter(шапка, DOCS, КОРНИ), порядок);
    const место = поля.findIndex((поле) => поле.key === 'image');

    const сОбложкой = поля.map((поле, i) => (i === место ? {...поле, display: './cover.png'} : поле));
    const собрано = buildFrontmatter(шапка, сОбложкой, DOCS, КОРНИ, порядок);
    const строки = собрано.split('\n').filter((line) => /^[A-Za-z_]/.test(line));

    // Место считается среди полей, у которых в файле есть своя строка: рядом с обложкой человеку
    // показываются пустые ключевые слова, которых в шапке нет, а пустыми они не пишутся.
    const свои = new Set(parseFrontmatter(шапка, DOCS, КОРНИ).map((поле) => поле.key));
    const вФайле = сОбложкой.filter((поле) => свои.has(поле.key) || String(поле.display ?? '').trim() !== '');

    expect(строки.findIndex((line) => line.startsWith('image:')))
      .toBe(вФайле.findIndex((поле) => поле.key === 'image'));
  });

  it('места поля в окне и в файле совпадают на всех статьях сайта без обложки', () => {
    for (const file of КОРНИ.flatMap((root) => walk(path.join(REPO, root['папка'])) as string[])) {
      const rel = path.relative(REPO, file).split(path.sep).join('/');
      const найдено = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(file, 'utf8'));
      if (!найдено) continue;

      const шапка = найдено[1];
      const свой = порядокПолей(НАСТРОЙКИ, rel);
      const поля = показанныеПоля(parseFrontmatter(шапка, rel, КОРНИ), свой);
      const место = поля.findIndex((поле) => поле.key === 'image');
      if (место < 0 || parseFrontmatter(шапка, rel, КОРНИ).some((поле) => поле.key === 'image')) continue;

      const сОбложкой = поля.map((поле, i) => (i === место ? {...поле, display: './cover.png'} : поле));
      const строки = buildFrontmatter(шапка, сОбложкой, rel, КОРНИ, свой).split('\n').filter((line) => /^[A-Za-z_]/.test(line));
      // Место считается среди полей, у которых в файле есть своя строка. Рядом с обложкой
      // человеку показываются пустые метки и ключевые слова, которых в шапке нет: пустыми они
      // не пишутся и строкой не становятся, поэтому номера строк с ними сравнивать не с чем.
      const свои = new Set(parseFrontmatter(шапка, rel, КОРНИ).map((поле) => поле.key));
      const вФайле = сОбложкой.filter((поле) => свои.has(поле.key) || String(поле.display ?? '').trim() !== '');

      expect(строки.findIndex((line) => line.startsWith('image:')), rel)
        .toBe(вФайле.findIndex((поле) => поле.key === 'image'));
    }
  });

  it('шапки всех настоящих статей сайта переживают открытие и сборку с показанным полем обложки', () => {
    // Тот же инвариант, но на всём корпусе: круговой прогон ловит то, чего не видно на примере.
    for (const file of КОРНИ.flatMap((root) => walk(path.join(REPO, root['папка'])) as string[])) {
      const rel = path.relative(REPO, file).split(path.sep).join('/');
      const найдено = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(file, 'utf8'));
      if (!найдено) continue;

      const шапка = найдено[1];
      const свой = порядокПолей(НАСТРОЙКИ, rel);
      const поля = показанныеПоля(parseFrontmatter(шапка, rel, КОРНИ), свой);
      expect(buildFrontmatter(шапка, поля, rel, КОРНИ, свой), rel).toBe(шапка.replace(/\r\n/g, '\n'));
    }
  });
});
