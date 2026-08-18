// Имя каждого теста повторяет формулировку правила.
// Укладка новой картинки рядом со статьёй: первое свободное имя, чужие файлы не трогаются.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {НАСТРОЙКИ, GIF, JPEG, PNG, REL, вернуть, вставить, карантин, подготовить, репозиторий, уложить, файлы} from './intakeHarness.mjs';

describe('укладка новой картинки рядом со статьёй', () => {
  it('PNG ложится в папку статьи под первым свободным именем', async () => {
    const repo = репозиторий();
    const ответ = await вставить(repo, PNG);

    expect(ответ.code).toBe(200);
    expect(ответ.data.src).toBe('./img-01.png');
    expect(файлы(repo)).toEqual(['img-01.png', 'index.mdx']);
  });

  it('GIF принимается и остаётся GIF: формат не преобразуется', async () => {
    const repo = репозиторий();
    const ответ = await вставить(repo, GIF);

    expect(ответ.data.src).toBe('./img-01.gif');
    expect(fs.readFileSync(path.join(repo, 'docs', 'a', 'img-01.gif'))).toEqual(GIF);
  });

  it('расширение решают байты, а не тип от браузера и не имя файла', async () => {
    const repo = репозиторий();
    const ответ = await вставить(repo, JPEG);

    expect(ответ.data.src).toBe('./img-01.jpg');
  });

  it('существующие картинки не перенумеровываются: берётся следующий свободный номер', async () => {
    const repo = репозиторий();
    fs.writeFileSync(path.join(repo, 'docs', 'a', 'img-01.png'), PNG);
    fs.writeFileSync(path.join(repo, 'docs', 'a', 'img-03.jpg'), JPEG);

    const ответ = await вставить(repo, PNG);

    expect(ответ.data.src).toBe('./img-04.png');
    expect(файлы(repo)).toEqual(['img-01.png', 'img-03.jpg', 'img-04.png', 'index.mdx']);
  });

  it('номер занят при любом расширении: рядом с img-01.jpg не появляется img-01.png', async () => {
    const repo = репозиторий();
    fs.writeFileSync(path.join(repo, 'docs', 'a', 'img-01.jpg'), JPEG);

    const ответ = await вставить(repo, PNG);

    expect(ответ.data.src).toBe('./img-02.png');
  });

  it('собственные имена картинок номера не занимают и не переименовываются', async () => {
    const repo = репозиторий();
    fs.writeFileSync(path.join(repo, 'docs', 'a', 'arcat.jpg'), JPEG);

    const ответ = await вставить(repo, PNG);

    expect(ответ.data.src).toBe('./img-01.png');
    expect(файлы(repo)).toEqual(['arcat.jpg', 'img-01.png', 'index.mdx']);
  });

  it('существующий файл под тем же именем молча не перезаписывается', async () => {
    // Имя занято файлом, которого в тексте нет: он всё равно чужая работа.
    const repo = репозиторий();
    fs.writeFileSync(path.join(repo, 'docs', 'a', 'img-01.png'), Buffer.from('чужое', 'utf8'));

    const ответ = await вставить(repo, PNG);

    expect(ответ.data.src).toBe('./img-02.png');
    expect(fs.readFileSync(path.join(repo, 'docs', 'a', 'img-01.png'), 'utf8')).toBe('чужое');
  });

  it('две вставки разом получают разные имена, а не затирают друг друга', async () => {
    const repo = репозиторий();
    const первая = await подготовить(repo, PNG);
    const вторая = await подготовить(repo, JPEG);

    const [а, б] = await Promise.all([
      уложить(repo, первая.data.жетон),
      уложить(repo, вторая.data.жетон),
    ]);

    expect(а.data.src).not.toBe(б.data.src);
    expect(файлы(repo)).toEqual(['img-01.png', 'img-02.jpg', 'index.mdx'].sort());
  });

  it('повторная укладка по тому же жетону второй картинки не делает', async () => {
    const repo = репозиторий();
    const готово = await подготовить(repo, PNG);
    await уложить(repo, готово.data.жетон);

    const второй = await уложить(repo, готово.data.жетон);

    expect(второй.code).toBe(404);
    expect(файлы(repo)).toEqual(['img-01.png', 'index.mdx']);
  });

  it('файл попадает только в папку открытой статьи, соседняя не меняется', async () => {
    const repo = репозиторий();
    await вставить(repo, PNG);

    expect(файлы(repo, 'b')).toEqual(['index.mdx']);
  });

  it('уложенная картинка забирается обратно в карантин, если вставлять ссылку стало некуда', async () => {
    // Пока картинка ехала, человек ушёл в другую статью: ссылку дописывать некуда, и картинка
    // не должна остаться в папке статьи бесхозной — иначе она уедет в публикацию.
    const repo = репозиторий();
    const уложена = await вставить(repo, PNG);

    const ответ = await вернуть(repo, уложена.data.src);

    expect(ответ.code).toBe(200);
    expect(файлы(repo)).toEqual(['index.mdx']);
    // Ничего не удалено: файл лежит в служебной папке, пока его не уберёт уборка по возрасту.
    expect(карантин(repo)).toHaveLength(1);
  });

  it('картинку, на которую в статье уже есть ссылка, забрать нельзя', async () => {
    const repo = репозиторий();
    const уложена = await вставить(repo, PNG);
    fs.writeFileSync(path.join(repo, REL), `---
title: A
---

![](${уложена.data.src})
`, 'utf8');

    const ответ = await вернуть(repo, уложена.data.src);

    expect(ответ.code).toBe(409);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.картинкаУжеВСтатье);
    expect(файлы(repo)).toEqual(['img-01.png', 'index.mdx']);
  });

  it('чужую картинку с собственным именем забрать нельзя', async () => {
    // Забирается только то, что программа сама и назвала по шаблону.
    const repo = репозиторий();
    fs.writeFileSync(path.join(repo, 'docs', 'a', 'arcat.jpg'), JPEG);

    const ответ = await вернуть(repo, './arcat.jpg');

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.неСвояКартинка);
    expect(файлы(repo)).toEqual(['arcat.jpg', 'index.mdx']);
  });

  it('забрать картинку из чужой папки нельзя', async () => {
    const repo = репозиторий();
    fs.writeFileSync(path.join(repo, 'docs', 'b', 'img-01.png'), PNG);

    const ответ = await вернуть(repo, '../b/img-01.png');

    expect(ответ.code).toBe(404);
    expect(файлы(repo, 'b')).toEqual(['img-01.png', 'index.mdx']);
  });
});
