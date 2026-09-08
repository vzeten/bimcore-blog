// Имя каждого теста повторяет формулировку правила.
// Проверка на настоящем диске: перенос старого хранилища в общее (SPEC 7.1.5).
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {перенестиХранилище} from '../src/adapters/draftMigrate.mjs';
import {countSnapshots, listSnapshots, loadDraft, saveDraft, saveSnapshot, snapshotText} from '../src/adapters/draftStore.mjs';
import {draftName, newDraft, writeDraft} from '../src/core/drafts.mjs';
import {historyFolder, snapshotName} from '../src/core/history.mjs';

const REL = 'i18n/ru/docusaurus-plugin-content-docs/current/beds/index.mdx';
const НАСТРОЙКИ = {
  хранение: {
    папкаЧерновиков: '.drafts', папкаСпоров: '.drafts-споры', папкаСнимков: '.history', снимковНаВерсию: 2,
  },
  ошибкиСервера: {споренЧерновик: 'Разные старые черновики. Папка {папка}'},
};

const песочницы = [];
function песочница(имя) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), имя));
  песочницы.push(dir);
  return dir;
}

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Корень материалов владельца и папка редактора той копии КОДА, из которой раньше поднимали сервер. */
function среда() {
  return {корень: песочница('editor-repo-'), код: песочница('editor-code-')};
}

// Прежняя логика хранилища, слово в слово: имя файла то же, а папка — от места КОДА.
// Так писала версия до этого правила, и именно её наследство перенос обязан подобрать.
function старыйЧерновик(код, rel, тело) {
  const dir = path.join(код, НАСТРОЙКИ['хранение']['папкаЧерновиков']);
  fs.mkdirSync(dir, {recursive: true});
  const черновик = newDraft({
    path: rel, frontmatterRaw: 'title: Кровати', body: тело, отпечатокБазы: 'ОТП', когда: '2026-09-07T20:00:00.000Z',
  });
  fs.writeFileSync(path.join(dir, draftName(rel)), writeDraft(черновик), 'utf8');
}

function старыйСнимок(код, rel, текст, автор, iso) {
  const dir = path.join(код, НАСТРОЙКИ['хранение']['папкаСнимков'], historyFolder(rel));
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, snapshotName(iso, автор)), текст, 'utf8');
}

const перенос = (с, испытательный = false) => перенестиХранилище({
  repo: с.корень, кодDir: с.код, settings: НАСТРОЙКИ, испытательный,
});

/** Все файлы папки с их байтами: по этому слепку видно, тронул ли перенос старое хранилище. */
function слепок(dir, корень = dir, итог = new Map()) {
  if (!fs.existsSync(dir)) return итог;
  for (const запись of fs.readdirSync(dir, {withFileTypes: true})) {
    const полный = path.join(dir, запись.name);
    if (запись.isDirectory()) слепок(полный, корень, итог);
    else итог.set(path.relative(корень, полный), fs.readFileSync(полный).toString('base64'));
  }
  return итог;
}

const споры = (с) => слепок(path.join(с.корень, 'editor', НАСТРОЙКИ['хранение']['папкаСпоров']));
const черновики = (с) => слепок(path.join(с.корень, 'editor', НАСТРОЙКИ['хранение']['папкаЧерновиков']));

