// Имя каждого теста повторяет формулировку правила.
// Оригиналы доработки: исходные файлы и текст статьи ложатся в хранилище редактора ДО записи и
// сверяются; рядом манифест операции. Не легли — записи быть не должно.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {записатьОтпечатокПосле, папкаОперации, сохранитьОригиналы} from '../src/adapters/refineOriginals.mjs';
import {НАСТРОЙКИ, RU, jpg, png} from './refineHarness.mjs';

const песочницы = [];
afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

const КОГДА = '2026-09-16T12:00:00.000Z';
const ТЕКСТ = Buffer.from('---\ntitle: "Проба"\n---\n\n![a](./img/photo.jpg)\n', 'utf8');

function среда() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-originals-'));
  песочницы.push(repo);
  return repo;
}

const снимок = () => ({байтыТекста: ТЕКСТ, файлы: new Map([['img/photo.jpg', jpg(20, 10)]])});

describe('оригиналы доработки', () => {
  it('текст и заменяемые файлы ложатся побайтно, манифест называет было и стало', () => {
    const repo = среда();
    const изменения = {текст: 'новый', файлы: [{имя: 'img/photo.jpg', байты: null}, {имя: 'img/photo.png', байты: png(20, 10)}]};
    const папка = сохранитьОригиналы({repo, settings: НАСТРОЙКИ, rel: RU, снимок: снимок(), изменения, когда: КОГДА});

    expect(папка).toBe(папкаОперации({repo, settings: НАСТРОЙКИ, rel: RU, когда: КОГДА}));
    expect(папка.startsWith(path.join(repo, 'editor', НАСТРОЙКИ['хранение']['папкаОригиналов']))).toBe(true);
    expect(fs.readFileSync(path.join(папка, 'article.mdx'))).toEqual(ТЕКСТ);
    expect(fs.readFileSync(path.join(папка, 'files', 'img', 'photo.jpg'))).toEqual(jpg(20, 10));
    // У нового файла прежних байтов нет — и сохранять нечего.
    expect(fs.existsSync(path.join(папка, 'files', 'img', 'photo.png'))).toBe(false);

    const манифест = JSON.parse(fs.readFileSync(path.join(папка, 'manifest.json'), 'utf8'));
    expect(манифест.статья).toBe(RU);
    expect(манифест.было.map((з) => з.имя)).toEqual(['img/photo.jpg']);
    expect(манифест.стало).toEqual([
      {имя: 'img/photo.jpg', отпечаток: null},
      {имя: 'img/photo.png', отпечаток: expect.stringMatching(/^[0-9a-f]{40}$/)},
    ]);
    expect(манифест.отпечатокПосле).toBeNull();

    записатьОтпечатокПосле({папка, отпечаток: 'после'});
    expect(JSON.parse(fs.readFileSync(path.join(папка, 'manifest.json'), 'utf8')).отпечатокПосле).toBe('после');
  });

  it('положить оригинал некуда — бросает, чтобы операция не записала ни одного файла', () => {
    const repo = среда();
    // На месте папки оригиналов лежит файл: создать внутри неё ничего нельзя.
    fs.mkdirSync(path.join(repo, 'editor'), {recursive: true});
    fs.writeFileSync(path.join(repo, 'editor', НАСТРОЙКИ['хранение']['папкаОригиналов']), 'не папка');
    const изменения = {текст: null, файлы: [{имя: 'img/photo.jpg', байты: png(1, 1)}]};

    expect(() => сохранитьОригиналы({repo, settings: НАСТРОЙКИ, rel: RU, снимок: снимок(), изменения, когда: КОГДА})).toThrow();
  });
});
