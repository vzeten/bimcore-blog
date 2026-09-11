// Имя каждого теста повторяет формулировку правила.
// Инструмент медиаподготовки зовёт настоящий `scripts/image-prep.py`: результат сверяется по свойствам
// алгоритма сайта — PNG, ширина не больше 1100 px при свободной высоте, палитра, узкое не растёт,
// WebP и PNG проходят преобразование всегда, даже если файл от этого тяжелеет.
import {describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {инструментыМедиа} from '../src/adapters/imagePrep.mjs';
import {медиаподготовка, размерыКартинки, родМедиа} from '../src/core/refineFiles.mjs';
import {типКартинки} from '../src/core/imageType.mjs';
import {GIF, НАСТРОЙКИ, копия} from './refineHarness.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const python = НАСТРОЙКИ['доработка']['команда']['python'];
const инструменты = () => инструментыМедиа({repo: REPO, settings: НАСТРОЙКИ});

/** Настоящая картинка средствами того же Pillow, которым работает скрипт сайта. */
function картинка(ширина, высота, формат, пёстрая = true) {
  const файл = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'editor-prep-')), `проба.${формат}`);
  execFileSync(python, ['-c', [
    'import sys; from PIL import Image, ImageDraw',
    `im = Image.new("RGB", (${ширина}, ${высота}), (200, 30, 30)); d = ImageDraw.Draw(im)`,
    пёстрая ? '[d.ellipse((i*7, i*5, i*7+60, i*5+60), fill=(i*3 % 255, 80, 255-i*2 % 255)) for i in range(60)]' : 'pass',
    'im.save(sys.argv[1])',
  ].join('\n'), файл]);
  return fs.readFileSync(файл);
}

describe('медиаподготовка через scripts/image-prep.py', () => {
  it('JPEG 1600×900 становится PNG 1100×619 с палитрой; папка стенда убирается', async () => {
    const [{байты}] = await инструменты().подготовить([{байты: картинка(1600, 900, 'jpg'), род: 'jpg'}]);
    expect(типКартинки(байты)).toBe('png');
    expect(размерыКартинки(байты, 'png')).toEqual({ширина: 1100, высота: 619});
    // Тип цвета 3 в IHDR — индексированная палитра: ровно то, что пишет скрипт.
    expect(байты[25]).toBe(3);
    expect(fs.readdirSync(path.join(REPO, 'editor', '.tmp')).filter((имя) => имя.startsWith('доработка-'))).toEqual([]);
  }, 60_000);

  it('WebP узнаётся по байтам и становится PNG по тому же рецепту; несколько файлов — одним запуском', async () => {
    const webp = картинка(1400, 700, 'webp');
    expect(родМедиа(webp)).toBe('webp');
    const итог = await инструменты().подготовить([{байты: webp, род: 'webp'}, {байты: картинка(300, 200, 'png'), род: 'png'}]);
    expect(размерыКартинки(итог[0].байты, 'png')).toEqual({ширина: 1100, высота: 550});
    // Меньшее не растёт.
    expect(размерыКартинки(итог[1].байты, 'png')).toEqual({ширина: 300, высота: 200});
  }, 60_000);

  it('вертикальные JPG, PNG и WebP шириной до 1100 px сохраняют размеры; высота уменьшению не повод', async () => {
    const итог = await инструменты().подготовить([
      {байты: картинка(1000, 1750, 'jpg'), род: 'jpg'},
      {байты: картинка(1000, 1750, 'png'), род: 'png'},
      {байты: картинка(1100, 2400, 'webp'), род: 'webp'},
    ]);
    expect(размерыКартинки(итог[0].байты, 'png')).toEqual({ширина: 1000, высота: 1750});
    expect(размерыКартинки(итог[1].байты, 'png')).toEqual({ширина: 1000, высота: 1750});
    expect(размерыКартинки(итог[2].байты, 'png')).toEqual({ширина: 1100, высота: 2400});
  }, 60_000);

  it('вертикальная схема в искусственной копии статьи после «Доработать» размеров не теряет', async () => {
    const схема = картинка(1000, 1750, 'jpg');
    const к = копия('---\ntitle: "A"\n---\n\n![](./схема.jpg)\n', {'схема.jpg': схема});
    const {копия: итог, отчёт} = await медиаподготовка.применить(к, медиаподготовка.анализ(к), инструменты());
    expect(размерыКартинки(итог.файлы.get('схема.png'), 'png')).toEqual({ширина: 1000, высота: 1750});
    expect(отчёт.изменено[0].стало).toContain('1000×1750');
  }, 60_000);

  it('PNG, ставший после скрипта тяжелее, всё равно заменяется результатом скрипта; GIF не читается', async () => {
    const малый = картинка(2, 2, 'png', false);
    const к = копия('---\ntitle: "A"\n---\n\n![](./a.png)\n\n![](./b.gif)\n', {'a.png': малый, 'b.gif': GIF});
    const {копия: итог} = await медиаподготовка.применить(к, медиаподготовка.анализ(к), инструменты());
    const результат = итог.файлы.get('a.png');
    expect(результат.length).toBeGreaterThan(малый.length);
    expect(размерыКартинки(результат, 'png')).toEqual({ширина: 2, высота: 2});
    expect(результат[25]).toBe(3);
    expect(итог.файлы.get('b.gif')).toBe(GIF);
  }, 60_000);
});
