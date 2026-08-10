// Имя каждого теста повторяет формулировку правила.
// Запись новой статьи на настоящем диске: что появилось, чего не появилось и что убрано при сбое.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {createArticle} from '../src/adapters/createArticle.mjs';

const RU = 'i18n/ru/docusaurus-plugin-content-docs/current';
const EN = 'docs';

const НАСТРОЙКИ = {
  основнойЯзык: 'ru',
  обязательныйЯзык: 'en',
  // Новая статья рождается скрытой: файлы попадают в репозиторий сразу, и недописанная
  // статья не должна оказаться в меню сайта. Значение — настройка, а не хардкод (SPEC 4.4).
  видимость: {новаяСкрыта: true},
  статусы: ['Черновик', 'Готова к публикации', 'Опубликована'],
  хранение: {файлСостояния: '_state.json'},
  заглушкаПеревода: {заголовок: 'Translation placeholder:', тело: 'Placeholder.', описание: 'Placeholder page.'},
  поляСоздания: {
    docs: {порядок: ['title', 'slug', 'sidebar_label', 'sidebar_position', 'description', 'image', 'unlisted'], значения: {description: ''}},
    blog: {порядок: ['title', 'slug', 'description', 'date', 'authors', 'tags', 'keywords', 'image', 'unlisted'], значения: {description: '', authors: '[ivan]', tags: '[]', keywords: '[]'}},
    проба: {порядок: ['title', 'slug', 'unlisted'], значения: {}},
  },
  контент: [
    {локаль: 'en', род: 'docs', папка: EN, наСайте: true},
    {локаль: 'ru', род: 'docs', папка: RU, наСайте: true},
    {локаль: 'ru', род: 'проба', папка: 'editor/sandbox', наСайте: false},
  ],
};

const песочницы = [];
function репозиторий() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-repo-'));
  песочницы.push(repo);
  // В разделе всегда уже есть хотя бы одна статья: дерево разделов строится из статей,
  // и пустых разделов на сайте не бывает — они роняют сборку.
  for (const корень of [`${RU}/lessons`, `${EN}/lessons`, 'editor/sandbox']) {
    fs.mkdirSync(path.join(repo, корень, 'уже-есть'), {recursive: true});
    fs.writeFileSync(path.join(repo, корень, 'уже-есть/index.mdx'), '---\ntitle: "Уже есть"\n---\n', 'utf8');
  }
  return repo;
}

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

const создать = (repo, правки = {}) => createArticle({
  repo, settings: НАСТРОЙКИ, раздел: 'docs/lessons', название: 'Как ускорить Revit', адрес: '', ...правки,
});

const есть = (repo, ...куски) => fs.existsSync(path.join(repo, ...куски));

