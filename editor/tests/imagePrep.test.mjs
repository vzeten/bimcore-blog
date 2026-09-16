// Имя каждого теста повторяет формулировку правила.
// Инструмент медиаподготовки без библиотеки картинок: вся операция отказывает словами ДО первой
// записи, а не выдаёт нетронутые файлы за обработанные (дефект, найденный проверкой 2026-08-20).
//
// Библиотека здесь подменена пустым модулем — так выглядит оборванная установка программы.
import {describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

vi.mock('sharp', () => ({}));

const {инструментыМедиа} = await import('../src/adapters/imagePrep.mjs');
const {обработкаДоступна} = await import('../src/adapters/imageOptimize.mjs');

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

describe('медиаподготовка без библиотеки картинок', () => {
  it('пустой модуль библиотекой не считается', async () => {
    expect(await обработкаДоступна()).toBe(false);
  });

  it('есть что обрабатывать — отказ словами из настроек, а не молчаливый пропуск', async () => {
    const инструменты = инструментыМедиа({settings: НАСТРОЙКИ});
    await expect(инструменты.подготовить([{байты: Buffer.from([0xff, 0xd8, 0xff]), род: 'jpg'}]))
      .rejects.toMatchObject({status: 500, message: НАСТРОЙКИ['ошибкиСервера']['сжатиеНедоступно']});
  });

  it('обрабатывать нечего — отказа нет: пустой набор ничего не требует от библиотеки', async () => {
    expect(await инструментыМедиа({settings: НАСТРОЙКИ}).подготовить([])).toEqual([]);
  });
});
