// Имя каждого теста повторяет формулировку правила.
// Ручка замены картинки: новые байты ложатся под прежним именем, путь не выходит из папки
// статьи, формат нового файла обязан совпасть с форматом заменяемого.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {assetRoute} from '../src/adapters/assets.mjs';

import {
  НАСТРОЙКИ, REL, PNG, PNG2, JPEG, GIF, GIF2, байты, заменить, репозиторий, убратьПотом,
} from './replaceHarness.mjs';
import {гифВесом} from './gifFixture.mjs';

describe('замена файла картинки', () => {
  it('новые байты ложатся под прежним именем, ссылка в тексте не меняется', async () => {
    const repo = репозиторий();
    const текстБыл = fs.readFileSync(path.join(repo, REL), 'utf8');

    const ответ = await заменить(repo);

    expect(ответ.code).toBe(200);
    expect(ответ.data.replaced).toBe(true);
    expect(байты(repo, 'docs', 'a', 'img-01.png').equals(PNG2)).toBe(true);
    expect(fs.readFileSync(path.join(repo, REL), 'utf8')).toBe(текстБыл);
  });

  it('путь с .. не заменяет картинку чужой статьи', async () => {
    const repo = репозиторий();
    const ответ = await заменить(repo, {src: '../b/img-01.png'});

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.картинкаВнеСтатьи);
    expect(байты(repo, 'docs', 'b', 'img-01.png').equals(PNG)).toBe(true);
  });

  it('абсолютный путь /static не заменяет общий файл сайта', async () => {
    const repo = репозиторий();
    const ответ = await заменить(repo, {src: '/static/общая.png'});

    expect(ответ.code).toBe(400);
    expect(байты(repo, 'static', 'общая.png').equals(PNG)).toBe(true);
  });

  it('статья, лежащая за ссылкой-папкой наружу, картинок не меняет', async () => {
    // Текстуально путь статьи внутри репозитория, но файловая система ведёт его за пределы.
    const repo = репозиторий();
    const чужое = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-outside-'));
    убратьПотом(чужое);
    fs.mkdirSync(path.join(чужое, 'a'), {recursive: true});
    fs.writeFileSync(path.join(чужое, 'a', 'index.mdx'), '---\ntitle: X\n---\n', 'utf8');
    fs.writeFileSync(path.join(чужое, 'a', 'img-01.png'), PNG);
    try {
      fs.symlinkSync(чужое, path.join(repo, 'linked'), 'junction');
    } catch {
      return; // ссылки на этой файловой системе не создаются — обходить нечем
    }

    const ответ = await заменить(repo, {article: 'linked/a/index.mdx'});

    expect(ответ.code).toBe(404);
    expect(байты(чужое, 'a', 'img-01.png').equals(PNG)).toBe(true);
  });

  it('ссылка-папка внутри папки статьи не уводит замену в чужую статью', async () => {
    // Текстуально путь остаётся внутри статьи, но файловая система ведёт его в docs/b.
    const repo = репозиторий();
    try {
      fs.symlinkSync(path.join(repo, 'docs', 'b'), path.join(repo, 'docs', 'a', 'linked'), 'junction');
    } catch {
      return; // ссылки на этой файловой системе не создаются — обходить нечем
    }

    const ответ = await заменить(repo, {src: './linked/img-01.png'});

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.картинкаВнеСтатьи);
    expect(байты(repo, 'docs', 'b', 'img-01.png').equals(PNG)).toBe(true);
  });

  it('формат решают байты: JPEG в файл .png не ложится', async () => {
    const repo = репозиторий();
    const ответ = await заменить(repo, {bytes: JPEG});

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.неТотФормат);
    expect(байты(repo, 'docs', 'a', 'img-01.png').equals(PNG)).toBe(true);
  });

  it('обрубок картинки заменой не принимается', async () => {
    const repo = репозиторий();
    const ответ = await заменить(repo, {bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])});

    expect(ответ.code).toBe(400);
    expect(байты(repo, 'docs', 'a', 'img-01.png').equals(PNG)).toBe(true);
  });

  it('JPG заменяется другим JPG: на диск ложатся ровно новые байты', async () => {
    const repo = репозиторий();
    fs.writeFileSync(path.join(repo, 'docs', 'a', 'img-03.jpg'), JPEG);
    const другой = Buffer.concat([JPEG.subarray(0, JPEG.length - 2), Buffer.from([7, 7, 0xff, 0xd9])]);

    const ответ = await заменить(repo, {src: './img-03.jpg', bytes: другой});

    expect(ответ.code).toBe(200);
    expect(байты(repo, 'docs', 'a', 'img-03.jpg').equals(другой)).toBe(true);
  });

  it('GIF заменяется другим GIF: байты новые, формат и анимация свои', async () => {
    // Файл не перекодируется нигде: на диск ложатся ровно выбранные байты (слово владельца 2026-08-18).
    const repo = репозиторий();
    const ответ = await заменить(repo, {src: './img-02.gif', bytes: GIF2});

    expect(ответ.code).toBe(200);
    expect(байты(repo, 'docs', 'a', 'img-02.gif').equals(GIF2)).toBe(true);
  });

  it('под именем GIF картинка другого формата заменой не принимается', async () => {
    // Смена формата — другая дорога: там меняются и расширение файла, и ссылка в статье.
    const repo = репозиторий();
    const ответ = await заменить(repo, {src: './img-02.gif', bytes: PNG2});

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.неТотФормат);
    expect(байты(repo, 'docs', 'a', 'img-02.gif').equals(GIF)).toBe(true);
  });

  it('картинка формата, которого программа не знает, заменой не трогается', async () => {
    const repo = репозиторий();
    const ответ = await заменить(repo, {src: './схема.webp', bytes: PNG2});

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.заменаТолькоКартинок);
  });

  it('несуществующая картинка — отказ, а не создание файла', async () => {
    const repo = репозиторий();
    const ответ = await заменить(repo, {src: './img-09.png'});

    expect(ответ.code).toBe(404);
    expect(fs.existsSync(path.join(repo, 'docs', 'a', 'img-09.png'))).toBe(false);
  });

  it('статьи нет — замена не делается', async () => {
    const repo = репозиторий();
    const ответ = await заменить(repo, {article: 'docs/нет-такой/index.mdx'});

    expect(ответ.code).toBe(404);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.нетСтатьи);
  });

  it('тяжёлый файл кладётся на место и отмечается предупреждением, а не отказом', async () => {
    const repo = репозиторий();
    const тяжёлый = Buffer.concat([PNG, Buffer.alloc(НАСТРОЙКИ.картинки.максимумКилобайт * 1024)]);
    const ответ = await заменить(repo, {bytes: тяжёлый});

    expect(ответ.code).toBe(200);
    expect(ответ.data.тяжёлая).toBe(true);
    expect(байты(repo, 'docs', 'a', 'img-01.png').length).toBe(тяжёлый.length);
  });

  it('после успешной замены временных файлов не остаётся, в папке статьи их не было вовсе', async () => {
    // Временный файл живёт в служебной папке редактора, а не рядом со статьёй: файл в папке
    // статьи принадлежит статье и уехал бы в состав публикации.
    const repo = репозиторий();
    await заменить(repo);

    expect(fs.readdirSync(path.join(repo, 'docs', 'a')).sort())
      .toEqual(['img-01.png', 'img-02.gif', 'index.mdx', 'схема.webp'].sort());
    const tmp = path.join(repo, 'editor', '.tmp');
    expect(fs.existsSync(tmp) ? fs.readdirSync(tmp) : []).toEqual([]);
  });

  it('сбой записи не портит старые байты и не оставляет хвоста', async () => {
    // Служебное место занято файлом — временную папку не создать, запись падает до `rename`.
    const repo = репозиторий();
    fs.mkdirSync(path.join(repo, 'editor'), {recursive: true});
    fs.writeFileSync(path.join(repo, 'editor', '.tmp'), 'занято', 'utf8');

    let упало = false;
    try {
      await заменить(repo);
    } catch {
      упало = true;
    }

    expect(упало).toBe(true);
    expect(байты(repo, 'docs', 'a', 'img-01.png').equals(PNG)).toBe(true);
  });

  it('поля запроса не строки — это плохой запрос, а не внутренняя ошибка', async () => {
    const repo = репозиторий();
    const ответ = {};
    await assetRoute({
      req: {method: 'POST'},
      res: {},
      url: new URL('http://localhost/api/asset/replace'),
      repo,
      settings: НАСТРОЙКИ,
      тело: async () => ({article: 42, src: null, base64: []}),
      insideRepo: () => true,
      send: (res, code, data) => {
        ответ.code = code;
        ответ.data = data;
      },
    });

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.плохойЗапрос);
  });
});