describe('перенос старого хранилища в общее', () => {
  it('единственный старый черновик виден новой версии по корню материалов', () => {
    const с = среда();
    старыйЧерновик(с.код, REL, 'незаписанный текст владельца');

    const отчёт = перенос(с);

    expect(отчёт['черновиков']).toBe(1);
    expect(loadDraft(с.корень, НАСТРОЙКИ, REL)['body']).toBe('незаписанный текст владельца');
  });

  it('старое хранилище после переноса цело байт в байт: оно только читается', () => {
    const с = среда();
    старыйЧерновик(с.код, REL, 'незаписанный текст владельца');
    старыйСнимок(с.код, REL, 'старое состояние', 'Хозяин', '2026-09-06T10:00:00.000Z');
    const было = слепок(с.код);

    перенос(с);

    expect(слепок(с.код)).toEqual(было);
  });

  it('повтор переноса ничего не добавляет: одинаковое сводится по байтам', () => {
    const с = среда();
    старыйЧерновик(с.код, REL, 'незаписанный текст владельца');
    старыйСнимок(с.код, REL, 'старое состояние', 'Хозяин', '2026-09-06T10:00:00.000Z');

    перенос(с);
    const послеПервого = {черновики: черновики(с), снимков: countSnapshots(с.корень, НАСТРОЙКИ, REL)};
    const второй = перенос(с);

    expect(второй['черновиков']).toBe(0);
    expect(второй['снимков']).toBe(0);
    expect(черновики(с)).toEqual(послеПервого.черновики);
    expect(countSnapshots(с.корень, НАСТРОЙКИ, REL)).toBe(послеПервого.снимков);
  });

  it('предел числа снимков при переносе не применяется: история не обрезается по дороге', () => {
    const с = среда();
    for (const час of ['10', '11', '12', '13']) {
      старыйСнимок(с.код, REL, `состояние ${час}`, 'Хозяин', `2026-09-06T${час}:00:00.000Z`);
    }

    перенос(с);

    // В настройках предел равен двум, но перенос — не уборка.
    expect(countSnapshots(с.корень, НАСТРОЙКИ, REL)).toBe(4);
  });

  it('испытательный экземпляр не переносит ничего и черновика владельца не видит', () => {
    const с = среда();
    старыйЧерновик(с.код, REL, 'незаписанный текст владельца');

    const отчёт = перенос(с, true);

    expect(отчёт['перенос']).toBe(false);
    expect(loadDraft(с.корень, НАСТРОЙКИ, REL)).toBe(null);
    expect(черновики(с).size).toBe(0);
  });
});

describe('разные старые черновики одной версии', () => {
  /** В общем хранилище уже лежит своя работа, а в старом — другая. */
  function спорнаяСреда() {
    const с = среда();
    saveDraft(с.корень, НАСТРОЙКИ, newDraft({
      path: REL, frontmatterRaw: 'title: Кровати', body: 'работа общего хранилища',
      отпечатокБазы: 'ОТП', когда: '2026-09-08T09:00:00.000Z',
    }));
    старыйЧерновик(с.код, REL, 'другая незаписанная работа');
    return с;
  }

  it('ни один вариант не выбирается и не сливается: сохраняются оба', () => {
    const с = спорнаяСреда();

    const отчёт = перенос(с);

    expect(отчёт['споров']).toBe(1);
    expect(loadDraft(с.корень, НАСТРОЙКИ, REL)['body']).toBe('работа общего хранилища');
    const отложенные = [...споры(с).values()].map((байты) => Buffer.from(байты, 'base64').toString('utf8'));
    expect(отложенные).toHaveLength(1);
    expect(отложенные[0]).toContain('другая незаписанная работа');
  });

  it('опасная запись останавливается понятным текстом до разбора спора', () => {
    const с = спорнаяСреда();
    перенос(с);

    const запись = () => saveDraft(с.корень, НАСТРОЙКИ, newDraft({
      path: REL, frontmatterRaw: 'title: Кровати', body: 'поверх спора', отпечатокБазы: 'ОТП',
      когда: '2026-09-08T10:00:00.000Z',
    }));

    expect(запись).toThrow(/Разные старые черновики/);
    // Ни один вариант не пострадал.
    expect(loadDraft(с.корень, НАСТРОЙКИ, REL)['body']).toBe('работа общего хранилища');
  });

  it('разобранный спор снимает запрет: программа снова пишет черновик', () => {
    const с = спорнаяСреда();
    перенос(с);
    fs.rmSync(path.join(с.корень, 'editor', НАСТРОЙКИ['хранение']['папкаСпоров']), {recursive: true, force: true});

    saveDraft(с.корень, НАСТРОЙКИ, newDraft({
      path: REL, frontmatterRaw: 'title: Кровати', body: 'после разбора', отпечатокБазы: 'ОТП',
      когда: '2026-09-08T10:00:00.000Z',
    }));

    expect(loadDraft(с.корень, НАСТРОЙКИ, REL)['body']).toBe('после разбора');
  });

  it('повтор переноса спора не плодит вторую копию, но о неразобранном споре молчать нельзя', () => {
    const с = спорнаяСреда();
    const первый = перенос(с);
    const было = споры(с);

    const второй = перенос(с);

    // Файлов не прибавилось, но спор стоит на месте, и повтор обязан назвать его снова:
    // «совпало по байтам» здесь означало бы, что разбирать нечего.
    expect(второй['споров']).toBe(1);
    expect(второй['спорные']).toEqual(первый['спорные']);
    expect(споры(с)).toEqual(было);
  });

  it('совпавший путь истории с разными байтами не перезаписывается', () => {
    const с = среда();
    const когда = '2026-09-06T10:00:00.000Z';
    saveSnapshot(с.корень, НАСТРОЙКИ, REL, 'состояние общего хранилища', 'Хозяин', когда);
    const имяВОбщем = listSnapshots(с.корень, НАСТРОЙКИ, REL)[0];
    старыйСнимок(с.код, REL, 'другое состояние того же мгновения', 'Хозяин', когда);

    перенос(с);

    expect(snapshotText(с.корень, НАСТРОЙКИ, REL, имяВОбщем)).toBe('состояние общего хранилища');
    const тексты = listSnapshots(с.корень, НАСТРОЙКИ, REL).map((имя) => snapshotText(с.корень, НАСТРОЙКИ, REL, имя));
    expect(тексты).toContain('другое состояние того же мгновения');
    expect(тексты).toHaveLength(2);
  });
});

