// Имя каждого теста повторяет формулировку правила.
// Ручки предварительного выпуска: состав файлов и полная сборка. Настоящий сборщик не зовётся —
// он идёт минутами; проверяется то, ЧТО программа делает с его ответом.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {путьСборщика} from '../src/adapters/siteBuild.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
const EN = 'docs/lessons/proba/index.mdx';
const СТАТЬЯ = '---\ntitle: "Проба"\nslug: /lessons/proba\n---\n\nТекст статьи.\n';

const песочницы = [];
function среда(файлы = {[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-release-'));
  песочницы.push(repo);

  for (const [rel, содержимое] of Object.entries(файлы)) {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), содержимое, 'utf8');
  }

  return repo;
}

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Один запрос к ручке. `запуск` подменяет сборщик: настоящая сборка идёт минутами. */
async function запрос(repo, pathname, тело, запуск) {
  const ответы = [];
  const взято = await releaseRoute({
    req: {method: 'POST'},
    res: {},
    url: {pathname},
    repo,
    settings: НАСТРОЙКИ,
    тело: async () => тело,
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, status, payload) => ответы.push({status, payload}),
    запуск,
  });

  return {взято, ...(ответы[0] ?? {})};
}

/** Подставной сборщик: отвечает так же, как `execFile`, но мгновенно. */
const сборщик = ({ошибка = null, stdout = '', stderr = ''} = {}) => (файл, аргументы, опции, готово) => {
  setTimeout(() => готово(ошибка, stdout, stderr), 0);
  return {on: () => {}, аргументы, файл, опции};
};

describe('ручка состава выпуска', () => {
  it('состав называет все языковые версии статьи и причину включения каждой', async () => {
    const {взято, status, payload} = await запрос(среда(), '/api/release', {path: RU});

    expect(взято).toBe(true);
    expect(status).toBe(200);
    expect(payload.файлы.map((файл) => файл.путь)).toEqual([EN, RU]);
    expect(payload.файлы.every((файл) => файл.назначение === 'версия')).toBe(true);
    expect(payload.можно).toBe(true);
  });

  it('картинка из папки статьи входит в состав, а чужой файл соседнего раздела — нет', async () => {
    const repo = среда({
      [RU]: СТАТЬЯ,
      [EN]: СТАТЬЯ,
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/cover.png': 'картинка',
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/other/index.mdx': СТАТЬЯ,
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/other/cover.png': 'чужая картинка',
    });

    const {payload} = await запрос(repo, '/api/release', {path: RU});
    const пути = payload.файлы.map((файл) => файл.путь);

    expect(пути).toContain('i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/cover.png');
    expect(пути.some((путь) => путь.includes('lessons/other'))).toBe(false);
  });

  it('в папке статьи лежит вторая статья — состав объявляется недоказанным, выпуск запрещён', async () => {
    const repo = среда({
      [RU]: СТАТЬЯ,
      [EN]: СТАТЬЯ,
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/сосед.mdx': СТАТЬЯ,
    });

    const {payload} = await запрос(repo, '/api/release', {path: RU});

    expect(payload.можно).toBe(false);
    expect(payload.разрывы[0]).toMatchObject({причина: 'папкаНеОдна'});
  });

  it('путь вне репозитория состава не даёт', async () => {
    const {status, payload} = await запрос(среда(), '/api/release', {path: '../чужое/index.mdx'});

    expect(status).toBe(400);
    expect(payload.файлы).toBeUndefined();
  });

  it('картинки во вложенной папке статьи входят в состав: молчаливая потеря хуже отказа', async () => {
    const repo = среда({
      [RU]: СТАТЬЯ,
      [EN]: СТАТЬЯ,
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/img/один.jpg': 'картинка',
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/img/два.jpg': 'картинка',
    });

    const {payload} = await запрос(repo, '/api/release', {path: RU});
    const пути = payload.файлы.map((файл) => файл.путь);

    expect(пути).toContain('i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/img/один.jpg');
    expect(пути).toContain('i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/img/два.jpg');
    expect(payload.можно).toBe(true);
  });

  it('вторая статья во вложенной папке — тоже неоднозначность: состав не доказан', async () => {
    const repo = среда({
      [RU]: СТАТЬЯ,
      [EN]: СТАТЬЯ,
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/внутри/сосед.mdx': СТАТЬЯ,
    });

    const {payload} = await запрос(repo, '/api/release', {path: RU});

    expect(payload.можно).toBe(false);
  });

  // Перечень этой ручки станет источником `git add`, поэтому заслон стоит здесь, а не в окне.
  const негодные = [
    ['.git/config', 'служебный файл git'],
    ['docs/lessons', 'папка, а не статья'],
    ['docs/lessons/proba/cover.png', 'картинка, а не статья'],
    ['docs/../static/robots.txt', 'выход из корней контента через две точки'],
    ['docs\\lessons\\proba\\index.mdx', 'путь с обратными косыми'],
    ['static/img/logo.png', 'файл вне корней контента'],
  ];
  for (const [путь, чем] of негодные) {
    it(`выпуск не даётся на путь, который не файл статьи сайта: ${чем}`, async () => {
      const repo = среда({
        [RU]: СТАТЬЯ,
        [EN]: СТАТЬЯ,
        '.git/config': 'служебное',
        'docs/lessons/proba/cover.png': 'картинка',
        'static/img/logo.png': 'картинка',
        'static/robots.txt': 'служебное',
      });

      const состав = await запрос(repo, '/api/release', {path: путь});
      expect(состав.status).toBe(400);
      expect(состав.payload.файлы).toBeUndefined();

      // И сборку такой путь не запускает: сборщика не звали ни разу.
      let звали = false;
      const сборка = await запрос(repo, '/api/release/build', {path: путь}, (...аргументы) => {
        звали = true;
        return сборщик()(...аргументы);
      });
      expect(звали).toBe(false);
      expect(сборка.status).toBe(400);
    });
  }
});

