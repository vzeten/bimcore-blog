// Хранилище черновиков и снимков на диске. Живёт в папках редактора, вне контента и вне git.
// Правил здесь нет — они в `src/core/drafts.mjs`; здесь только файлы.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {draftName, extraSnapshots, readDraft, староеИмяЧерновика, writeDraft} from '../core/drafts.mjs';
import {historyFolder, версииИзИмён, свободноеИмя} from '../core/history.mjs';

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

/**
 * Прочитать черновик. Нет файла или он битый — вернётся null, программа не падает.
 * Запасной вариант — имя по прежней схеме: незаписанная работа не должна пропасть
 * только из-за того, что программа стала называть файлы иначе.
 */
export function loadDraft(editorDir, settings, rel) {
  return прочитатьЧерновик(draftPath(editorDir, settings, rel), rel)
    ?? прочитатьЧерновик(path.join(draftsDir(editorDir, settings), староеИмяЧерновика(rel)), rel);
}

function прочитатьЧерновик(file, rel) {
  if (!fs.existsSync(file)) return null;

  try {
    const draft = readDraft(fs.readFileSync(file, 'utf8'));
    // Черновик обязан принадлежать той статье, которую спрашивают: имя файла плоское,
    // и черновик от другого пути не должен подсунуться как продолжение чужой работы.
    return draft !== null && draft['path'] === rel ? draft : null;
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

const snapshotDir = (editorDir, settings, rel) => path.join(historyDir(editorDir, settings), historyFolder(rel));

/** Имена снимков этой версии по порядку времени: имя начинается со времени, поэтому хватает сортировки. */
function snapshotNames(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

/** Все имена снимков этой языковой версии статьи: из них лента строит отметки. */
export function listSnapshots(editorDir, settings, rel) {
  return snapshotNames(snapshotDir(editorDir, settings, rel));
}

/**
 * Положить снимок сохранённого текста в историю и убрать лишние старые.
 * Снимки нужны, чтобы потом вернуться к прошлому состоянию (В1-13, В1-14).
 */
export function saveSnapshot(editorDir, settings, rel, text, author, iso) {
  const dir = snapshotDir(editorDir, settings, rel);
  fs.mkdirSync(dir, {recursive: true});
  // Имя берётся свободное: снимок в ту же миллисекунду с тем же автором не должен затереть прежний.
  fs.writeFileSync(path.join(dir, свободноеИмя(snapshotNames(dir), iso, author)), text, 'utf8');

  // Уборка считает только настоящие снимки: посторонний файл в папке иначе занимал бы место
  // в пределе и вытеснял бы живую версию.
  const снимки = версииИзИмён(snapshotNames(dir)).map((версия) => версия['имя']);
  for (const лишний of extraSnapshots(снимки, settings['хранение']['снимковНаВерсию'])) {
    fs.rmSync(path.join(dir, лишний));
  }
}

/**
 * Последний известный программе снимок этой версии: время, автор и имя файла.
 * Содержимое не читается — оно нужно не всегда, а реестру хватает подписи.
 */
export function latestSnapshot(editorDir, settings, rel) {
  // Только настоящие снимки: посторонний файл, оказавшийся последним по алфавиту, иначе
  // выглядел бы как «истории нет», и внешняя правка сравнивалась бы не с тем состоянием.
  const свежий = версииИзИмён(snapshotNames(snapshotDir(editorDir, settings, rel))).at(-1);
  return свежий === undefined ? null : {имя: свежий['имя'], когда: свежий['iso'], автор: свежий['author']};
}

/** Содержимое снимка. Файл пропал или нечитаем — считаем, что известного состояния нет. */
export function snapshotText(editorDir, settings, rel, имя) {
  try {
    return fs.readFileSync(path.join(snapshotDir(editorDir, settings, rel), имя), 'utf8');
  } catch {
    return null;
  }
}

/** Сколько настоящих снимков хранится у этой версии: посторонние файлы в счёт не идут. */
export function countSnapshots(editorDir, settings, rel) {
  return версииИзИмён(snapshotNames(snapshotDir(editorDir, settings, rel))).length;
}