describe('создание статьи на диске', () => {
  it('в документации появляются русская статья и английская заглушка', () => {
    const repo = репозиторий();

    const итог = создать(repo);

    expect(итог.path).toBe(`${RU}/lessons/kak-uskorit-revit/index.mdx`);
    expect(есть(repo, RU, 'lessons/kak-uskorit-revit/index.mdx')).toBe(true);
    expect(есть(repo, EN, 'lessons/kak-uskorit-revit/index.mdx')).toBe(true);
  });

  it('у каждой созданной версии есть состояние «черновик»', () => {
    const repo = репозиторий();
    создать(repo);

    for (const корень of [RU, EN]) {
      const состояние = JSON.parse(fs.readFileSync(path.join(repo, корень, 'lessons/kak-uskorit-revit/_state.json'), 'utf8'));
      expect(состояние.готовность).toBe('Черновик');
    }
  });

  it('путь занят — ничего не пишется и не затирается', () => {
    const repo = репозиторий();
    const занятый = path.join(repo, RU, 'lessons/kak-uskorit-revit/index.mdx');
    fs.mkdirSync(path.dirname(занятый), {recursive: true});
    fs.writeFileSync(занятый, 'чужая статья', 'utf8');

    const итог = создать(repo);

    expect(итог.ошибка).toBe('путьЗанят');
    expect(fs.readFileSync(занятый, 'utf8')).toBe('чужая статья');
    expect(есть(repo, EN, 'lessons/kak-uskorit-revit/index.mdx')).toBe(false);
  });

  it('тот же адрес сайта в другой папке — конфликт, а не вторая страница с тем же адресом', () => {
    // Две страницы с одним адресом сайт не соберёт, даже если папки разные.
    const repo = репозиторий();
    const чужая = path.join(repo, RU, 'help/other/index.mdx');
    fs.mkdirSync(path.dirname(чужая), {recursive: true});
    fs.writeFileSync(чужая, '---\ntitle: "Чужая"\nslug: /lessons/kak-uskorit-revit\n---\n', 'utf8');

    const итог = создать(repo);

    expect(итог.ошибка).toBe('адресЗанят');
    expect(есть(repo, RU, 'lessons/kak-uskorit-revit/index.mdx')).toBe(false);
  });

  it('в песочнице создаётся только своя версия, без английской заглушки', () => {
    const repo = репозиторий();

    const итог = создать(repo, {раздел: 'проба', название: 'Проба пера'});

    expect(итог.path).toBe('editor/sandbox/proba-pera/index.mdx');
    expect(есть(repo, EN, 'proba-pera/index.mdx')).toBe(false);
  });

  it('сбой записи не оставляет ни одного созданного файла и ни одной созданной папки', () => {
    // Русская без английской — не половина статьи, а поломка: такой статьи для сайта нет вовсе.
    const repo = репозиторий();
    // На месте будущей папки английской версии лежит файл: создать в ней ничего нельзя.
    fs.writeFileSync(path.join(repo, EN, 'lessons/kak-uskorit-revit'), 'не папка', 'utf8');

    const итог = создать(repo);

    expect(итог.ошибка).toBe('неЗаписалось');
    expect(есть(repo, RU, 'lessons/kak-uskorit-revit/index.mdx')).toBe(false);
    expect(есть(repo, RU, 'lessons/kak-uskorit-revit')).toBe(false);
    // Чужое не тронуто: папка раздела на месте.
    expect(есть(repo, RU, 'lessons')).toBe(true);
  });

  it('раздел с выходом за корень отклоняется, а не пишет мимо репозитория', () => {
    // Путь раздела приходит от клиента: «..» увёл бы запись за пределы репозитория.
    const repo = репозиторий();

    for (const плохой of ['/etc', '', '..']) {
      expect(создать(repo, {раздел: плохой}).ошибка).toBe('плохойРаздел');
    }
    // Выход за корень через «..» внутри рода тоже не проходит.
    expect(создать(repo, {раздел: `${EN}/../../outside`}).ошибка).toBe('плохойРаздел');
    // Чужой корень вроде «C:/Windows» — это просто неизвестный род: полей для него не описано.
    expect(создать(repo, {раздел: 'C:/Windows'}).ошибка).toBe('нетПолейРода');
  });

  it('занятый файл состояния — понятная остановка, а не сбой на середине записи', () => {
    const repo = репозиторий();
    const состояние = path.join(repo, RU, 'lessons/kak-uskorit-revit/_state.json');
    fs.mkdirSync(path.dirname(состояние), {recursive: true});
    fs.writeFileSync(состояние, '{}', 'utf8');

    expect(создать(repo).ошибка).toBe('путьЗанят');
    expect(есть(repo, EN, 'lessons/kak-uskorit-revit/index.mdx')).toBe(false);
  });

  it('адрес занят статьёй, записавшей его без ведущей косой черты, — это тот же адрес', () => {
    // У документации `lessons/foo` и `/lessons/foo` дают один адрес сайта.
    // Чужая статья лежит в корне раздела, поэтому её относительный адрес разворачивается
    // ровно в тот же `/lessons/kak-uskorit-revit`, что и у создаваемой.
    const repo = репозиторий();
    const чужая = path.join(repo, RU, 'other/index.mdx');
    fs.mkdirSync(path.dirname(чужая), {recursive: true});
    fs.writeFileSync(чужая, '---\ntitle: "Чужая"\nslug: lessons/kak-uskorit-revit\n---\n', 'utf8');

    expect(создать(repo).ошибка).toBe('адресЗанят');
  });

  it('раздела нет на диске — новый раздел не создаётся', () => {
    // Пустой раздел роняет сборку сайта, пока в нём нет обложки: это отдельное задание (Б15).
    const repo = репозиторий();

    const итог = создать(repo, {раздел: 'docs/выдуманный'});

    expect(итог.ошибка).toBe('нетРаздела');
    expect(есть(repo, RU, 'выдуманный')).toBe(false);
  });

  it('папка статьи разделом не считается: статья не уезжает внутрь чужой', () => {
    // Иначе новая статья легла бы внутрь существующей и превратила бы её в страницу раздела.
    const repo = репозиторий();
    for (const корень of [RU, EN]) {
      fs.mkdirSync(path.join(repo, корень, 'lessons/foo'), {recursive: true});
      fs.writeFileSync(path.join(repo, корень, 'lessons/foo/index.mdx'), '---\ntitle: "Foo"\n---\n', 'utf8');
    }

    expect(создать(repo, {раздел: 'docs/lessons/foo'}).ошибка).toBe('нетРаздела');
  });

  it('плохой раздел и блог до записи не доходят', () => {
    const repo = репозиторий();

    expect(создать(repo, {раздел: 'scripts'}).ошибка).toBe('нетПолейРода');
    expect(создать(repo, {название: '!!!'}).ошибка).toBe('нетАдреса');
  });
});

describe('статья уже есть в другой локали', () => {
  it('занятый путь в чужой локали — та же статья, а не повод создать вторую', () => {
    // Испанская версия по тому же пути значит, что статья существует: человеку надо открыть её.
    const repo = репозиторий();
    const испанская = path.join(repo, 'i18n/es/docusaurus-plugin-content-docs/current/lessons/kak-uskorit-revit/index.mdx');
    fs.mkdirSync(path.dirname(испанская), {recursive: true});
    fs.writeFileSync(испанская, '---\ntitle: "Ya existe"\n---\n', 'utf8');

    const итог = createArticle({
      repo,
      settings: {...НАСТРОЙКИ, контент: [...НАСТРОЙКИ.контент, {локаль: 'es', род: 'docs', папка: 'i18n/es/docusaurus-plugin-content-docs/current', наСайте: true}]},
      раздел: 'docs/lessons',
      название: 'Как ускорить Revit',
      адрес: '',
    });

    expect(итог.ошибка).toBe('путьЗанят');
    expect(есть(repo, RU, 'lessons/kak-uskorit-revit/index.mdx')).toBe(false);
  });
});
