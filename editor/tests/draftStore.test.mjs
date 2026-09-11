// Имя каждого теста повторяет формулировку правила.
// Проверка на настоящем диске: черновики и снимки должны лежать вне контента и вне git.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {countSnapshots, dropDraft, fingerprint, latestSnapshot, loadDraft, saveDraft, saveSnapshot, snapshotText} from '../src/adapters/draftStore.mjs';
import {newDraft, writeDraft} from '../src/core/drafts.mjs';
import {historyFolder} from '../src/core/history.mjs';

const НАСТРОЙКИ = {
  хранение: {папкаЧерновиков: '.drafts', папкаСпоров: '.drafts-споры', папкаСнимков: '.history', папкаСведения: '.сведение', черновикЖивётДней: 14, снимковНаВерсию: 3},
};

/** Хранилище программы: папка редактора ВНУТРИ материалов (SPEC 7.1.5), а не папка кода. */
const хранилище = (корень) => path.join(корень, 'editor');

const песочницы = [];
function песочница() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-drafts-'));
  песочницы.push(dir);
  return dir;
}

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

const черновик = (over = {}) => newDraft({
  path: 'docs/a/index.mdx',
  frontmatterRaw: 'title: A',
  body: 'текст черновика',
  отпечатокБазы: 'ОТП1',
  когда: new Date().toISOString(),
  ...over,
});

describe('хранилище черновиков', () => {
  it('автосохранение пишет черновик в папку редактора, а не рядом со статьёй', () => {
    const dir = песочница();
    saveDraft(dir, НАСТРОЙКИ, черновик());

    const файлы = fs.readdirSync(path.join(хранилище(dir), '.drafts'));
    expect(файлы).toHaveLength(1);
    // Ни одного файла не появилось вне служебной папки.
    expect(fs.readdirSync(dir)).toEqual(['editor']);
  });

  it('записанный черновик читается обратно тем же содержимым', () => {
    const dir = песочница();
    saveDraft(dir, НАСТРОЙКИ, черновик());

    expect(loadDraft(dir, НАСТРОЙКИ, 'docs/a/index.mdx').body).toBe('текст черновика');
  });

  it('незаписанная работа из черновика прежней схемы имён не пропадает', () => {
    // Смена схемы имён не должна стоить человеку набранного текста.
    const dir = песочница();
    fs.mkdirSync(path.join(хранилище(dir), '.drafts'), {recursive: true});
    fs.writeFileSync(path.join(хранилище(dir), '.drafts', 'docs_a_index_mdx.json'), writeDraft(черновик()), 'utf8');

    expect(loadDraft(dir, НАСТРОЙКИ, 'docs/a/index.mdx').body).toBe('текст черновика');
  });

  it('черновик от другой статьи не подхватывается как свой', () => {
    // Предохранитель от старых плоских имён: в файле лежит запись с чужим путём.
    const dir = песочница();
    saveDraft(dir, НАСТРОЙКИ, черновик());
    const файл = path.join(хранилище(dir), '.drafts', fs.readdirSync(path.join(хранилище(dir), '.drafts'))[0]);
    fs.writeFileSync(файл, JSON.stringify({...черновик(), path: 'docs/чужая/index.mdx'}), 'utf8');

    expect(loadDraft(dir, НАСТРОЙКИ, 'docs/a/index.mdx')).toBeNull();
  });

  it('черновика нет — чтение возвращает пусто и не падает', () => {
    expect(loadDraft(песочница(), НАСТРОЙКИ, 'docs/нет/index.mdx')).toBeNull();
  });

  it('битый файл черновика на диске не роняет программу', () => {
    const dir = песочница();
    fs.mkdirSync(path.join(хранилище(dir), '.drafts'), {recursive: true});
    saveDraft(dir, НАСТРОЙКИ, черновик());
    const файл = path.join(хранилище(dir), '.drafts', fs.readdirSync(path.join(хранилище(dir), '.drafts'))[0]);
    fs.writeFileSync(файл, 'это не json', 'utf8');

    expect(loadDraft(dir, НАСТРОЙКИ, 'docs/a/index.mdx')).toBeNull();
  });

  it('после сохранения статьи черновик убирается', () => {
    const dir = песочница();
    saveDraft(dir, НАСТРОЙКИ, черновик());
    dropDraft(dir, НАСТРОЙКИ, 'docs/a/index.mdx');

    expect(loadDraft(dir, НАСТРОЙКИ, 'docs/a/index.mdx')).toBeNull();
  });

  it('уборка несуществующего черновика не считается ошибкой', () => {
    expect(() => dropDraft(песочница(), НАСТРОЙКИ, 'docs/нет/index.mdx')).not.toThrow();
  });
});

