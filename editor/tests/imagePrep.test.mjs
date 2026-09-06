// Имя каждого теста повторяет формулировку правила.
// Инструмент медиаподготовки зовёт настоящий `scripts/image-prep.py`: результат сверяется по свойствам
// алгоритма сайта — PNG, длинная сторона не больше 1000 px, палитра, меньшее не растёт.
import {describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {инструментыМедиа} from '../src/adapters/imagePrep.mjs';
import {размерыКартинки} from '../src/core/refineFiles.mjs';
import {типКартинки} from '../src/core/imageType.mjs';
import {НАСТРОЙКИ} from './refineHarness.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const python = НАСТРОЙКИ['доработка']['команда']['python'];

/** Настоящая картинка средствами того же Pillow, которым работает скрипт сайта. */
function картинка(ширина, высота, формат) {
  const файл = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'editor-prep-')), `проба.${формат}`);
  execFileSync(python, ['-c', [
    'import sys; from PIL import Image, ImageDraw',
    `im = Image.new("RGB", (${ширина}, ${высота}), (200, 30, 30)); d = ImageDraw.Draw(im)`,
    `[d.ellipse((i*7, i*5, i*7+60, i*5+60), fill=(i*3 % 255, 80, 255-i*2 % 255)) for i in range(60)]`,
    `im.save(sys.argv[1])`,
  ].join('\n'), файл]);
  return fs.readFileSync(файл);
}

describe('медиаподготовка через scripts/image-prep.py', () => {
  it('JPEG 1600×900 становится PNG 1000×563 с палитрой; папка стенда убирается', async () => {
    const было = картинка(1600, 900, 'jpg');
    const [{байты}] = await инструментыМедиа({repo: REPO, settings: НАСТРОЙКИ}).подготовить([{байты: было, род: 'jpg'}]);

    expect(типКартинки(байты)).toBe('png');
    expect(размерыКартинки(байты, 'png')).toEqual({ширина: 1000, высота: 563});
    // Тип цвета 3 в IHDR — индексированная палитра: ровно то, что пишет скрипт.
    expect(байты[25]).toBe(3);
    expect(fs.readdirSync(path.join(REPO, 'editor', '.tmp')).filter((имя) => имя.startsWith('доработка-'))).toEqual([]);
  });

  it('меньшее изображение не увеличивается, несколько файлов готовятся одним запуском', async () => {
    const малое = картинка(300, 200, 'png');
    const итог = await инструментыМедиа({repo: REPO, settings: НАСТРОЙКИ}).подготовить([{байты: малое, род: 'png'}, {байты: картинка(1200, 1200, 'jpg'), род: 'jpg'}]);

    expect(размерыКартинки(итог[0].байты, 'png')).toEqual({ширина: 300, высота: 200});
    expect(размерыКартинки(итог[1].байты, 'png')).toEqual({ширина: 1000, высота: 1000});
  });
});
