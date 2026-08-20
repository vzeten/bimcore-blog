// Общая обвязка для проверок приёма новой картинки: настоящий репозиторий во временной папке,
// целые картинки трёх пород и один вызов ручки. Вынесено из тестов, чтобы каждый файл проверок
// держался в пределе размера (SPEC 4.9); правил здесь нет.
import {afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {assetIntakeRoute} from '../src/adapters/assetIntake.mjs';

export const НАСТРОЙКИ = {
  картинки: {
    шаблонИмени: 'img-{номер}',
    знаковВНомере: 2,
    имяОбложки: 'cover',
    максимумКилобайт: 500,
    пределГифМегабайт: 5,
    карантинМинут: 60,
  },
  контент: [
    {локаль: 'en', род: 'docs', папка: 'docs', наСайте: true},
    {локаль: 'ru', род: 'docs', папка: 'i18n/ru/docusaurus-plugin-content-docs/current', наСайте: true},
  ],
  ошибкиСервера: {
    плохойЗапрос: 'неверный запрос',
    внутренняя: 'внутренняя ошибка редактора',
    нетСтатьи: 'нет такой статьи',
    неверныйТипКартинки: 'картинкой статьи может быть только PNG, JPG или GIF',
    картинкаНеГотова: 'выбранный файл до программы не доехал',
    имяНеПодобрано: 'не удалось подобрать имя для новой картинки',
    неПутьСтатьи: 'это не файл статьи сайта',
    нетКартинки: 'нет такой картинки',
    неСвояКартинка: 'эту картинку программа не создавала',
    картинкаУжеВСтатье: 'на эту картинку в статье уже есть ссылка',
    гифБольшеПредела: 'GIF больше {мегабайт} МБ. Уменьшите анимацию заранее',
  },
};

export const REL = 'docs/a/index.mdx';
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0x49, 0x44, 0x41, 0x54, 1, 2, 0x49, 0x45, 0x4e, 0x44]);
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0xff, 0xda, 1, 2, 0xff, 0xd9]);
// Целый GIF: сигнатура, описание экрана, объявленная палитра, кадр и метка конца.
export const GIF = Buffer.concat([
  Buffer.from('GIF89a', 'binary'),
  Buffer.from([2, 0, 2, 0, 0x80, 0, 0]),
  Buffer.from([0, 0, 0, 0xff, 0xff, 0xff]),
  Buffer.from([0x2c, 0, 0, 0, 0, 2, 0, 2, 0, 0, 2, 2, 0x44, 1, 0]),
  Buffer.from([0x3b]),
]);
export const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');

const песочницы = [];

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Репозиторий с двумя статьями: у каждой своя папка. */
export function репозиторий() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-intake-'));
  песочницы.push(repo);

  fs.mkdirSync(path.join(repo, 'docs', 'a'), {recursive: true});
  fs.writeFileSync(path.join(repo, REL), '---\ntitle: A\n---\n\nтекст\n', 'utf8');
  fs.mkdirSync(path.join(repo, 'docs', 'b'), {recursive: true});
  fs.writeFileSync(path.join(repo, 'docs', 'b', 'index.mdx'), '---\ntitle: B\n---\n\nтекст\n', 'utf8');

  return repo;
}

/** Один запрос к ручке приёма. Возвращает код ответа и разобранный JSON. */
export async function запрос(repo, pathname, payload, settings = НАСТРОЙКИ) {
  const ответ = {};
  const принято = await assetIntakeRoute({
    req: {method: 'POST'},
    res: {},
    url: new URL(`http://localhost${pathname}`),
    repo,
    settings,
    тело: async () => payload,
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, code, data) => {
      ответ.code = code;
      ответ.data = data;
    },
  });

  return {принято, ...ответ};
}

export const подготовить = (repo, bytes, article = REL) =>
  запрос(repo, '/api/asset/prepare', {article, base64: Buffer.from(bytes).toString('base64')});

export const уложить = (repo, жетон, article = REL) => запрос(repo, '/api/asset/place', {article, жетон});

export const вернуть = (repo, src, article = REL) => запрос(repo, '/api/asset/withdraw', {article, src});

/** Полный путь: подготовка и укладка, как это делает окно. */
export async function вставить(repo, bytes, article = REL) {
  const готово = await подготовить(repo, bytes, article);
  if (готово.code !== 200) return готово;
  return уложить(repo, готово.data.жетон, article);
}

export const файлы = (repo, статья = 'a') => fs.readdirSync(path.join(repo, 'docs', статья)).sort();
export const карантин = (repo) => {
  const папка = path.join(repo, 'editor', '.tmp');
  return fs.existsSync(папка) ? fs.readdirSync(папка) : [];
};