describe('ручка полной сборки', () => {
  it('зелёная сборка разрешает переход к подтверждению публикации', async () => {
    const {status, payload} = await запрос(среда(), '/api/release/build', {path: RU}, сборщик());

    expect(status).toBe(200);
    expect(payload.зелёная).toBe(true);
    expect(payload.причина).toBe('');
  });

  it('упавшая сборка не пускает дальше, называет причину и сохраняет вывод сборщика целиком', async () => {
    const вывод = 'Docusaurus build\nошибка сборки: страница не собралась\nподробности где-то тут';
    const {payload} = await запрос(
      среда(), '/api/release/build', {path: RU},
      сборщик({ошибка: Object.assign(new Error('провал'), {code: 1}), stdout: вывод}),
    );

    expect(payload.зелёная).toBe(false);
    expect(payload.вывод).toBe(вывод);
    expect(payload.причина).toContain('ошибка сборки');
  });

  it('сборка, оборванная по пределу времени, называется своим ответом, а не тишиной', async () => {
    const убит = Object.assign(new Error('таймаут'), {killed: true, signal: 'SIGTERM'});
    const {payload} = await запрос(среда(), '/api/release/build', {path: RU}, сборщик({ошибка: убит}));

    expect(payload.зелёная).toBe(false);
    expect(payload.оборвана).toBe(true);
  });

  it('состав не доказан — сборка не запускается вовсе', async () => {
    const repo = среда({
      [RU]: СТАТЬЯ,
      [EN]: СТАТЬЯ,
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/сосед.mdx': СТАТЬЯ,
    });
    let звали = false;

    const {status, payload} = await запрос(repo, '/api/release/build', {path: RU}, (...аргументы) => {
      звали = true;
      return сборщик()(...аргументы);
    });

    expect(звали).toBe(false);
    expect(status).toBe(409);
    expect(payload.error).toBe(НАСТРОЙКИ['ошибкиСервера']['составНеДоказан']);
  });

  it('сборщик зовётся сам собой, без оболочки и прямым путём внутри репозитория', async () => {
    const repo = среда();
    let вызов = null;

    await запрос(repo, '/api/release/build', {path: RU}, (файл, аргументы, опции, готово) => {
      вызов = {файл, аргументы, опции};
      setTimeout(() => готово(null, '', ''), 0);
      return {on: () => {}};
    });

    expect(вызов.файл).toBe(process.execPath);
    expect(вызов.аргументы[0]).toBe(путьСборщика(repo));
    expect(вызов.аргументы).toContain('build');
    // Ключа языка нет намеренно: без него сборщик собирает все локали сайта.
    expect(вызов.аргументы.some((аргумент) => String(аргумент).includes('locale'))).toBe(false);
    expect(вызов.опции.cwd).toBe(repo);
    expect(вызов.опции.timeout).toBe(НАСТРОЙКИ['сборка']['пределМинут'] * 60 * 1000);
  });

  it('ни состав, ни сборка не меняют на диске ни одного байта', async () => {
    const repo = среда();
    const снимок = () => JSON.stringify(fs.readdirSync(path.join(repo, path.dirname(RU)))
      .map((имя) => [имя, fs.readFileSync(path.join(repo, path.dirname(RU), имя), 'utf8')]));
    const до = снимок();

    await запрос(repo, '/api/release', {path: RU});
    await запрос(repo, '/api/release/build', {path: RU}, сборщик());

    expect(снимок()).toBe(до);
  });
});
