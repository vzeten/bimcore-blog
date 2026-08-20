// Имя каждого теста повторяет формулировку правила.
// Приём новой картинки: что программа берёт, что отвергает и почему до вставки файл живёт
// в служебном карантине, а не рядом со статьёй.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {НАСТРОЙКИ, PNG, REL, SVG, вставить, запрос, карантин, подготовить, репозиторий, уложить, файлы} from './intakeHarness.mjs';
import {гифВесом} from './gifFixture.mjs';

describe('приём новой картинки в статью', () => {
  it('файл не той породы в статью не попадает вовсе', async () => {
    const repo = репозиторий();
    const ответ = await подготовить(repo, SVG);

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.неверныйТипКартинки);
    expect(файлы(repo)).toEqual(['index.mdx']);
    expect(карантин(repo)).toEqual([]);
  });

  it('до укладки файл лежит в служебном карантине, а не рядом со статьёй', async () => {
    // Иначе брошенная вставка оставила бы в папке статьи картинку, на которую никто не ссылается,
    // и она уехала бы в публикацию.
    const repo = репозиторий();
    const готово = await подготовить(repo, PNG);

    expect(готово.code).toBe(200);
    expect(файлы(repo)).toEqual(['index.mdx']);
    expect(карантин(repo)).toHaveLength(1);
  });

  it('после укладки карантин за собой убирается', async () => {
    const repo = репозиторий();
    await вставить(repo, PNG);

    expect(карантин(repo)).toEqual([]);
  });

  it('брошенный карантинный файл убирается по возрасту сам', async () => {
    const repo = репозиторий();
    const брошенный = path.join(repo, 'editor', '.tmp', 'старый.png');
    fs.mkdirSync(path.dirname(брошенный), {recursive: true});
    fs.writeFileSync(брошенный, PNG);
    const давно = Date.now() - (НАСТРОЙКИ.картинки.карантинМинут + 1) * 60 * 1000;
    fs.utimesSync(брошенный, давно / 1000, давно / 1000);

    await подготовить(repo, PNG);

    expect(fs.existsSync(брошенный)).toBe(false);
  });

  it('вместе с брошенным файлом уходит и память о его жетоне', async () => {
    // Иначе память сервера росла бы от каждого выбора картинки, который человек бросил.
    const repo = репозиторий();
    const готово = await подготовить(repo, PNG);
    const брошенный = path.join(repo, 'editor', '.tmp', готово.data.жетон);
    const давно = Date.now() - (НАСТРОЙКИ.картинки.карантинМинут + 1) * 60 * 1000;
    fs.utimesSync(брошенный, давно / 1000, давно / 1000);

    // Следующая подготовка уносит и файл, и запись: прежний жетон больше ничего не укладывает.
    await подготовить(repo, PNG);
    const ответ = await уложить(repo, готово.data.жетон);

    expect(ответ.code).toBe(404);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.картинкаНеГотова);
  });

  it('чужой жетон картинку не укладывает', async () => {
    const repo = репозиторий();
    const ответ = await уложить(repo, 'выдумка.png');

    expect(ответ.code).toBe(404);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.картинкаНеГотова);
    expect(файлы(repo)).toEqual(['index.mdx']);
  });

  it('жетон с путём наружу картинку не укладывает', async () => {
    const repo = репозиторий();
    fs.writeFileSync(path.join(repo, 'docs', 'b', 'чужая.png'), PNG);

    const ответ = await уложить(repo, '../../docs/b/чужая.png');

    expect(ответ.code).toBe(404);
    expect(файлы(repo)).toEqual(['index.mdx']);
    expect(fs.existsSync(path.join(repo, 'docs', 'b', 'чужая.png'))).toBe(true);
  });

  it('картинка кладётся рядом со статьёй, а текст статьи не трогается', async () => {
    const repo = репозиторий();
    const было = fs.readFileSync(path.join(repo, REL), 'utf8');
    await вставить(repo, PNG);

    expect(fs.readFileSync(path.join(repo, REL), 'utf8')).toBe(было);
  });

  it('статьи нет — картинку класть некуда', async () => {
    const repo = репозиторий();
    const ответ = await подготовить(repo, PNG, 'docs/выдумка/index.mdx');

    expect(ответ.code).toBe(404);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.нетСтатьи);
  });

  it('путь статьи уводит за пределы репозитория — картинка не пишется', async () => {
    const repo = репозиторий();
    const ответ = await подготовить(repo, PNG, '../чужое/index.mdx');

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.неПутьСтатьи);
    expect(карантин(repo)).toEqual([]);
  });

  it('существующий файл, который не статья, местом для картинки не становится', async () => {
    // Иначе `package.json` сошёл бы за статью и картинка легла бы в корень репозитория.
    const repo = репозиторий();
    fs.writeFileSync(path.join(repo, 'package.json'), '{}', 'utf8');

    const ответ = await подготовить(repo, PNG, 'package.json');

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.неПутьСтатьи);
    expect(fs.readdirSync(repo).includes('img-01.png')).toBe(false);
  });

  it('жетон годится только для той статьи, для которой готовился', async () => {
    // Иначе знающий жетон утащил бы чужую подготовленную картинку в другую статью.
    const repo = репозиторий();
    const готово = await подготовить(repo, PNG);

    const чужая = await уложить(repo, готово.data.жетон, 'docs/b/index.mdx');

    expect(чужая.code).toBe(404);
    expect(чужая.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.картинкаНеГотова);
    expect(файлы(repo, 'b')).toEqual(['index.mdx']);
    // Своей статье та же подготовка по-прежнему годится: чужой запрос её не сжёг.
    expect((await уложить(repo, готово.data.жетон)).data.src).toBe('./img-01.png');
  });

  it('поля запроса не строки — это плохой запрос, а не внутренняя ошибка', async () => {
    const repo = репозиторий();
    const ответ = await запрос(repo, '/api/asset/prepare', {article: 42, base64: null});

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.плохойЗапрос);
  });

  it('тяжёлая картинка кладётся на место и отмечается предупреждением, а не отказом', async () => {
    const repo = репозиторий();
    const тяжёлая = Buffer.concat([PNG, Buffer.alloc(НАСТРОЙКИ.картинки.максимумКилобайт * 1024)]);
    const ответ = await вставить(repo, тяжёлая);

    expect(ответ.code).toBe(200);
    expect(ответ.data.тяжёлая).toBe(true);
    expect(файлы(repo)).toEqual(['img-01.png', 'index.mdx']);
  });

  it('непригодный шаблон имени в настройках останавливает вставку, а не пишет как получится', async () => {
    // Шаблон без места под номер и с кириллицей: такое имя роняет сборку сайта.
    const repo = репозиторий();
    const готово = await подготовить(repo, PNG);
    const испорченные = {...НАСТРОЙКИ, картинки: {...НАСТРОЙКИ.картинки, шаблонИмени: 'картинка'}};

    const ответ = await запрос(repo, '/api/asset/place', {article: REL, жетон: готово.data.жетон}, испорченные);

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.имяНеПодобрано);
    expect(файлы(repo)).toEqual(['index.mdx']);
    // Подготовленный файл остаётся в карантине: человек не потерял выбранную картинку.
    expect(карантин(repo)).toHaveLength(1);
  });

  it('чужой запрос ручке не принадлежит', async () => {
    const repo = репозиторий();
    const ответ = await запрос(repo, '/api/asset/cover', {article: REL, base64: PNG.toString('base64')});

    expect(ответ.принято).toBe(false);
  });

  it('битые байты картинкой не считаются и пустым файлом не ложатся', async () => {
    const repo = репозиторий();
    const ответ = await запрос(repo, '/api/asset/prepare', {article: REL, base64: '!!!не base64!!!'});

    expect(ответ.code).toBe(400);
    expect(файлы(repo)).toEqual(['index.mdx']);
    expect(карантин(repo)).toEqual([]);
  });
});

