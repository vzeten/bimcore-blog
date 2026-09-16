// Имя каждого теста повторяет формулировку правила.
// Конвертер картинок на настоящих картинках и настоящей библиотеке: формат, ширина, прозрачность,
// порог выигрыша и повтор. Числа в названиях — не «примерно»: вес до и после печатается в отчёт.
import {describe, expect, it} from 'vitest';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {подготовитьКартинку} from '../src/adapters/imageOptimize.mjs';
import {типКартинки} from '../src/core/imageType.mjs';
import {jpg, png, размеры, фото} from './imageFixtures.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

const обработать = (bytes, род = типКартинки(bytes)) => подготовитьКартинку({bytes, род, settings: НАСТРОЙКИ});

/**
 * Плоская картинка вроде снимка экрана: крупные ровные области нескольких цветов и чёткие границы.
 * Сохраняется JPEG высокого качества — так снимки экрана часто и приходят, и весят они при этом много.
 */
async function плоская({ширина = 1000, высота = 900} = {}) {
  const данные = Buffer.alloc(ширина * высота * 3);
  const цвета = [[245, 245, 245], [30, 90, 200], [220, 60, 50], [40, 40, 40]];
  for (let y = 0; y < высота; y += 1) {
    for (let x = 0; x < ширина; x += 1) {
      const [r, g, b] = цвета[(Math.floor(x / 125) + Math.floor(y / 90)) % цвета.length];
      const п = (y * ширина + x) * 3;
      данные[п] = r;
      данные[п + 1] = g;
      данные[п + 2] = b;
    }
  }
  return sharp(данные, {raw: {width: ширина, height: высота, channels: 3}})
    .jpeg({quality: 100, chromaSubsampling: '4:4:4'})
    .toBuffer();
}

const вес = (итог) => `было ${итог.было} КБ → ${итог.итог === 'заменить' ? `${итог.род} ${итог.стало} КБ` : итог.итог}`;

// Кодировщик настоящий, поэтому проверки медленнее обычных.
describe('конвертер картинок', {timeout: 60000}, () => {
  it('фотография в PNG становится JPEG: так легче в разы', async () => {
    const итог = await обработать(await фото());
    console.log('фото PNG:', вес(итог));
    expect(итог.итог).toBe('заменить');
    expect(итог.род).toBe('jpg');
    expect(типКартинки(итог.байты)).toBe('jpg');
    expect(итог.стало).toBeLessThan(итог.было);
  });

  it('плоский снимок экрана в тяжёлом JPEG становится PNG с палитрой', async () => {
    const итог = await обработать(await плоская());
    console.log('плоский JPEG:', вес(итог));
    expect(итог.итог).toBe('заменить');
    expect(итог.род).toBe('png');
    expect(итог.стало).toBeLessThan(итог.было);
  });

  it('фото, заранее сведённое к 256 цветам, всё равно становится JPEG, если так заметно легче', async () => {
    // Случай, на котором споткнулась прежняя попытка ED-051: по байтам такой PNG неотличим от снимка
    // экрана. Конвертер ничего не угадывает — он сравнивает вес готовых представлений.
    const сведённое = await sharp(await фото()).png({palette: true, quality: 92, effort: 7, dither: 0.8}).toBuffer();
    const итог = await обработать(сведённое);
    console.log('фото PNG256:', вес(итог));
    expect(итог.итог).toBe('заменить');
    expect(итог.род).toBe('jpg');
  });

  it('прозрачная картинка никогда не становится JPEG: он не хранит прозрачность', async () => {
    const итог = await обработать(await фото({альфа: 0}));
    console.log('прозрачное фото:', вес(итог));
    expect(итог.итог === 'оставить' ? итог.лучшийРод : итог.род).toBe('png');
  });

  it('канал прозрачности без прозрачных точек (так сохраняет Figma) JPEG не запрещает', async () => {
    const итог = await обработать(await фото({альфа: 255}));
    expect(итог.итог).toBe('заменить');
    expect(итог.род).toBe('jpg');
  });

  it('картинка шире страницы приводится к 1100 px, высота остаётся пропорциональной', async () => {
    const итог = await обработать(await png({ширина: 1530, высота: 2000, шум: true}));
    expect(итог.итог).toBe('заменить');
    expect(await размеры(итог.байты)).toEqual({ширина: 1100, высота: 1438});
  });

  it('узкая картинка не растягивается', async () => {
    const итог = await обработать(await фото({ширина: 300, высота: 200}));
    if (итог.итог === 'заменить') expect(await размеры(итог.байты)).toEqual({ширина: 300, высота: 200});
  });

  it('повтор ничего не меняет: результат обработки второй раз не проходит порог выигрыша', async () => {
    for (const исходник of [await фото(), await плоская()]) {
      const первый = await обработать(исходник);
      expect(первый.итог).toBe('заменить');
      const второй = await обработать(первый.байты);
      console.log('повтор:', вес(второй));
      expect(второй.итог).toBe('оставить');
      expect(второй.причина).toBe('выигрышМал');
    }
  });

  it('WebP приводится к PNG или JPEG всегда: на сайте его не бывает, порог к нему не применяется', async () => {
    const webp = await sharp(await фото({ширина: 400, высота: 300})).webp({quality: 80}).toBuffer();
    const итог = await обработать(webp, 'webp');
    expect(итог.итог).toBe('заменить');
    expect(['png', 'jpg']).toContain(итог.род);
  });

  it('анимированный WebP остаётся как был: декодер оставил бы от него один кадр', async () => {
    const ширина = 200;
    const кадр = 150;
    const пиксели = Buffer.alloc(ширина * кадр * 2 * 3);
    for (let i = 0; i < пиксели.length; i += 1) пиксели[i] = (i * 7) % 251;
    const анимированный = await sharp(пиксели, {raw: {width: ширина, height: кадр * 2, channels: 3, pageHeight: кадр}})
      .webp({quality: 80})
      .toBuffer();
    expect((await sharp(анимированный).metadata()).pages).toBe(2);
    expect(await обработать(анимированный, 'webp')).toEqual({итог: 'оставить', причина: 'анимация'});
  });

  it('узкая лёгкая картинка без заметного выигрыша остаётся как была, с весом было и лучшего варианта', async () => {
    const маленькая = await jpg({ширина: 60, высота: 40, качество: 80});
    const итог = await обработать(маленькая);
    expect(итог).toMatchObject({итог: 'оставить', причина: 'выигрышМал'});
    expect(typeof итог.было).toBe('number');
    expect(typeof итог.лучший).toBe('number');
  });

  it('повреждённый файл — отказ этой картинке, а не падение операции', async () => {
    const целый = await jpg({ширина: 200, высота: 100, шум: true});
    const битый = Buffer.concat([целый.subarray(0, 40), Buffer.alloc(200, 0x11), Buffer.from([0xff, 0xd9])]);
    expect(await обработать(битый, 'jpg')).toEqual({итог: 'отказ', причина: 'картинкаНеОбработалась'});
  });
});
