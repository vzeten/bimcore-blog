// Имя каждого теста повторяет формулировку правила.
// Какие картинки чем заменяются: JPG, PNG и GIF взаимозаменяемы во всех направлениях.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {НАСТРОЙКИ, REL, УЗЕЛ, БАЙТЫ, JPEG, сменить, репозиторий, файл} from './reformatHarness.mjs';

describe('смена формата картинки — какие форматы', () => {
  it('занятое имя не отказывает: программа берёт следующее свободное у каждого рода картинки', async () => {
    // Слово владельца 2026-08-18: столкновение имён решает программа, а не человек.
    // Чужой файл при этом остаётся неприкосновенным — проверяется для всех трёх расширений.
    for (const в of ['jpg', 'png', 'gif']) {
      const узел = в === 'jpg' ? '![Подпись](./img-01.png)' : УЗЕЛ;
      const из = в === 'jpg' ? 'png' : 'jpg';
      const repo = репозиторий(`---
title: A
---

${узел}

хвост
`);
      if (из !== 'jpg') {
        fs.rmSync(файл(repo, 'img-01.jpg'));
        fs.writeFileSync(файл(repo, `img-01.${из}`), БАЙТЫ[из]);
      }
      fs.writeFileSync(файл(repo, `img-01.${в}`), Buffer.from('чужие байты'));

      const ответ = await сменить(repo, {src: `./img-01.${из}`, узел, base64: БАЙТЫ[в].toString('base64')});

      expect(ответ.code, `цель ${в}`).toBe(200);
      expect(ответ.data.новыйSrc).toBe(`./img-02.${в}`);
      // Занявший имя файл не тронут, новый лёг под свободным именем, ссылка ведёт на него.
      expect(fs.readFileSync(файл(repo, `img-01.${в}`)).toString()).toBe('чужие байты');
      expect(fs.readFileSync(файл(repo, `img-02.${в}`)).equals(БАЙТЫ[в])).toBe(true);
      expect(fs.readFileSync(path.join(repo, REL), 'utf8')).toContain(`](./img-02.${в})`);
      expect(fs.existsSync(файл(repo, `img-01.${из}`))).toBe(false);
    }
  });

  it('новое имя занято обложкой — берётся следующее свободное, обложка не меняется', async () => {
    // Ровно случай владельца: обложка `image: ./img-01.jpg`, картинка тела `./img-01.png`.
    const узел = '![Подпись](./img-01.png)';
    const repo = репозиторий(`---
title: A
image: ./img-01.jpg
---

${узел}

хвост
`);
    fs.writeFileSync(файл(repo, 'img-01.png'), БАЙТЫ.png);
    const обложкаБыла = fs.readFileSync(файл(repo, 'img-01.jpg'));

    const ответ = await сменить(repo, {src: './img-01.png', узел, base64: JPEG.toString('base64')});

    expect(ответ.code).toBe(200);
    expect(ответ.data.новыйSrc).toBe('./img-02.jpg');
    const текст = fs.readFileSync(path.join(repo, REL), 'utf8');
    // Обновилась ровно ссылка выбранной картинки тела; строка обложки осталась прежней.
    expect(текст).toContain('](./img-02.jpg)');
    expect(текст).toContain('image: ./img-01.jpg');
    expect(fs.readFileSync(файл(repo, 'img-01.jpg')).equals(обложкаБыла)).toBe(true);
    // Прежний файл тела больше нигде не нужен и уходит; новый лёг ровно выбранными байтами.
    expect(fs.existsSync(файл(repo, 'img-01.png'))).toBe(false);
    expect(fs.readFileSync(файл(repo, 'img-02.jpg')).equals(JPEG)).toBe(true);
  });

  it('свободное имя ищется после самого большого занятого номера, а не в дырах', async () => {
    const узел = '![Подпись](./img-01.png)';
    const repo = репозиторий(`---
title: A
---

${узел}

хвост
`);
    fs.writeFileSync(файл(repo, 'img-01.png'), БАЙТЫ.png);
    // Имя-цель занято, дыра на втором номере есть, но её не переиспользуют: номер из дыры мог
    // стоять в ссылке уже опубликованной статьи.
    fs.writeFileSync(файл(repo, 'img-05.gif'), Buffer.from('чужие байты'));

    const ответ = await сменить(repo, {src: './img-01.png', узел, base64: JPEG.toString('base64')});

    expect(ответ.data.новыйSrc).toBe('./img-06.jpg');
  });

  it('прежняя основа имени сохраняется, когда новое имя свободно', async () => {
    const узел = '![Подпись](./схема-стен.png)';
    const repo = репозиторий(`---
title: A
---

${узел}

хвост
`);
    fs.writeFileSync(файл(repo, 'схема-стен.png'), БАЙТЫ.png);

    const ответ = await сменить(repo, {src: './схема-стен.png', узел, base64: JPEG.toString('base64')});

    expect(ответ.data.новыйSrc).toBe('./схема-стен.jpg');
  });

  it('картинка формата, которого программа не знает, сменой формата не трогается', async () => {
    const узел = '![Подпись](./схема.webp)';
    const repo = репозиторий(`---
title: A
---

${узел}

хвост
`);
    fs.writeFileSync(файл(repo, 'схема.webp'), Buffer.from('RIFFxxxxWEBPVP8 ', 'binary'));

    const ответ = await сменить(repo, {src: './схема.webp', узел});

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.заменаТолькоКартинок);
    expect(fs.existsSync(файл(repo, 'схема.png'))).toBe(false);
  });

  it('замена идёт между любыми картинками статьи: шесть переходов со сменой формата', async () => {
    // Решение владельца 2026-08-18: JPG, PNG и GIF взаимозаменяемы во всех направлениях.
    for (const из of ['jpg', 'png', 'gif']) {
      for (const в of ['jpg', 'png', 'gif']) {
        if (из === в) continue;

        const узел = `![Подпись](./img-01.${из})`;
        const repo = репозиторий(`---
title: A
---

${узел}

хвост
`);
        fs.rmSync(файл(repo, 'img-01.jpg'));
        fs.writeFileSync(файл(repo, `img-01.${из}`), БАЙТЫ[из]);

        const ответ = await сменить(repo, {src: `./img-01.${из}`, узел, base64: БАЙТЫ[в].toString('base64')});

        expect(ответ.code, `${из} → ${в}`).toBe(200);
        expect(ответ.data.новыйSrc).toBe(`./img-01.${в}`);
        // Байты нового файла — ровно выбранные: программа не преобразует и не сжимает картинку.
        expect(fs.readFileSync(файл(repo, `img-01.${в}`)).equals(БАЙТЫ[в])).toBe(true);
        expect(fs.existsSync(файл(repo, `img-01.${из}`))).toBe(false);
        // Alt и место картинки в тексте сохраняются, меняется только адрес.
        expect(fs.readFileSync(path.join(repo, REL), 'utf8'))
          .toBe(`---
title: A
---

![Подпись](./img-01.${в})

хвост
`);
      }
    }
  });

  it('байты того же формата, что и цель, — это не смена формата, а неверный запрос', async () => {
    const repo = репозиторий();
    const ответ = await сменить(repo, {base64: JPEG.toString('base64')});

    expect(ответ.code).toBe(400);
  });

  it('байты не картинки сменой формата не принимаются', async () => {
    const repo = репозиторий();
    const ответ = await сменить(repo, {base64: Buffer.from('просто текст').toString('base64')});

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.заменаТолькоКартинок);
  });

  it('папка под желаемым именем — тоже занятый адрес, а не место для картинки', async () => {
    const repo = репозиторий();
    fs.mkdirSync(файл(repo, 'img-01.png'));

    const ответ = await сменить(repo);

    expect(ответ.code).toBe(200);
    expect(ответ.data.новыйSrc).toBe('./img-02.png');
    // Папка цела и осталась папкой.
    expect(fs.lstatSync(файл(repo, 'img-01.png')).isDirectory()).toBe(true);
  });

  it('непригодный шаблон имени не мешает, пока свободно желаемое имя', async () => {
    const repo = репозиторий();
    const испорченные = {...НАСТРОЙКИ, картинки: {...НАСТРОЙКИ.картинки, шаблонИмени: 'картинка'}};

    const ответ = await сменить(repo, {}, испорченные);

    expect(ответ.code).toBe(200);
    expect(ответ.data.новыйSrc).toBe('./img-01.png');
  });

  it('занято желаемое имя и непригоден шаблон — чистый отказ без правки статьи и файлов', async () => {
    const repo = репозиторий();
    fs.writeFileSync(файл(repo, 'img-01.png'), Buffer.from('чужие байты'));
    const испорченные = {...НАСТРОЙКИ, картинки: {...НАСТРОЙКИ.картинки, шаблонИмени: 'картинка'}};

    const ответ = await сменить(repo, {}, испорченные);

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.имяНеПодобрано);
    expect(fs.readFileSync(файл(repo, 'img-01.png')).toString()).toBe('чужие байты');
    expect(fs.readFileSync(path.join(repo, REL), 'utf8')).toContain('](./img-01.jpg)');
    expect(fs.existsSync(файл(repo, 'img-01.jpg'))).toBe(true);
  });

  it('сбой записи статьи убирает уже созданную картинку', async () => {
    // Половины операции не остаётся: либо новый файл и новая ссылка, либо прежнее состояние.
    const repo = репозиторий();
    fs.chmodSync(path.join(repo, REL), 0o444);

    let ответ;
    try {
      ответ = await сменить(repo);
    } catch {
      ответ = {code: 500};
    } finally {
      fs.chmodSync(path.join(repo, REL), 0o666);
    }

    if (ответ.code === 200) return; // запись прошла: система разрешает писать поверх, случай не воспроизводится
    expect(fs.existsSync(файл(repo, 'img-01.png'))).toBe(false);
    expect(fs.readFileSync(path.join(repo, REL), 'utf8')).toContain('](./img-01.jpg)');
  });
});
