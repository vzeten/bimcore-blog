// Имя каждого теста повторяет формулировку правила.
// Приём ролика WebM той же дорогой карантина: своя дверь (`род: видео`), свой предел веса,
// картинка и видео друг за друга не сходят ни при подготовке, ни при укладке.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {НАСТРОЙКИ, PNG, REL, вернуть, запрос, карантин, репозиторий, файлы} from './intakeHarness.mjs';
import {WEBM, webmВесом} from './webmFixture.mjs';

const МЕГАБАЙТ = 1024 * 1024;
const ПРЕДЕЛ = 10;

const С_ВИДЕО = {
  ...НАСТРОЙКИ,
  картинки: {...НАСТРОЙКИ.картинки, пределWebmМегабайт: ПРЕДЕЛ},
  ошибкиСервера: {
    ...НАСТРОЙКИ.ошибкиСервера,
    неверныйТипВидео: 'видео статьи может быть только файлом WebM',
    webmБольшеПредела: 'WebM больше {мегабайт} МБ. Уменьшите ролик заранее',
  },
};

const уложить = (repo, жетон) => запрос(repo, '/api/asset/place', {article: REL, жетон}, С_ВИДЕО);
const подготовить = (repo, bytes, род) =>
  запрос(repo, '/api/asset/prepare', {article: REL, base64: Buffer.from(bytes).toString('base64'), ...(род === undefined ? {} : {род})}, С_ВИДЕО);

describe('двери приёма: картинка и видео', () => {
  it('WebM дверью картинки отвергается словами о картинке и в карантин не попадает', async () => {
    const repo = репозиторий();
    const ответ = await подготовить(repo, WEBM);

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(С_ВИДЕО.ошибкиСервера.неверныйТипКартинки);
    expect(карантин(repo)).toEqual([]);
  });

  it('картинка дверью видео отвергается словами о видео', async () => {
    const repo = репозиторий();
    const ответ = await подготовить(repo, PNG, 'видео');

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(С_ВИДЕО.ошибкиСервера.неверныйТипВидео);
    expect(карантин(repo)).toEqual([]);
  });

  it('WebM дверью видео едет в карантин под жетоном .webm и ложится рядом со статьёй под свободным именем', async () => {
    const repo = репозиторий();
    const готово = await подготовить(repo, WEBM, 'видео');

    expect(готово.code).toBe(200);
    expect(готово.data.жетон).toMatch(/\.webm$/);
    expect(готово.data.тяжёлая).toBe(false);

    const уложено = await уложить(repo, готово.data.жетон);
    expect(уложено.code).toBe(200);
    expect(уложено.data.src).toBe('./img-01.webm');
    expect(файлы(repo)).toEqual(['img-01.webm', 'index.mdx']);
    expect(fs.readFileSync(path.join(repo, 'docs', 'a', 'img-01.webm')).equals(WEBM)).toBe(true);
    expect(карантин(repo)).toEqual([]);
  });

  it('подменённый в карантине ролик (картинка на месте .webm) при укладке отвергается', async () => {
    const repo = репозиторий();
    const готово = await подготовить(repo, WEBM, 'видео');
    fs.writeFileSync(path.join(repo, 'editor', '.tmp', готово.data.жетон), PNG);

    const уложено = await уложить(repo, готово.data.жетон);
    expect(уложено.code).toBe(400);
    expect(уложено.data.error).toBe(С_ВИДЕО.ошибкиСервера.неверныйТипВидео);
    expect(файлы(repo)).toEqual(['index.mdx']);
  });

  it('уложенный ролик забирается обратно, пока в статье на него нет ссылки', async () => {
    const repo = репозиторий();
    const готово = await подготовить(repo, WEBM, 'видео');
    const уложено = await уложить(repo, готово.data.жетон);

    const назад = await вернуть(repo, уложено.data.src, REL);
    expect(назад.code).toBe(200);
    expect(файлы(repo)).toEqual(['index.mdx']);
    expect(карантин(repo).some((имя) => имя.endsWith('img-01.webm'))).toBe(true);
  });
});

describe('предел веса ролика', () => {
  it('WebM ровно в предел принимается', async () => {
    const repo = репозиторий();
    const ответ = await подготовить(repo, webmВесом(ПРЕДЕЛ * МЕГАБАЙТ), 'видео');

    expect(ответ.code).toBe(200);
    expect(ответ.data.тяжёлая).toBe(false);
  });

  it('WebM на байт тяжелее предела отвергается с числом предела в словах и не касается диска', async () => {
    const repo = репозиторий();
    const ответ = await подготовить(repo, webmВесом(ПРЕДЕЛ * МЕГАБАЙТ + 1), 'видео');

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(`WebM больше ${ПРЕДЕЛ} МБ. Уменьшите ролик заранее`);
    expect(карантин(repo)).toEqual([]);
  });

  it('предел GIF ролика не касается: шесть мегабайт WebM проходят', async () => {
    const repo = репозиторий();
    const ответ = await подготовить(repo, webmВесом(6 * МЕГАБАЙТ), 'видео');

    expect(ответ.code).toBe(200);
  });
});
