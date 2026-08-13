// Имя каждого теста повторяет формулировку правила.
// Ручка подготовки проверяется поведением: что ответил сервер и что стало с файлами на диске.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {prepareRoute} from '../src/adapters/prepareRoute.mjs';

const НАСТРОЙКИ = JSON.parse(
  fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..', 'settings.json'), 'utf8'),
);

const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
const EN = 'docs/lessons/proba/index.mdx';

const шапкаRU = [
  'title: "Проба"', 'slug: /lessons/proba', 'description: "Понятное описание статьи"',
  'keywords: [розетки]',
].join('\n');
const шапкаEN = 'title: "Заглушка"\nslug: /lessons/proba\ndescription: "Placeholder"\nunlisted: true';

const песочницы = [];
function песочница() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-prepare-'));
  песочницы.push(dir);
  return dir;
}

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Репозиторий с одной статьёй в двух языковых версиях. */
function среда(шапки = {}) {
  const repo = песочница();
  const тексты = {[RU]: шапки[RU] ?? шапкаRU, [EN]: шапки[EN] ?? шапкаEN};

  for (const [rel, шапка] of Object.entries(тексты)) {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), `---\n${шапка}\n---\n\nТекст статьи.\n`, 'utf8');
  }

  return repo;
}

/** Свод статей в том виде, в каком его отдаёт сервер: ручке нужны только пути версий и категория. */
const свод = () => [{
  category: 'урок',
  наСайте: true,
  versions: {
    ru: {path: RU, скрыта: false, готовность: null, когда: 0},
    en: {path: EN, скрыта: true, готовность: null, когда: 0},
  },
}];

/** Один запрос к ручке. Возвращает то, чем сервер ответил. */
async function запрос(repo, тело, articles = свод) {
  const ответы = [];
  const взято = await prepareRoute({
    req: {method: 'POST'},
    res: {},
    url: {pathname: '/api/prepare'},
    repo,
    settings: НАСТРОЙКИ,
    тело: async () => тело,
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, status, payload) => ответы.push({status, payload}),
    articles: async () => articles(),
  });

  return {взято, ...(ответы[0] ?? {})};
}

/** Отпечатки всех файлов дерева: по ним видно, тронула ли ручка хоть один байт. */
function снимокДиска(repo) {
  const обход = (папка) => fs.readdirSync(папка, {withFileTypes: true}).flatMap((вход) => {
    const полный = path.join(папка, вход.name);
    return вход.isDirectory() ? обход(полный) : [[полный, fs.readFileSync(полный, 'utf8')]];
  });

  return JSON.stringify(обход(repo).sort());
}

describe('ручка подготовки статьи', () => {
  it('здоровая статья проходит подготовку: препятствий нет', async () => {
    const {взято, status, payload} = await запрос(среда(), {path: RU});

    expect(взято).toBe(true);
    expect(status).toBe(200);
    expect(payload.прошла).toBe(true);
    // Ни одного блокера. Предупреждения у английской заглушки законны: ключевых слов у неё нет,
    // и выпуск это не останавливает (слово владельца 2026-08-11).
    expect(payload.находки.filter((находка) => находка.уровень === 'блокер')).toEqual([]);
  });

  it('подготовка не меняет на диске ни одного байта', async () => {
    const repo = среда({[RU]: `${шапкаRU}\nsidebar_position: два`});
    const до = снимокДиска(repo);

    const {payload} = await запрос(repo, {path: RU});

    expect(payload.прошла).toBe(false);
    expect(снимокДиска(repo)).toBe(до);
  });

  it('находка называет путь языковой версии и поле: человеку есть куда идти', async () => {
    const repo = среда({[RU]: 'title: "Проба"\nslug: /lessons/proba\ndescription: ""\nkeywords: [розетки]'});

    const {payload} = await запрос(repo, {path: RU});
    const пустое = payload.находки.filter((находка) => находка.код === 'описаниеПусто');

    expect(пустое).toHaveLength(1);
    expect(пустое[0]).toMatchObject({путь: RU, поле: 'description'});
  });

  it('подготовка судит обо всей статье, а не об одной открытой версии', async () => {
    // Спрашиваем про русскую версию, а описание пусто у английской: находка обязана прийти.
    const repo = среда({[EN]: 'title: "Заглушка"\nslug: /lessons/proba\ndescription: ""\nunlisted: true'});

    const {payload} = await запрос(repo, {path: RU});

    expect(payload.находки.some((находка) => находка.путь === EN)).toBe(true);
  });

  it('отчёт честно называет этапы, которые не выполнялись вовсе', async () => {
    const {payload} = await запрос(среда(), {path: RU});

    expect(payload.невыполненные).toEqual(['качество', 'сборка']);
  });

  it('подготовка статьи, которой нет в своде, отвечает «нет такой статьи», а не зелёным вердиктом', async () => {
    const repo = среда();

    const {status, payload} = await запрос(repo, {path: RU}, () => []);

    expect(status).toBe(404);
    expect(payload.error).toBe(НАСТРОЙКИ['ошибкиСервера']['нетСтатьи']);
    expect(payload.прошла).toBeUndefined();
  });

  it('путь вне репозитория подготовку не запускает', async () => {
    const {status, payload} = await запрос(среда(), {path: '../чужое/index.mdx'});

    expect(status).toBe(400);
    expect(payload.прошла).toBeUndefined();
  });

  it('тело без пути — плохой запрос, а не внутренняя ошибка', async () => {
    const {status} = await запрос(среда(), {});

    expect(status).toBe(400);
  });

  it('запрос не к этой ручке ручка не берёт', async () => {
    const ответы = [];
    const взято = await prepareRoute({
      req: {method: 'GET'},
      url: {pathname: '/api/articles'},
      res: {},
      repo: среда(),
      settings: НАСТРОЙКИ,
      тело: async () => ({}),
      insideRepo: () => true,
      send: (res, status, payload) => ответы.push({status, payload}),
      articles: async () => свод(),
    });

    expect(взято).toBe(false);
    expect(ответы).toHaveLength(0);
  });
});