describe('предел веса анимации при замене', () => {
  const МБ = 1024 * 1024;

  it('GIF немного меньше предела заменяет прежний байт в байт', async () => {
    const repo = репозиторий();
    const гиф = гифВесом(5 * МБ - 1024);

    const ответ = await заменить(repo, {src: './img-02.gif', bytes: гиф});

    expect(ответ.code).toBe(200);
    expect(байты(repo, 'docs', 'a', 'img-02.gif').equals(гиф)).toBe(true);
  });

  it('GIF ровно в предел заменяет прежний: предел включительный', async () => {
    const repo = репозиторий();

    const ответ = await заменить(repo, {src: './img-02.gif', bytes: гифВесом(5 * МБ)});

    expect(ответ.code).toBe(200);
    expect(байты(repo, 'docs', 'a', 'img-02.gif').length).toBe(5 * МБ);
  });

  it('GIF на один байт больше предела не заменяет ничего: прежний файл остаётся как был', async () => {
    const repo = репозиторий();
    const былиБайты = байты(repo, 'docs', 'a', 'img-02.gif');

    const ответ = await заменить(repo, {src: './img-02.gif', bytes: гифВесом(5 * МБ + 1)});

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe('GIF больше 5 МБ. Уменьшите анимацию заранее');
    expect(байты(repo, 'docs', 'a', 'img-02.gif').equals(былиБайты)).toBe(true);
  });

  it('про вес принятого GIF человеку не говорится', async () => {
    const repo = репозиторий();

    const ответ = await заменить(repo, {src: './img-02.gif', bytes: гифВесом(Math.round(1.5 * МБ))});

    expect(ответ.data.тяжёлая).toBe(false);
  });

  it('тяжёлый PNG по-прежнему принимается с советом сжать: отказ бывает только у анимации', async () => {
    const repo = репозиторий();
    const тяжёлый = Buffer.concat([PNG2, Buffer.alloc(600 * 1024)]);

    const ответ = await заменить(repo, {bytes: тяжёлый});

    expect(ответ.code).toBe(200);
    expect(ответ.data.тяжёлая).toBe(true);
  });
});
