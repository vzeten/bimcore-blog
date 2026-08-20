// Имя каждого теста повторяет формулировку правила.
// Ручка обложки: кладёт файл в папку статьи под постоянным именем и проверяет тип по содержимому.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {assetRoute} from '../src/adapters/assets.mjs';

const НАСТРОЙКИ = {
  картинки: {шаблонИмени: 'img-{номер}', имяОбложки: 'cover', максимумКилобайт: 500, пределГифМегабайт: 5},
  ошибкиСервера: {
    плохойЗапрос: 'неверный запрос',
    неверныйТипОбложки: 'обложкой может быть только PNG или JPG',
    нетКартинки: 'нет такой картинки',
    нетФайла: 'нет файла',
  },
};

const REL = 'docs/a/index.mdx';
// Целые картинки: у PNG после сигнатуры идёт заголовок изображения `IHDR`, у JPEG в хвосте
// стоит метка конца. Обрубок из одной сигнатуры обложкой не считается.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0x49, 0x44, 0x41, 0x54, 1, 2, 0x49, 0x45, 0x4e, 0x44]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0xff, 0xda, 1, 2, 0xff, 0xd9]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');
// Целый GIF: сигнатура, описание экрана, объявленная в нём палитра, кадр и метка конца.
// Картинкой тела статьи он считается, обложкой — нет.
const GIF = Buffer.concat([
  Buffer.from('GIF89a', 'binary'),
  Buffer.from([2, 0, 2, 0, 0x80, 0, 0]),
  Buffer.from([0, 0, 0, 0xff, 0xff, 0xff]),
  Buffer.from([0x2c, 0, 0, 0, 0, 2, 0, 2, 0, 0, 2, 2, 0x44, 1, 0]),
  Buffer.from([0x3b]),
]);

const песочницы = [];

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Репозиторий с одной статьёй: папка статьи существует, картинок в ней пока нет. */
function репозиторий() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-cover-'));
  песочницы.push(repo);
  fs.mkdirSync(path.join(repo, path.dirname(REL)), {recursive: true});
  fs.writeFileSync(path.join(repo, REL), '---\ntitle: A\n---\n\nтекст\n', 'utf8');
  return repo;
}

/** Один запрос к ручке. Возвращает код ответа и разобранный JSON. */
async function запрос(repo, pathname, payload) {
  const ответ = {};
  const принято = await assetRoute({
    req: {method: 'POST'},
    res: {},
    url: new URL(`http://localhost${pathname}`),
    repo,
    settings: НАСТРОЙКИ,
    тело: async () => payload,
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, code, data) => {
      ответ.code = code;
      ответ.data = data;
    },
  });

  return {принято, ...ответ};
}

const загрузить = (repo, bytes, article = REL) => запрос(repo, '/api/asset/cover', {
  article,
  base64: Buffer.from(bytes).toString('base64'),
});

const лежит = (repo, имя) => fs.existsSync(path.join(repo, path.dirname(REL), имя));

