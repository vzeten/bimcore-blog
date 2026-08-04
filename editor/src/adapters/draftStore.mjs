// Хранилище черновиков и снимков на диске. Живёт в папках редактора, вне контента и вне git.
// Правил здесь нет — они в `src/core/drafts.mjs`; здесь только файлы.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {draftName, extraSnapshots, readDraft, writeDraft} from '../core/drafts.mjs';
import {historyFolder, snapshotName} from '../core/history.mjs';

/**
 * Отпечаток содержимого файла: по нему видно, менялся ли файл под черновиком.
 * Хеш, а не время правки: время на разных дисках и после копирования врёт.
 */
export function fingerprint(text) {
  return crypto.createHash('sha1').update(String(text), 'utf8').digest('hex');
}

const draftsDir = (editorDir, settings) => path.join(editorDir, settings['хранение']['папкаЧерновиков']);
const historyDir = (editorDir, settings) => path.join(editorDir, settings['хранение']['папкаСнимков']);

/** Путь к файлу черновика этой версии статьи. */
export function draftPath(editorDir, settings, rel) {
  return path.join(draftsDir(editorDir, settings), draftName(rel));
}

/** Прочитать черновик. Нет файла или он битый — вернётся null, программа не падает. */
export function loadDraft(editorDir, settings, rel) {
  const file = draftPath(editorDir, settings, rel);
  if (!fs.existsSync(file)) return null;

  try {
    return readDraft(fs.readFileSync(file, 'utf8'));
  } catch {
    return null; // файл занят или нечитаем — считаем, что черновика нет
  }
}

/** Записать черновик. Папка создаётся при первой записи и закрыта от git через .gitignore. */
export function saveDraft(editorDir, settings, draft) {
  const dir = draftsDir(editorDir, settings);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(draftPath(editorDir, settings, draft['path']), writeDraft(draft), 'utf8');
}

/** Убрать черновик: работа зафиксирована в настоящем файле, продолжать нечего. */
export function dropDraft(editorDir, settings, rel) {
  const file = draftPath(editorDir, settings, rel);
  if (fs.existsSync(file)) fs.rmSync(file);
}

/**
 * Положить снимок сохранённого текста в историю и убрать лишние старые.
 * Снимки нужны, чтобы потом вернуться к прошлому состоянию (В1-13, В1-14).
 */
export function saveSnapshot(editorDir, settings, rel, text, author, iso) {
  const dir = path.join(historyDir(editorDir, settings), historyFolder(rel));
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, snapshotName(iso, author)), text, 'utf8');

  for (const лишний of extraSnapshots(fs.readdirSync(dir), settings['хранение']['снимковНаВерсию'])) {
    fs.rmSync(path.join(dir, лишний));
  }
}

/** Сколько снимков хранится у этой версии — нужно проверкам и будущей ленте версий. */
export function countSnapshots(editorDir, settings, rel) {
  const dir = path.join(historyDir(editorDir, settings), historyFolder(rel));
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
}