describe('предел веса анимации при вставке', () => {
  const МБ = 1024 * 1024;

  it('GIF немного меньше предела вставляется и ложится рядом со статьёй байт в байт', async () => {
    const repo = репозиторий();
    const гиф = гифВесом(5 * МБ - 1024);

    const ответ = await вставить(repo, гиф);

    expect(ответ.code).toBe(200);
    expect(fs.readFileSync(path.join(repo, 'docs', 'a', 'img-01.gif')).equals(гиф)).toBe(true);
  });

  it('GIF ровно в предел вставляется: предел включительный', async () => {
    const repo = репозиторий();

    const ответ = await вставить(repo, гифВесом(5 * МБ));

    expect(ответ.code).toBe(200);
    expect(файлы(repo)).toEqual(['img-01.gif', 'index.mdx']);
  });

  it('GIF на один байт больше предела не принимается и рядом со статьёй не появляется', async () => {
    const repo = репозиторий();

    const ответ = await подготовить(repo, гифВесом(5 * МБ + 1));

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe('GIF больше 5 МБ. Уменьшите анимацию заранее');
    // Ни рядом со статьёй, ни даже в служебном карантине: отказ случается до касания диска.
    expect(файлы(repo)).toEqual(['index.mdx']);
    expect(карантин(repo)).toEqual([]);
  });

  it('про вес принятого GIF человеку не говорится: сжимать анимацию ему нечем', async () => {
    // Живой файл владельца: gigapixelai.gif около полутора мегабайт.
    const repo = репозиторий();

    const ответ = await вставить(repo, гифВесом(Math.round(1.5 * МБ)));

    expect(ответ.code).toBe(200);
    expect(ответ.data.тяжёлая).toBe(false);
  });

  it('подменённый в карантине тяжёлый GIF рядом со статьёй не ложится', async () => {
    // Между подготовкой и укладкой файл мог смениться, поэтому предел проверяется дважды.
    const repo = репозиторий();
    const готово = await подготовить(repo, гифВесом(1024 * 64));
    const путь = path.join(repo, 'editor', '.tmp', готово.data.жетон);
    fs.writeFileSync(путь, гифВесом(5 * МБ + 1));

    const ответ = await уложить(repo, готово.data.жетон);

    expect(ответ.code).toBe(400);
    expect(файлы(repo)).toEqual(['index.mdx']);
  });

  it('файл с именем .gif, который GIF не является, отвергается по содержимому', async () => {
    const repo = репозиторий();

    const ответ = await подготовить(repo, Buffer.from('GIF89a, а дальше просто текст', 'utf8'));

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.неверныйТипКартинки);
    expect(карантин(repo)).toEqual([]);
  });
});
