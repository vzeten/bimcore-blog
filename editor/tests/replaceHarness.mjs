// Общая обвязка для проверок замены картинки: репозиторий во временной папке, целые картинки
// трёх пород и один вызов ручки. Вынесена из самих проверок, чтобы файл держался в пределе
// размера (SPEC 4.9); правил здесь нет.
import {afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {assetRoute} from '../src/adapters/assets.mjs';

export const НАСТРОЙКИ = {
  картинки: {шаблонИмени: 'img-{номер}', имяОбложки: 'cover', максимумКилобайт: 500, пределГифМегабайт: 5},
  ошибкиСервера: {
    плохойЗапрос: 'неверный запрос',
    нетСтатьи: 'нет такой статьи',
    нетКартинки: 'нет такой картинки',
    гифБольшеПредела: 'GIF больше {мегабайт} МБ. Уменьшите анимацию заранее',
    картинкаВнеСтатьи: 'путь ведёт из папки статьи наружу',
    заменаТолькоКартинок: 'заменять можно только картинки статьи — JPG, PNG или GIF',
    неТотФормат: 'новый файл должен быть того же формата',
  },
};

export const REL = 'docs/a/index.mdx';
// Целые картинки: у PNG после сигнатуры идёт `IHDR`, у JPEG в хвосте метка конца.
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0x49, 0x44, 0x41, 0x54, 1, 2, 0x49, 0x45, 0x4e, 0x44]);
export const PNG2 = Buffer.concat([PNG, Buffer.from([7, 7, 7])]);
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0xff, 0xda, 1, 2, 0xff, 0xd9]);
// Целый GIF: сигнатура, описание экрана, объявленная в нём палитра, кадр и метка конца.
export const GIF = Buffer.concat([
  Buffer.from('GIF89a', 'binary'),
  Buffer.from([2, 0, 2, 0, 0x80, 0, 0]),
  Buffer.from([0, 0, 0, 0xff, 0xff, 0xff]),
  Buffer.from([0x2c, 0, 0, 0, 0, 2, 0, 2, 0, 0, 2, 2, 0x44, 1, 0]),
  Buffer.from([0x3b]),
]);
// Второй GIF отличается кадром: доказывает, что на диск легли именно новые байты.
export const GIF2 = Buffer.concat([GIF.subarray(0, GIF.length - 1), Buffer.from([0x21, 0xf9, 4, 0, 0, 0, 0, 0, 0x3b])]);

const песочницы = [];

/** Убрать временную папку после теста — тем же списком, что убирает свои песочницы обвязка. */
export function убратьПотом(путь) {
  песочницы.push(путь);
}

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Репозиторий с двумя статьями: у каждой своя папка и своя картинка. */
export function репозиторий() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-replace-'));
  песочницы.push(repo);

  fs.mkdirSync(path.join(repo, 'docs', 'a'), {recursive: true});
  fs.writeFileSync(path.join(repo, REL), '---\ntitle: A\n---\n\nтекст\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'docs', 'a', 'img-01.png'), PNG);
  fs.writeFileSync(path.join(repo, 'docs', 'a', 'img-02.gif'), GIF);
  fs.writeFileSync(path.join(repo, 'docs', 'a', 'схема.webp'), Buffer.from('RIFFxxxxWEBPVP8 ', 'binary'));

  fs.mkdirSync(path.join(repo, 'docs', 'b'), {recursive: true});
  fs.writeFileSync(path.join(repo, 'docs', 'b', 'index.mdx'), '---\ntitle: B\n---\n\nтекст\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'docs', 'b', 'img-01.png'), PNG);

  fs.mkdirSync(path.join(repo, 'static'), {recursive: true});
  fs.writeFileSync(path.join(repo, 'static', 'общая.png'), PNG);

  return repo;
}

/** Один запрос к ручке замены. Возвращает код ответа и разобранный JSON. */
export async function заменить(repo, {article = REL, src = './img-01.png', bytes = PNG2} = {}) {
  const ответ = {};
  await assetRoute({
    req: {method: 'POST'},
    res: {},
    url: new URL('http://localhost/api/asset/replace'),
    repo,
    settings: НАСТРОЙКИ,
    тело: async () => ({article, src, base64: Buffer.from(bytes).toString('base64')}),
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, code, data) => {
      ответ.code = code;
      ответ.data = data;
    },
  });

  return ответ;
}

export const байты = (repo, ...кусок) => fs.readFileSync(path.join(repo, ...кусок));

