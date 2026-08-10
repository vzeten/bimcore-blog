// Имя каждого теста повторяет формулировку правила.
// Видимость как обычная правка шапки: переключил в свойствах, нажал «Сохранить» — поменялось
// во всех существующих языковых версиях. Отдельной ручки видимости в программе нет.
// Обвязка — в `saveHarness.mjs`, общие правила записи файла — в `saveRoute.test.mjs`.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {фиксироватьВнешнюю} from '../src/adapters/externalVersion.mjs';
import {countSnapshots, latestSnapshot, listSnapshots, snapshotText} from '../src/adapters/draftStore.mjs';
import {EN, ES, RU, НАСТРОЙКИ, подготовить, прочитать, сохранить, статья, убратьПесочницы} from './saveHarness.mjs';

afterEach(убратьПесочницы);

describe('видимость меняется обычным сохранением', () => {
  it('переключил видимость и сохранил — unlisted поменялся во всех существующих языковых версиях', async () => {
    const среда = await подготовить({
      [RU]: статья('title: A'),
      [EN]: статья('title: A'),
    });

    const ответ = await сохранить(среда, {rel: RU, шапка: 'title: A\nunlisted: true'});

    expect(ответ.code).toBe(200);
    expect(прочитать(среда, RU)).toContain('unlisted: true');
    expect(прочитать(среда, EN)).toContain('unlisted: true');
    expect(ответ.data['видимость']).toEqual({переключены: [EN], неПереключены: []});
  });

  it('несуществующая языковая версия не создаётся: едут только те, что уже есть на диске', async () => {
    // Испанской версии у новых статей нет вовсе, и это нормальное состояние сайта.
    const среда = await подготовить({[RU]: статья('title: A'), [EN]: статья('title: A')});

    await сохранить(среда, {rel: RU, шапка: 'title: A\nunlisted: true'});

    expect(fs.existsSync(path.join(среда.repo, ES))).toBe(false);
  });

  it('снятая видимость убирает строку unlisted из всех языковых версий', async () => {
    const среда = await подготовить({
      [RU]: статья('title: A\nunlisted: true'),
      [EN]: статья('title: A\nunlisted: true'),
    });

    await сохранить(среда, {rel: RU, шапка: 'title: A'});

    expect(прочитать(среда, RU)).not.toContain('unlisted');
    expect(прочитать(среда, EN)).not.toContain('unlisted');
  });

  it('правка текста без смены видимости соседние версии не трогает ни записью, ни версией в истории', async () => {
    // Иначе «открыл и сохранил — ни байта» перестало бы держаться для соседей (SPEC 5.1).
    const среда = await подготовить({
      [RU]: статья('title: A\nunlisted: true'),
      [EN]: статья('title: A\nunlisted: true'),
    });
    const былоEN = прочитать(среда, EN);

    const ответ = await сохранить(среда, {rel: RU, шапка: 'title: A\nunlisted: true', тело: '\nдругой текст\n'});

    // Текст человека обязан доехать до файла: сохранение пишет то, что в окне, а не то, что было.
    expect(прочитать(среда, RU)).toContain('другой текст');
    expect(прочитать(среда, EN)).toBe(былоEN);
    expect(countSnapshots(среда.editorDir, НАСТРОЙКИ, EN)).toBe(0);
    expect(ответ.data['видимость']).toEqual({переключены: [], неПереключены: []});
  });

  it('у соседней версии меняется только строка видимости: переводы строк, метка и текст остаются байт-в-байт', async () => {
    const метка = '﻿';
    const enТекст = `${метка}---\r\ntitle: A\r\nimage: ./cover.png\r\n---\r\n\r\nтекст статьи\r\n`;
    const среда = await подготовить({[RU]: статья('title: A'), [EN]: enТекст});

    await сохранить(среда, {rel: RU, шапка: 'title: A\nunlisted: true'});

    expect(прочитать(среда, EN)).toBe(
      `${метка}---\r\ntitle: A\r\nimage: ./cover.png\r\nunlisted: true\r\n---\r\n\r\nтекст статьи\r\n`,
    );
  });

  it('своя запись в соседнюю версию ложится в историю, а не остаётся чужой правкой', async () => {
    // Без этого следующее обращение видит, что файл разошёлся с последним снимком, и записывает
    // работу самой программы как внешнюю — в ленте появляется версия с автором «Неизвестный».
    const среда = await подготовить({[RU]: статья('title: A'), [EN]: статья('title: A')});

    await сохранить(среда, {rel: RU, шапка: 'title: A\nunlisted: true'});

    const снимок = latestSnapshot(среда.editorDir, НАСТРОЙКИ, EN);
    expect(снимок.автор).toBe('Хозяин');
    expect(snapshotText(среда.editorDir, НАСТРОЙКИ, EN, снимок['имя'])).toContain('unlisted: true');
  });

  it('чужая правка соседней версии ложится в историю до того, как её перепишет видимость', async () => {
    // Фиксация настоящая, а не подменённая: доказывается результат — в истории соседа лежат
    // две версии по порядку, сначала чужой текст, потом наш. Иначе чужая правка исчезла бы
    // насовсем: в git её нет.
    const среда = await подготовить({[RU]: статья('title: A'), [EN]: статья('title: A')});
    const внешний = статья('title: A', '\nдописал ИИ\n');
    fs.writeFileSync(path.join(среда.repo, EN), внешний, 'utf8');

    await сохранить(среда, {
      rel: RU,
      шапка: 'title: A\nunlisted: true',
      фиксировать: (rel, обязательно) => фиксироватьВнешнюю({
        editorDir: среда.editorDir,
        repo: среда.repo,
        settings: НАСТРОЙКИ,
        git: среда.git,
        ref: 'HEAD',
        rel,
        обязательно,
      }),
    });

    // Снимки лежат по времени в имени, поэтому порядок в списке — это и есть порядок записи.
    const тексты = listSnapshots(среда.editorDir, НАСТРОЙКИ, EN)
      .map((имя) => snapshotText(среда.editorDir, НАСТРОЙКИ, EN, имя));

    expect(тексты).toHaveLength(2);
    expect(тексты[0]).toBe(внешний);
    expect(тексты[0]).not.toContain('unlisted');
    expect(тексты[1]).toContain('дописал ИИ');
    expect(тексты[1]).toContain('unlisted: true');
    expect(прочитать(среда, EN)).toBe(тексты[1]);
  });

  it('переключённая соседняя версия возвращается в черновик: её шапку изменили', async () => {
    // Правило у правки одно на все версии. Иначе английская версия осталась бы «Готова
    // к публикации», хотя готовили её с другой видимостью.
    const среда = await подготовить({[RU]: статья('title: A'), [EN]: статья('title: A')});
    const состояние = path.join(среда.repo, path.dirname(EN), '_state.json');
    fs.writeFileSync(состояние, JSON.stringify({готовность: 'Готова к публикации', нити: []}), 'utf8');

    await сохранить(среда, {rel: RU, шапка: 'title: A\nunlisted: true'});

    expect(JSON.parse(fs.readFileSync(состояние, 'utf8'))['готовность']).toBe('Черновик');
  });

  it('нетронутая соседняя версия готовность не теряет: её файл никто не менял', async () => {
    const среда = await подготовить({
      [RU]: статья('title: A\nunlisted: true'),
      [EN]: статья('title: A\nunlisted: true'),
    });
    const состояние = path.join(среда.repo, path.dirname(EN), '_state.json');
    fs.writeFileSync(состояние, JSON.stringify({готовность: 'Готова к публикации', нити: []}), 'utf8');

    await сохранить(среда, {rel: RU, шапка: 'title: A\nunlisted: true', тело: '\nдругой текст\n'});

    expect(JSON.parse(fs.readFileSync(состояние, 'utf8'))['готовность']).toBe('Готова к публикации');
  });

  it('соседняя версия уже в нужной видимости не трогается, даже если у неё windows-переводы строк', async () => {
    // Сравнивать строки шапки нельзя: сборка возвращает переводы строк к unix-виду, и файл
    // с той же видимостью выглядел бы изменённым. Ценой были бы лишний снимок в истории
    // и слетевшая в «Черновик» готовность соседа, которого никто не трогал.
    const enТекст = '---\r\ntitle: A\r\nimage: ./cover.png\r\n---\r\n\r\nтекст статьи\r\n';
    const среда = await подготовить({[RU]: статья('title: A\nunlisted: true'), [EN]: enТекст});
    const состояние = path.join(среда.repo, path.dirname(EN), '_state.json');
    fs.writeFileSync(состояние, JSON.stringify({готовность: 'Готова к публикации', нити: []}), 'utf8');

    const ответ = await сохранить(среда, {rel: RU, шапка: 'title: A'});

    expect(прочитать(среда, EN)).toBe(enТекст);
    expect(countSnapshots(среда.editorDir, НАСТРОЙКИ, EN)).toBe(0);
    expect(JSON.parse(fs.readFileSync(состояние, 'utf8'))['готовность']).toBe('Готова к публикации');
    expect(ответ.data['видимость']).toEqual({переключены: [], неПереключены: []});
  });

  it('у соседней версии без шапки видимость не появляется: чужой файл не обрастает шапкой молча', async () => {
    const безШапки = '# Заголовок\n\nтекст без шапки\n';
    const среда = await подготовить({[RU]: статья('title: A'), [EN]: безШапки});

    const ответ = await сохранить(среда, {rel: RU, шапка: 'title: A\nunlisted: true'});

    expect(прочитать(среда, EN)).toBe(безШапки);
    expect(ответ.data['видимость']).toEqual({переключены: [], неПереключены: [EN]});
  });

  it('не удалось записать версию соседа — его файл не трогается вовсе, а человеку называют язык', async () => {
    // Чужая правка иначе исчезнет насовсем: в git её нет.
    const среда = await подготовить({[RU]: статья('title: A'), [EN]: статья('title: A')});
    const былоEN = прочитать(среда, EN);

    const ответ = await сохранить(среда, {
      rel: RU,
      шапка: 'title: A\nunlisted: true',
      фиксировать: async (rel) => {
        if (rel === EN) throw new Error('хранилище недоступно');
      },
    });

    expect(ответ.code).toBe(200);
    expect(прочитать(среда, RU)).toContain('unlisted: true');
    expect(прочитать(среда, EN)).toBe(былоEN);
    expect(ответ.data['видимость']).toEqual({переключены: [], неПереключены: [EN]});
  });

  it('сохранение поверх внешней правки видимости переключает и соседей: побеждает то, что человек видит в окне', async () => {
    // Поведение названо сознательно: «Сохранить поверх» значит «моё окно главнее», и видимость
    // из окна становится видимостью всей статьи. Человеку это говорится списком языков в ответе.
    const среда = await подготовить({
      [RU]: статья('title: A\nunlisted: true'),
      [EN]: статья('title: A\nunlisted: true'),
    });
    // Снаружи статью скрыли обратно, пока человек работал с открытой в окне видимой версией.
    fs.writeFileSync(path.join(среда.repo, RU), статья('title: A\nunlisted: true', '\nчужая правка\n'), 'utf8');

    const ответ = await сохранить(среда, {rel: RU, шапка: 'title: A', тело: '\nмой текст\n', поверх: true});

    expect(прочитать(среда, RU)).not.toContain('unlisted');
    expect(прочитать(среда, EN)).not.toContain('unlisted');
    expect(ответ.data['видимость']).toEqual({переключены: [EN], неПереключены: []});
  });

  it('открыл и сохранил без правок — ни файл, ни соседние версии не меняются', async () => {
    for (const шапка of ['title: A', 'title: A\nunlisted: false', 'title: A\nunlisted: true']) {
      const среда = await подготовить({[RU]: статья(шапка), [EN]: статья(шапка)});
      const былоRU = прочитать(среда, RU);
      const былоEN = прочитать(среда, EN);

      const ответ = await сохранить(среда, {rel: RU, шапка});

      expect(ответ.data['untouched'], шапка).toBe(true);
      expect(прочитать(среда, RU), шапка).toBe(былоRU);
      expect(прочитать(среда, EN), шапка).toBe(былоEN);
    }
  });

  it('статья вне сайта соседей не имеет: песочница живёт в одной локали', async () => {
    const среда = await подготовить({'editor/sandbox/proba/index.mdx': статья('title: A')});

    const ответ = await сохранить(среда, {rel: 'editor/sandbox/proba/index.mdx', шапка: 'title: A\nunlisted: true'});

    expect(ответ.data['видимость']).toEqual({переключены: [], неПереключены: []});
    expect(прочитать(среда, 'editor/sandbox/proba/index.mdx')).toContain('unlisted: true');
  });
});