describe('загрузка обложки статьи', () => {
  it('PNG ложится в папку статьи под именем cover.png', async () => {
    const repo = репозиторий();
    const ответ = await загрузить(repo, PNG);

    expect(ответ.code).toBe(200);
    expect(ответ.data.src).toBe('./cover.png');
    expect(лежит(repo, 'cover.png')).toBe(true);
  });

  it('JPEG ложится под именем cover.jpg, а не cover.jpeg', async () => {
    // Имя у обложки одно на формат: иначе её не найти постоянным именем.
    const repo = репозиторий();
    const ответ = await загрузить(repo, JPEG);

    expect(ответ.data.src).toBe('./cover.jpg');
    expect(лежит(repo, 'cover.jpg')).toBe(true);
  });

  it('обложка не занимает имена картинок тела статьи', async () => {
    const repo = репозиторий();
    await загрузить(repo, PNG);

    expect(лежит(repo, 'img-01.png')).toBe(false);
  });

  it('SVG обложкой не принимается, и файл в папку не попадает', async () => {
    const repo = репозиторий();
    const ответ = await загрузить(repo, SVG);

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.неверныйТипОбложки);
    expect(fs.readdirSync(path.join(repo, path.dirname(REL)))).toEqual(['index.mdx']);
  });

  it('GIF обложкой не принимается, хотя картинкой тела статьи он законен', async () => {
    // Список типов в окне выбора ручку не сторожит: проверка обязана быть на сервере.
    const repo = репозиторий();
    const ответ = await загрузить(repo, GIF);

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.неверныйТипОбложки);
    expect(fs.readdirSync(path.join(repo, path.dirname(REL)))).toEqual(['index.mdx']);
  });

  it('файл не-картинка обложкой не принимается', async () => {
    const repo = репозиторий();
    const ответ = await загрузить(repo, Buffer.from('просто текст', 'utf8'));

    expect(ответ.code).toBe(400);
    expect(fs.readdirSync(path.join(repo, path.dirname(REL)))).toEqual(['index.mdx']);
  });

  it('решает содержимое файла, а не его имя и не тип от браузера', async () => {
    // Запрос уверяет, что это png; внутри — svg. Верить надо байтам.
    const repo = репозиторий();
    const ответ = await запрос(repo, '/api/asset/cover', {
      article: REL,
      base64: SVG.toString('base64'),
      ext: 'png',
    });

    expect(ответ.code).toBe(400);
    expect(лежит(repo, 'cover.png')).toBe(false);
  });

  it('битые байты обложкой не принимаются, а не ложатся пустым файлом', async () => {
    const repo = репозиторий();
    const ответ = await запрос(repo, '/api/asset/cover', {article: REL, base64: '!!!не base64!!!'});

    expect(ответ.code).toBe(400);
    expect(fs.readdirSync(path.join(repo, path.dirname(REL)))).toEqual(['index.mdx']);
  });

  it('повторная загрузка PNG заменяет прежний cover.png', async () => {
    const repo = репозиторий();
    await загрузить(repo, PNG);
    await загрузить(repo, Buffer.concat([PNG, Buffer.from([9, 9, 9])]));

    const файлы = fs.readdirSync(path.join(repo, path.dirname(REL)));
    expect(файлы.filter((имя) => имя.startsWith('cover'))).toEqual(['cover.png']);
  });

  it('загрузка JPG после PNG не удаляет прежний cover.png', async () => {
    // Старый файл может стоять в теле статьи; уборка старых файлов — отдельное решение.
    const repo = репозиторий();
    await загрузить(repo, PNG);
    await загрузить(repo, JPEG);

    expect(лежит(repo, 'cover.png')).toBe(true);
    expect(лежит(repo, 'cover.jpg')).toBe(true);
  });

  it('загрузка обложки не трогает тело статьи', async () => {
    const repo = репозиторий();
    const было = fs.readFileSync(path.join(repo, REL), 'utf8');
    await загрузить(repo, PNG);

    expect(fs.readFileSync(path.join(repo, REL), 'utf8')).toBe(было);
  });

  it('тяжёлая обложка кладётся на место и отмечается предупреждением, а не отказом', async () => {
    const repo = репозиторий();
    const тяжёлая = Buffer.concat([PNG, Buffer.alloc(НАСТРОЙКИ.картинки.максимумКилобайт * 1024)]);
    const ответ = await загрузить(repo, тяжёлая);

    expect(ответ.code).toBe(200);
    expect(ответ.data.тяжёлая).toBe(true);
    expect(лежит(repo, 'cover.png')).toBe(true);
  });

  it('обрубок картинки из одной сигнатуры обложкой не принимается', async () => {
    const repo = репозиторий();
    const ответ = await загрузить(repo, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    expect(ответ.code).toBe(400);
    expect(лежит(repo, 'cover.png')).toBe(false);
  });

  it('статьи нет — обложку класть некуда', async () => {
    const repo = репозиторий();
    const ответ = await загрузить(repo, PNG, 'docs/нет-такой/index.mdx');

    expect(ответ.code).toBe(404);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.нетСтатьи);
  });

  it('статьи с таким именем нет, а папка есть — обложка мимо статьи не кладётся', async () => {
    // Иначе `docs/выдумка.mdx` положил бы картинку прямо в корень раздела: папка-то существует.
    const repo = репозиторий();
    const ответ = await загрузить(repo, PNG, 'docs/выдумка.mdx');

    expect(ответ.code).toBe(404);
    expect(fs.existsSync(path.join(repo, 'docs', 'cover.png'))).toBe(false);
  });

  it('путь статьи уводит за пределы репозитория — обложка не пишется', async () => {
    const repo = репозиторий();
    const ответ = await загрузить(repo, PNG, '../../чужое/index.mdx');

    expect(ответ.code).toBe(404);
  });

  it('поля запроса не строки — это плохой запрос, а не внутренняя ошибка', async () => {
    const repo = репозиторий();
    const ответ = await запрос(repo, '/api/asset/cover', {article: 42, base64: null});

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.плохойЗапрос);
  });

  it('картинка тела статьи этой ручке не принадлежит: у неё своя дорога', async () => {
    // Две дороги, два правила имени: обложка не должна перетирать картинки тела и наоборот.
    const repo = репозиторий();
    const ответ = await запрос(repo, '/api/asset/prepare', {article: REL, base64: PNG.toString('base64')});

    expect(ответ.принято).toBe(false);
    expect(fs.readdirSync(path.join(repo, path.dirname(REL)))).toEqual(['index.mdx']);
  });
});