describe('две копии кода на одном корне материалов', () => {
  /** Копия ПРОГРАММЫ в своей папке: другой путь кода, тот же корень материалов. */
  function копияКода(имя) {
    const dir = песочница(имя);
    fs.cpSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src'), path.join(dir, 'src'), {recursive: true});
    return import(pathToFileURL(path.join(dir, 'src', 'adapters', 'draftStore.mjs')).href);
  }

  it('черновик, записанный из одного пути кода, читается из другого без переноса', async () => {
    const корень = песочница('editor-repo-');
    const A = await копияКода('editor-codeA-');
    const B = await копияКода('editor-codeB-');

    A.saveDraft(корень, НАСТРОЙКИ, newDraft({
      path: REL, frontmatterRaw: 'title: Кровати', body: 'текст из первой копии кода',
      отпечатокБазы: 'ОТП', когда: '2026-09-08T09:00:00.000Z',
    }));

    expect(B.loadDraft(корень, НАСТРОЙКИ, REL)['body']).toBe('текст из первой копии кода');
  });

  it('снимок, положенный из одного пути кода, виден ленте другого', async () => {
    const корень = песочница('editor-repo-');
    const A = await копияКода('editor-codeA-');
    const B = await копияКода('editor-codeB-');

    A.saveSnapshot(корень, НАСТРОЙКИ, REL, 'состояние из первой копии', 'Хозяин', '2026-09-06T10:00:00.000Z');

    expect(B.listSnapshots(корень, НАСТРОЙКИ, REL)).toHaveLength(1);
  });

  it('испытательный корень второй копии своего состояния владельцу не показывает', async () => {
    const владелец = песочница('editor-repo-');
    const проба = песочница('editor-trial-');
    const A = await копияКода('editor-codeA-');

    A.saveDraft(проба, НАСТРОЙКИ, newDraft({
      path: REL, frontmatterRaw: 'title: Кровати', body: 'испытательная работа',
      отпечатокБазы: 'ОТП', когда: '2026-09-08T09:00:00.000Z',
    }));

    expect(A.loadDraft(владелец, НАСТРОЙКИ, REL)).toBe(null);
  });
});
