// Имя каждого теста повторяет формулировку правила.
// Запись новой статьи на настоящем диске: что появилось, чего не появилось и что убрано при сбое.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {createArticle} from '../src/adapters/createArticle.mjs';

import {EN, ES, RU, НАСТРОЙКИ} from './newArticleHarness.mjs';

const песочницы = [];
function репозиторий() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-repo-'));
  песочницы.push(repo);
  // В разделе всегда уже есть хотя бы одна статья: дерево разделов строится из статей,
  // и пустых разделов на сайте не бывает — они роняют сборку.
  for (const корень of [`${RU}/lessons`, `${EN}/lessons`, `${ES}/lessons`, 'editor/sandbox']) {
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
  it('в документации появляются русская статья и скрытые заглушки остальных языков сайта', () => {
    const repo = репозиторий();

    const итог = создать(repo);

    expect(итог.path).toBe(`${RU}/lessons/kak-uskorit-revit/index.mdx`);
    for (const корень of [RU, EN, ES]) {
      expect(есть(repo, корень, 'lessons/kak-uskorit-revit/index.mdx')).toBe(true);
    }
  });

  it('раздела нет в языке заглушки — папка создаётся вместе с ней, а не отказ', () => {
    // Так живут «Семейства» и «Справка», которых в испанской папке нет вовсе. Сборка сайта такую
    // папку принимает: со скрытой заглушкой она уже не пустая (проверено сборкой 2026-08-20).
    const repo = репозиторий();
    fs.rmSync(path.join(repo, ES, 'lessons'), {recursive: true, force: true});

    const итог = создать(repo);

    expect(итог.ошибка).toBe(undefined);
    expect(есть(repo, ES, 'lessons/kak-uskorit-revit/index.mdx')).toBe(true);
  });

  it('текст заглушки написан на языке своей страницы, а не на языке исходной версии', () => {
    const repo = репозиторий();
    создать(repo);

    const испанская = fs.readFileSync(path.join(repo, ES, 'lessons/kak-uskorit-revit/index.mdx'), 'utf8');
    expect(испанская).toContain('Marcador de traducción:');
    expect(испанская).not.toContain('Translation placeholder:');
  });

  it('созданные версии названы все до одной: каждой нужен свой первый снимок истории', () => {
    // Снимок делается по этому перечню. Верни он одну открытую версию — реестр подписал бы
    // заглушки «Неизвестный», а при первом открытии счёл бы их содержимое чужой правкой.
    const repo = репозиторий();

    const итог = создать(repo);

    expect(итог.версии.sort()).toEqual([
      `${EN}/lessons/kak-uskorit-revit/index.mdx`,
      `${ES}/lessons/kak-uskorit-revit/index.mdx`,
      `${RU}/lessons/kak-uskorit-revit/index.mdx`,
    ].sort());
  });

  it('у каждой созданной версии есть состояние «черновик»', () => {
    const repo = репозиторий();
    создать(repo);

    for (const корень of [RU, EN, ES]) {
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

  it('запись оборвалась на середине последнего файла — не остаётся ни одного файла статьи', () => {
    // Файл, начатый и недописанный, — та же статья-калека: половина версий на диске, читатель
    // получает поломанную страницу. Откат обязан убрать и его, а не только дописанные до конца.
    const repo = репозиторий();
    const настоящая = fs.writeFileSync;
    let записей = 0;
    const шпион = vi.spyOn(fs, 'writeFileSync').mockImplementation((цель, данные, настройки) => {
      записей += 1;
      if (записей !== 3) return настоящая(цель, данные, настройки);
      // Третий файл заводится и получает кусок содержимого, а дальше запись обрывается: так
      // выглядит кончившееся место на диске. Файл при этом на диске остаётся.
      настоящая(цель, String(данные).slice(0, 12), настройки);
      throw new Error('место на диске кончилось');
    });

    const итог = создать(repo);

    шпион.mockRestore();
    expect(итог.ошибка).toBe('неЗаписалось');
    for (const корень of [RU, EN, ES]) {
      expect(есть(repo, корень, 'lessons/kak-uskorit-revit/index.mdx')).toBe(false);
      expect(есть(repo, корень, 'lessons/kak-uskorit-revit')).toBe(false);
      // Чужое не тронуто: папка раздела и соседняя статья на месте.
      expect(есть(repo, корень, 'lessons/уже-есть/index.mdx')).toBe(true);
    }
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

  it('папка, исчезнувшая посреди обхода, не роняет создание стеком', () => {
    // Между обходом раздела и заходом в его подпапку папку могли удалить — своей рукой, git-ом
    // или уборкой. Ответ тот же, что у соседней проверки на нечитаемую папку: статей в ней нет
    // (SPEC 4.12), человек видит «нет раздела», а не падение программы.
    const repo = репозиторий();
    const пропала = path.join(repo, RU, 'lessons/уже-есть');
    const настоящий = fs.readdirSync;
    const шпион = vi.spyOn(fs, 'readdirSync').mockImplementation((dir, ...прочее) => {
      if (path.resolve(String(dir)) === path.resolve(пропала)) throw new Error('ENOENT');
      return настоящий(dir, ...прочее);
    });

    try {
      expect(создать(repo).ошибка).toBe('нетРаздела');
    } finally {
      шпион.mockRestore();
    }
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
