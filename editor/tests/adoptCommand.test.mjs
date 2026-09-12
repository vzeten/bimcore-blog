// Имя каждого теста повторяет формулировку правила.
// Сама команда целиком: точные коды завершения и то, что человек видит на экране. Проверяется
// настоящим запуском — кодами завершения иначе не проверить (SPEC 7.1.5).
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {draftName, newDraft, writeDraft} from '../src/core/drafts.mjs';
import {historyFolder, snapshotName} from '../src/core/history.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REL = 'i18n/ru/docusaurus-plugin-content-docs/current/beds-for-revit/index.mdx';

const песочницы = [];
function песочница(имя) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), имя));
  песочницы.push(dir);
  return dir;
}

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

const запись = (тело) => writeDraft(newDraft({
  path: REL, frontmatterRaw: 'title: Кровати', body: тело, отпечатокБазы: 'ОТП', когда: '2026-09-07T22:28:28.000Z',
}));

function положить(база, папка, имя, текст) {
  const dir = path.join(база, папка);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, имя), текст, 'utf8');
}

/** Старое хранилище чужой рабочей копии: один черновик и один снимок. */
function источник(тело = 'незавершённый текст владельца') {
  const dir = песочница('editor-code-');
  положить(dir, '.drafts', draftName(REL), запись(тело));
  положить(dir, path.join('.history', historyFolder(REL)), snapshotName('2026-09-06T10:00:00.000Z', 'Хозяин'), 'состояние');
  return dir;
}

describe('команда целиком', () => {
  /** Запуск настоящей команды: коды завершения проверяются только так. */
  function команда(доводы) {
    try {
      const вывод = execFileSync(process.execPath, [path.join(EDITOR, 'scripts', 'adoptStore.mjs'), ...доводы], {
        encoding: 'utf8', cwd: EDITOR,
      });
      return {код: 0, вывод};
    } catch (беда) {
      return {код: беда.status, вывод: `${беда.stdout ?? ''}${беда.stderr ?? ''}`};
    }
  }

  /** Корень с настоящими настройками программы: у неё папки контента свои. */
  function настоящийКорень() {
    const корень = песочница('editor-repo-');
    const настройки = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
    for (const root of настройки['контент'].filter((к) => к['наСайте'])) {
      fs.mkdirSync(path.join(корень, root['папка']), {recursive: true});
    }
    return корень;
  }

  it('оба пути печатаются до записи, итог с числами, код 0', () => {
    const корень = настоящийКорень();
    const src = источник();

    const {код, вывод} = команда([src, корень]);

    expect(вывод).toContain(`источник:   ${src}`);
    expect(вывод).toContain(path.join(корень, 'editor'));
    expect(вывод).toContain('перенесено черновиков: 1');
    expect(вывод).toContain('перенесено снимков: 1');
    expect(код).toBe(0);
  });

  it('спор даёт код 2 и называет статью и файл варианта', () => {
    const корень = настоящийКорень();
    положить(корень, path.join('editor', '.drafts'), draftName(REL), запись('работа общего хранилища'));
    const src = источник('другая незаписанная работа');

    const {код, вывод} = команда([src, корень]);

    expect(код).toBe(2);
    expect(вывод).toContain('споров: 1');
    expect(вывод).toContain(REL);
  });

  it('повтор после спора снова даёт код 2, а не успех', () => {
    const корень = настоящийКорень();
    положить(корень, path.join('editor', '.drafts'), draftName(REL), запись('работа общего хранилища'));
    const src = источник('другая незаписанная работа');
    expect(команда([src, корень]).код).toBe(2);

    const {код, вывод} = команда([src, корень]);

    expect(код).toBe(2);
    expect(вывод).toContain('неразобранных споров: 1');
    expect(вывод).toContain(REL);
  });

  it('оставшийся в источнике снимок даёт код 2 и назван поимённо: забрали не всё', () => {
    const корень = настоящийКорень();
    const src = песочница('editor-code-');
    const папка = historyFolder(REL);
    положить(корень, path.join('editor', '.history', папка), 'заметка.txt', 'своё');
    положить(src, path.join('.history', папка), 'заметка.txt', 'чужое');

    const {код, вывод} = команда([src, корень]);

    expect(код).toBe(2);
    expect(вывод).toContain(`${папка}/заметка.txt`);
    expect(вывод).toContain('нужен разбор');
  });

  it('негодный довод даёт код 1 и образец вызова, а не нулевой отчёт', () => {
    const {код, вывод} = команда([источник()]);

    expect(код).toBe(1);
    expect(вывод).toContain('editor:adopt');
    expect(вывод).not.toContain('перенесено черновиков');
  });
});
