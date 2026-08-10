// Имя каждого теста повторяет формулировку правила.
// Шапка режется на куски: поле и все строки, которые ему принадлежат. Правило появилось потому,
// что построчный разбор врал про двенадцать живых статей блога, где список записан строками.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {headGroups, headLines, значениеГруппы} from '../src/core/articleFile.mjs';
import {walk} from '../src/adapters/library.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(EDITOR, '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
const КОРНИ = НАСТРОЙКИ['контент'];

const ключи = (raw) => headGroups(raw).map((группа) => группа.ключ);

describe('шапка режется на куски по полям, а не по строкам', () => {
  it('список, записанный строками, принадлежит своему полю целиком', () => {
    const шапка = 'title: "Проба"\nkeywords:\n  - первое слово\n  - второе слово\nimage: ./cover.png';
    const группы = headGroups(шапка);

    expect(ключи(шапка)).toEqual(['title', 'keywords', 'image']);
    expect(группы[1].строки).toHaveLength(3);
  });

  it('элемент списка без отступа тоже принадлежит своему полю', () => {
    // YAML разрешает элементы последовательности на одном уровне с ключом. В корпусе таких нет,
    // но защита дешёвая, а без неё строки осиротеют ровно так же.
    expect(ключи('keywords:\n- слово\ntitle: "Проба"')).toEqual(['keywords', 'title']);
  });

  it('строка с отступом принадлежит полю выше, а не заводит своё', () => {
    expect(ключи('description: длинное\n  продолжение строки\ntitle: "Проба"'))
      .toEqual(['description', 'title']);
  });

  it('пустая строка в конце шапки своему полю не принадлежит', () => {
    // Иначе переписанное поле утащило бы разделитель с собой, и шапка склеилась бы.
    const группы = headGroups('title: "Проба"\nkeywords:\n  - слово\n');

    expect(группы.map((группа) => группа.строки)).toEqual([['title: "Проба"'], ['keywords:', '  - слово'], ['']]);
  });

  it('куски — это те же строки шапки, ни одна не потеряна и ни одна не переставлена', () => {
    // Сравнение идёт со списком строк, а не с исходным текстом: вид перевода строки снимает ещё
    // разбор на строки, и это правило старше кусков (`headLines`, SPEC 3.6).
    for (const шапка of [
      'title: "Проба"\nkeywords:\n  - слово\nimage: ./cover.png',
      'title: "Проба"\r\nkeywords:\r\n  - слово',
      '\ntitle: "Проба"\n\nslug: foo\n',
      '',
    ]) {
      expect(headGroups(шапка).flatMap((группа) => группа.строки)).toEqual(headLines(шапка));
    }
  });

  it('шапки всех статей сайта разбираются на куски и собираются обратно без потери строки', () => {
    for (const file of КОРНИ.flatMap((root) => walk(path.join(REPO, root['папка'])))) {
      const найдено = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(file, 'utf8'));
      if (!найдено) continue;

      const шапка = найдено[1];
      expect(headGroups(шапка).flatMap((группа) => группа.строки), file).toEqual(headLines(шапка));
    }
  });
});

describe('значение поля читает YAML, а не своя нарезка по запятым', () => {
  it('список, записанный строками, читается своими элементами, а не пустотой', () => {
    const группа = headGroups('keywords:\n  - revit families\n  - интерьер')[0];

    expect(значениеГруппы(группа)).toEqual({ok: true, значение: ['revit families', 'интерьер']});
  });

  it('список в квадратных скобках читается теми же элементами', () => {
    const группа = headGroups('tags: [revit, "интерьер"]')[0];

    expect(значениеГруппы(группа).значение).toEqual(['revit', 'интерьер']);
  });

  it('битое значение не роняет разбор, а честно отвечает «прочитать не удалось»', () => {
    const группа = headGroups('keywords: [не закрытая скобка')[0];

    expect(значениеГруппы(группа)).toEqual({ok: false, значение: null});
  });

  it('битое значение остаётся битым и на второе чтение, а не превращается в пустое поле', () => {
    // Сторож против кэша разбора. Прежняя обёртка (`gray-matter`) клала запись в свой кэш ДО
    // разбора, поэтому у битого значения второе чтение возвращало пустоту вместо ошибки — а пустое
    // поле программа считает себя вправе переписать и стёрла бы непонятое значение в чужой статье.
    const группа = headGroups('keywords: [снова не закрытая скобка')[0];

    expect(значениеГруппы(группа)).toEqual({ok: false, значение: null});
    expect(значениеГруппы(группа)).toEqual({ok: false, значение: null});
  });

  it('битое значение одного поля не мешает прочитать соседние', () => {
    const группы = headGroups('title: "Проба"\nkeywords: [не закрыто\nimage: ./cover.png');

    expect(значениеГруппы(группы[0])).toEqual({ok: true, значение: 'Проба'});
    expect(значениеГруппы(группы[1]).ok).toBe(false);
    expect(значениеГруппы(группы[2])).toEqual({ok: true, значение: './cover.png'});
  });

  it('ключ без значения и без элементов читается пустотой', () => {
    expect(значениеГруппы(headGroups('keywords:')[0]).значение).toBe(null);
  });
});
