// Имя каждого теста повторяет формулировку правила.
// Запись набора «Доработать»: либо целиком, либо на диске ни байта не меняется.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {записатьНабор} from '../src/adapters/refineWrite.mjs';
import {НАСТРОЙКИ, RU, jpg, png, репозиторий, снимокДиска} from './refineHarness.mjs';

const ТЕКСТ = '---\ntitle: "A"\n---\n\n![](./a.jpg)\n';
const ошибки = НАСТРОЙКИ['ошибкиСервера'];

function среда() {
  const {repo} = репозиторий({[RU]: ТЕКСТ, [path.posix.join(path.posix.dirname(RU), 'a.jpg')]: jpg(2, 2)});
  const dir = path.join(repo, path.dirname(RU));
  const снимок = {байтыТекста: Buffer.from(ТЕКСТ, 'utf8'), файлы: new Map([['a.jpg', jpg(2, 2)]])};
  return {repo, dir, файлСтатьи: path.join(repo, RU), снимок};
}

describe('запись набора изменений', () => {
  it('новый файл, статья и удаление ложатся вместе, служебных хвостов не остаётся', () => {
    const {repo, dir, файлСтатьи, снимок} = среда();
    записатьНабор({repo, dir, файлСтатьи, снимок, ошибки, изменения: {
      текст: ТЕКСТ.replace('a.jpg', 'a.png'),
      файлы: [{имя: 'a.png', байты: png(2, 2)}, {имя: 'a.jpg', байты: null}],
    }});

    expect(fs.readFileSync(файлСтатьи, 'utf8')).toBe(ТЕКСТ.replace('a.jpg', 'a.png'));
    expect(fs.existsSync(path.join(dir, 'a.jpg'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'a.png'))).toEqual(png(2, 2));
    expect(fs.readdirSync(path.join(repo, 'editor', '.tmp'))).toEqual([]);
  });

  it('сбой на удалении откатывает статью и новые файлы: диск побайтово прежний', () => {
    const {repo, dir, файлСтатьи, снимок} = среда();
    const до = снимокДиска(repo);

    expect(() => записатьНабор({repo, dir, файлСтатьи, снимок, ошибки, изменения: {
      текст: 'новый текст',
      файлы: [{имя: 'a.png', байты: png(2, 2)}, {имя: 'a.jpg', байты: null}, {имя: 'нет-такого.jpg', байты: null}],
    }})).toThrow();

    expect(снимокДиска(repo)).toBe(до);
  });

  it('имя, занятое файлом, которого не было в снимке, — отказ 409 до единой правки статьи', () => {
    const {repo, dir, файлСтатьи, снимок} = среда();
    fs.writeFileSync(path.join(dir, 'a.png'), 'чужой');
    const до = снимокДиска(repo);

    expect(() => записатьНабор({repo, dir, файлСтатьи, снимок, ошибки, изменения: {
      текст: 'новый текст', файлы: [{имя: 'a.png', байты: png(2, 2)}],
    }})).toThrow(ошибки['доработкаСнимокУстарел']);

    expect(снимокДиска(repo)).toBe(до);
  });

  it('перезапись существующего файла при сбое возвращает его прежние байты', () => {
    const {repo, dir, файлСтатьи, снимок} = среда();
    const до = снимокДиска(repo);

    expect(() => записатьНабор({repo, dir, файлСтатьи, снимок, ошибки, изменения: {
      текст: null, файлы: [{имя: 'a.jpg', байты: jpg(9, 9)}, {имя: 'нет-такого.jpg', байты: null}],
    }})).toThrow();

    expect(снимокДиска(repo)).toBe(до);
  });
});
