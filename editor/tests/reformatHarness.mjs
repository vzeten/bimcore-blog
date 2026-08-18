// Общая обвязка для проверок смены формата картинки: репозиторий во временной папке, целые
// картинки трёх пород и один вызов ручки. Вынесено из тестов, чтобы каждый файл проверок держался
// в пределе размера (SPEC 4.9); правил здесь нет.
import {afterEach} from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {assetReformatRoute} from '../src/adapters/assetReformat.mjs';

export const НАСТРОЙКИ = {
  картинки: {шаблонИмени: 'img-{номер}', знаковВНомере: 2, имяОбложки: 'cover', максимумКилобайт: 500},
  ошибкиСервера: {
    плохойЗапрос: 'неверный запрос',
    нетСтатьи: 'нет такой статьи',
    нетКартинки: 'нет такой картинки',
    картинкаВнеСтатьи: 'путь ведёт из папки статьи наружу',
    заменаТолькоКартинок: 'заменять можно только картинки статьи — JPG, PNG или GIF',
    имяНеПодобрано: 'не удалось подобрать имя для новой картинки',
    текстНеСовпал: 'статья на диске изменилась',
    вхождениеНеНайдено: 'место этой картинки в файле не нашлось',
    операцияИдёт: 'над этой статьёй уже идёт замена картинки',
  },
};

export const REL = 'docs/a/index.mdx';
export const УЗЕЛ = '![Подпись](./img-01.jpg)';
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0x49, 0x44, 0x41, 0x54, 1, 2, 0x49, 0x45, 0x4e, 0x44]);
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0xff, 0xda, 1, 2, 0xff, 0xd9]);
// Целый многокадровый GIF: сигнатура, описание экрана, палитра, два кадра и метка конца.
export const GIF = Buffer.concat([
  Buffer.from('GIF89a', 'binary'),
  Buffer.from([2, 0, 2, 0, 0x80, 0, 0]),
  Buffer.from([0, 0, 0, 0xff, 0xff, 0xff]),
  Buffer.from([0x21, 0xf9, 4, 0, 10, 0, 0, 0]),
  Buffer.from([0x2c, 0, 0, 0, 0, 2, 0, 2, 0, 0, 2, 2, 0x44, 1, 0]),
  Buffer.from([0x21, 0xf9, 4, 0, 10, 0, 0, 0]),
  Buffer.from([0x2c, 0, 0, 0, 0, 2, 0, 2, 0, 0, 2, 2, 0x44, 1, 0]),
  Buffer.from([0x3b]),
]);
/** Байты каждого рода: по ним строятся все девять переходов. */
export const БАЙТЫ = {jpg: JPEG, png: PNG, gif: GIF};

export const отпечаток = (текст) => crypto.createHash('sha1').update(текст, 'utf8').digest('hex');

const песочницы = [];

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Репозиторий со статьёй, JPEG-картинкой в теле и текстом в windows-переводах строк. */
export function репозиторий(текст = `---\ntitle: A\n---\n\n${УЗЕЛ}\n\nхвост\n`) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-reformat-'));
  песочницы.push(repo);
  fs.mkdirSync(path.join(repo, 'docs', 'a'), {recursive: true});
  fs.writeFileSync(path.join(repo, REL), текст, 'utf8');
  fs.writeFileSync(path.join(repo, 'docs', 'a', 'img-01.jpg'), JPEG);
  return repo;
}

/** Один запрос к ручке. Возвращает код ответа и разобранный JSON. */
export async function сменить(repo, правки = {}, settings = НАСТРОЙКИ) {
  const текст = fs.readFileSync(path.join(repo, REL), 'utf8');
  const тело = {
    article: REL,
    src: './img-01.jpg',
    узел: УЗЕЛ,
    номер: 1,
    отпечаток: отпечаток(текст),
    base64: PNG.toString('base64'),
    ...правки,
  };

  const ответ = {};
  await assetReformatRoute({
    req: {method: 'POST'},
    res: {},
    url: new URL('http://localhost/api/asset/reformat'),
    repo,
    settings,
    тело: async () => тело,
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, code, data) => {
      ответ.code = code;
      ответ.data = data;
    },
  });

  return ответ;
}

export const файл = (repo, имя) => path.join(repo, 'docs', 'a', имя);

