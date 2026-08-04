// Имя каждого теста повторяет формулировку правила.
// Проверка на настоящем диске: черновики и снимки должны лежать вне контента и вне git.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {countSnapshots, dropDraft, fingerprint, loadDraft, saveDraft, saveSnapshot} from '../src/adapters/draftStore.mjs';
import {newDraft} from '../src/core/drafts.mjs';

const НАСТРОЙКИ = {
  хранение: {папкаЧерновиков: '.drafts', папкаСнимков: '.history', черновикЖивётДней: 14, снимковНаВерсию: 3},
};

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

    const файлы = fs.readdirSync(path.join(dir, '.drafts'));
    expect(файлы).toHaveLength(1);
    // Ни одного файла не появилось вне служебной папки.
    expect(fs.readdirSync(dir)).toEqual(['.drafts']);
  });

  it('записанный черновик читается обратно тем же содержимым', () => {
    const dir = песочница();
    saveDraft(dir, НАСТРОЙКИ, черновик());

    expect(loadDraft(dir, НАСТРОЙКИ, 'docs/a/index.mdx').body).toBe('текст черновика');
  });

  it('черновика нет — чтение возвращает пусто и не падает', () => {
    expect(loadDraft(песочница(), НАСТРОЙКИ, 'docs/нет/index.mdx')).toBeNull();
  });

  it('битый файл черновика на диске не роняет программу', () => {
    const dir = песочница();
    fs.mkdirSync(path.join(dir, '.drafts'), {recursive: true});
    saveDraft(dir, НАСТРОЙКИ, черновик());
    const файл = path.join(dir, '.drafts', fs.readdirSync(path.join(dir, '.drafts'))[0]);
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
