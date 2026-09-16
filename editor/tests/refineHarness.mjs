// Общая обвязка проверок «Доработать»: настоящие настройки программы, целые картинки с размерами,
// рабочая копия из текста и файлов и один вызов ручки на репозитории во временной папке.
// Правил здесь нет — только сборка входов (SPEC 4.9).
import {afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {refineRoute} from '../src/adapters/refineRoute.mjs';
import {ГИФ} from './gifFixture.mjs';
import {WEBM as ВИДЕО} from './webmFixture.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

export const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
export const EN = 'docs/lessons/proba/index.mdx';
export const BLOG = 'blog/proba/index.mdx';

/**
 * Целый PNG с заданными размерами в IHDR; данных кадра нет — программе важны заголовок и хвост.
 * `строение` — байт строения кадра: `0` обычный цвет, `3` палитра (такой даёт медиастандарт сайта).
 */
export function png(ширина, высота, хвост = 0, строение = 0) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ширина, 0);
  ihdr.writeUInt32BE(высота, 4);
  ihdr[8] = 8;
  ihdr[9] = строение;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
    Buffer.from('IHDR'), ihdr, Buffer.alloc(4),
    Buffer.from([0, 0, 0, 1]), Buffer.from('IDAT'), Buffer.alloc(1 + хвост), Buffer.alloc(4),
    Buffer.from([0, 0, 0, 0]), Buffer.from('IEND'), Buffer.alloc(4),
  ]);
}

/** Целый JPEG с кадром SOF0 заданных размеров. */
export function jpg(ширина, высота, хвост = 0) {
  const sof = Buffer.from([0xff, 0xc0, 0, 11, 8, 0, 0, 0, 0, 1, 1, 0x11, 0]);
  sof.writeUInt16BE(высота, 5);
  sof.writeUInt16BE(ширина, 7);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    sof, Buffer.from([0xff, 0xda, 0, 2]), Buffer.alloc(хвост), Buffer.from([0xff, 0xd9]),
  ]);
}

/** Начало WebP: контейнер RIFF с меткой WEBP — так его узнаёт медиаподготовка. */
export const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([16, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]);
export const GIF = ГИФ;
export const WEBM = ВИДЕО;

/**
 * Рабочая копия без диска: текст и файлы папки статьи.
 *
 * `наСайте` — имена, которые уже лежат в опубликованной ветке; `null` означает «спросить не
 * удалось». По умолчанию сайт известен и пуст: так выглядит статья, которой на сайте ещё нет.
 */
export function копия(текст, файлы = {}, путь = RU, наСайте = new Set()) {
  return {
    путь,
    текст,
    файлы: new Map(Object.entries(файлы)),
    имена: new Set(Object.keys(файлы)),
    наСайте,
  };
}

/** Инструменты применения без Python: отдают те же байты либо подставленный результат. */
export const инструменты = (результат = null) => ({
  вызовов: 0,
  async подготовить(набор) {
    this.вызовов += 1;
    return набор.map(({байты}) => ({байты: результат ?? байты}));
  },
});

const песочницы = [];
afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Репозиторий во временной папке: файлы по путям, рядом пустая папка редактора. */
export function репозиторий(файлы) {
  const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-refine-'));
  песочницы.push(корень);
  const repo = path.join(корень, 'работа');
  const editorDir = path.join(repo, 'editor');
  fs.mkdirSync(editorDir, {recursive: true});
  for (const [rel, содержимое] of Object.entries(файлы)) {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), содержимое);
  }
  return {repo, editorDir};
}

/**
 * Настройки с подставной командой медиаподготовки: скрипт на node копирует заданные байты в `.png`.
 * Переменные `ПОДМЕНА_ТРОНУТЬ` и `ПОДМЕНА_ТРОНУТЬ_БАЙТЫ` (base64) велят скрипту по ходу работы
 * изменить названный файл — так проверяется гонка «правка во время image-prep».
 */
export function настройкиСоСкриптом(repo, результат) {
  const скрипт = path.join(repo, 'editor', 'подмена-image-prep.mjs');
  fs.writeFileSync(скрипт, [
    "import fs from 'node:fs'; import path from 'node:path';",
    'const dir = process.argv[2];',
    "if (process.env.ПОДМЕНА_ТРОНУТЬ) fs.writeFileSync(process.env.ПОДМЕНА_ТРОНУТЬ, Buffer.from(process.env.ПОДМЕНА_ТРОНУТЬ_БАЙТЫ, 'base64'));",
    "for (const f of fs.readdirSync(dir)) { if (f.endsWith('.png')) continue; const out = path.join(dir, f.replace(/\\.[^.]+$/, '.png'));",
    "fs.writeFileSync(out, Buffer.from(process.env.ПОДМЕНА_PNG, 'base64')); fs.rmSync(path.join(dir, f)); }",
  ].join('\n'));
  process.env.ПОДМЕНА_PNG = результат.toString('base64');
  delete process.env.ПОДМЕНА_ТРОНУТЬ;
  return {...НАСТРОЙКИ, доработка: {...НАСТРОЙКИ['доработка'], команда: {python: process.execPath, скрипт: 'editor/подмена-image-prep.mjs', пределСекунд: 30}}};
}

/**
 * Подставной git для ручки: опубликованная ветка есть, а названные пути в ней лежат или нет.
 *
 * Без него ручка сочла бы сайт неизвестным и не тронула бы ни одной картинки — правильное
 * поведение программы, но проверять на нём обработку нечего.
 *
 * `опубликованные` — пути от корня репозитория, лежащие в ветке. `null` вместо перечня означает
 * «ветки нет»: так проверяется случай, когда про сайт не известно ничего.
 */
export function gitСВеткой(опубликованные = []) {
  return {
    revparse: async () => (опубликованные === null ? Promise.reject(new Error('нет ветки')) : 'origin/main'),
    raw: async (аргументы) => {
      if (!Array.isArray(аргументы) || !аргументы.includes('ls-tree')) return 'Проверка';
      const свои = аргументы.slice(аргументы.indexOf('--') + 1);
      return (опубликованные ?? [])
        .filter((путь) => свои.includes(путь))
        .map((путь) => `100644 blob 0000000000000000000000000000000000000000\t${путь}\0`)
        .join('');
    },
  };
}

/** Один запрос к ручке. Возвращает код ответа и разобранный JSON. */
export async function запрос({repo, editorDir}, pathname, тело, settings = НАСТРОЙКИ, git = gitСВеткой()) {
  const ответ = {};
  const последняяПравка = new Map();
  const взято = await refineRoute({
    req: {method: 'POST'},
    res: {},
    url: {pathname},
    repo,
    editorDir,
    settings,
    git,
    тело: async () => тело,
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, code, data) => {
      ответ.code = code;
      ответ.data = data;
    },
    последняяПравка,
  });
  return {взято, ...ответ, последняяПравка};
}

/** Отпечатки всех файлов дерева: по ним видно, тронула ли ручка хоть один байт. */
export function снимокДиска(repo) {
  const обход = (папка) => fs.readdirSync(папка, {withFileTypes: true}).flatMap((вход) => {
    const полный = path.join(папка, вход.name);
    return вход.isDirectory() ? обход(полный) : [[path.relative(repo, полный), fs.readFileSync(полный).toString('base64')]];
  });
  return JSON.stringify(обход(repo).sort());
}