describe('снимки при сохранении', () => {
  it('сохранение статьи оставляет снимок в истории', () => {
    const dir = песочница();
    saveSnapshot(dir, НАСТРОЙКИ, 'docs/a/index.mdx', 'текст статьи', 'я', '2026-08-04T10:00:00.000Z');

    expect(countSnapshots(dir, НАСТРОЙКИ, 'docs/a/index.mdx')).toBe(1);
  });

  it('снимков на версию хранится не больше предела из настроек', () => {
    const dir = песочница();
    for (const час of ['10', '11', '12', '13', '14']) {
      saveSnapshot(dir, НАСТРОЙКИ, 'docs/a/index.mdx', `текст ${час}`, 'я', `2026-08-04T${час}:00:00.000Z`);
    }

    expect(countSnapshots(dir, НАСТРОЙКИ, 'docs/a/index.mdx')).toBe(3);
  });

  it('занятое имя снимка не затирает прежнюю версию', () => {
    const dir = песочница();
    // Две версии в одну и ту же миллисекунду с одним автором: молча потерять одну нельзя.
    saveSnapshot(dir, НАСТРОЙКИ, 'docs/a/index.mdx', 'первый', 'я', '2026-08-04T10:00:00.000Z');
    saveSnapshot(dir, НАСТРОЙКИ, 'docs/a/index.mdx', 'второй', 'я', '2026-08-04T10:00:00.000Z');

    expect(countSnapshots(dir, НАСТРОЙКИ, 'docs/a/index.mdx')).toBe(2);
  });

  it('последний снимок отдаёт своё время, автора и содержимое', () => {
    const dir = песочница();
    saveSnapshot(dir, НАСТРОЙКИ, 'docs/a/index.mdx', 'старый текст', 'я', '2026-08-04T10:00:00.000Z');
    saveSnapshot(dir, НАСТРОЙКИ, 'docs/a/index.mdx', 'свежий текст', 'Неизвестный', '2026-08-04T11:00:00.000Z');

    const снимок = latestSnapshot(dir, НАСТРОЙКИ, 'docs/a/index.mdx');

    expect(снимок.когда).toBe('2026-08-04T11:00:00.000Z');
    expect(снимок.автор).toBe('Неизвестный');
    expect(snapshotText(dir, НАСТРОЙКИ, 'docs/a/index.mdx', снимок.имя)).toBe('свежий текст');
  });

  it('снимков ещё нет — последнего снимка не существует, и это не ошибка', () => {
    expect(latestSnapshot(песочница(), НАСТРОЙКИ, 'docs/нет/index.mdx')).toBeNull();
  });

  it('снимок пропал с диска — содержимое читается как отсутствующее, программа не падает', () => {
    expect(snapshotText(песочница(), НАСТРОЙКИ, 'docs/нет/index.mdx', 'нет-такого.mdx')).toBeNull();
  });

  it('посторонний файл в папке снимков не вытесняет живую версию', () => {
    // Уборка считала все файлы подряд: чужой файл занимал место в пределе, и лишний
    // настоящий снимок удалялся раньше срока.
    const dir = песочница();
    for (const час of ['10', '11']) {
      saveSnapshot(dir, НАСТРОЙКИ, 'docs/a/index.mdx', `текст ${час}`, 'я', `2026-08-04T${час}:00:00.000Z`);
    }
    const папка = path.join(хранилище(dir), '.history', historyFolder('docs/a/index.mdx'));
    fs.writeFileSync(path.join(папка, 'заметка.txt'), 'мусор', 'utf8');
    saveSnapshot(dir, НАСТРОЙКИ, 'docs/a/index.mdx', 'текст 12', 'я', '2026-08-04T12:00:00.000Z');

    expect(countSnapshots(dir, НАСТРОЙКИ, 'docs/a/index.mdx')).toBe(3);
  });

  it('снимки разных версий статьи не смешиваются', () => {
    const dir = песочница();
    saveSnapshot(dir, НАСТРОЙКИ, 'docs/a/index.mdx', 'en', 'я', '2026-08-04T10:00:00.000Z');
    saveSnapshot(dir, НАСТРОЙКИ, 'i18n/ru/docs/a/index.mdx', 'ru', 'я', '2026-08-04T10:00:00.000Z');

    expect(countSnapshots(dir, НАСТРОЙКИ, 'docs/a/index.mdx')).toBe(1);
    expect(countSnapshots(dir, НАСТРОЙКИ, 'i18n/ru/docs/a/index.mdx')).toBe(1);
  });
});

describe('отпечаток файла', () => {
  it('одинаковый текст даёт одинаковый отпечаток, изменённый — другой', () => {
    expect(fingerprint('текст')).toBe(fingerprint('текст'));
    expect(fingerprint('текст')).not.toBe(fingerprint('текст.'));
  });
});

describe('черновики и снимки не попадают в git', () => {
  it('папки черновиков и снимков закрыты правилами git', () => {
    const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..', '..');

    for (const папка of ['editor/.drafts/проба.json', 'editor/.history/проба/снимок.mdx']) {
      const ответ = execFileSync('git', ['check-ignore', '-q', папка], {cwd: repo, encoding: 'utf8'});
      expect(ответ).toBe(''); // код 0 = путь игнорируется; иначе execFileSync бросит
    }
  });
});

describe('основа сравнения у отпечатка одна на всю программу', () => {
  it('переписанные снаружи переводы строк отпечаток не меняют: ложного расхождения нет', () => {
    expect(fingerprint('---\r\ntitle: A\r\n---\r\n\r\nтекст\r\n'))
      .toBe(fingerprint('---\ntitle: A\n---\n\nтекст\n'));
  });

  it('невидимая метка в начале файла отпечаток не меняет: это формат файла, а не текст', () => {
    expect(fingerprint('\uFEFF---\ntitle: A\n---\n\nтекст\n'))
      .toBe(fingerprint('---\ntitle: A\n---\n\nтекст\n'));
  });

  it('неразрывный пробел отпечаток меняет: это правка человека, а не шум', () => {
    expect(fingerprint('два\u00a0слова')).not.toBe(fingerprint('два слова'));
  });

  it('знак нулевой ширины внутри текста отпечаток меняет', () => {
    expect(fingerprint('сло\u200bво')).not.toBe(fingerprint('слово'));
  });

  it('лишний пробел в конце строки отпечаток меняет: значимые пробелы считаются', () => {
    expect(fingerprint('строка ')).not.toBe(fingerprint('строка'));
  });
});
