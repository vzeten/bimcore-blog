// Хранилище черновиков и снимков на диске. Живёт в папке редактора ВНУТРИ материалов, вне
// контента статей и вне git. Правил здесь нет — они в `src/core/drafts.mjs` и
// `src/core/draftHome.mjs`; здесь только файлы.
//
// Первым доводом идёт не папка кода, а корень МАТЕРИАЛОВ: незаписанная работа принадлежит статьям,
// а не той копии программы, из которой сегодня подняли сервер (SPEC 7.1.5).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {draftName, extraSnapshots, readDraft, староеИмяЧерновика, writeDraft} from '../core/drafts.mjs';
import {historyFolder, версииИзИмён, свободноеИмя} from '../core/history.mjs';
import {ПАПКА_РЕДАКТОРА, префиксСпора} from '../core/draftHome.mjs';
import {ApiError} from './httpBody.mjs';

/**
 * Отпечаток содержимого файла: по нему видно, менялся ли файл под черновиком.
 * Хеш, а не время правки: время на разных дисках и после копирования врёт.
 */
export function fingerprint(text) {
  return crypto.createHash('sha1').update(String(text), 'utf8').digest('hex');
}

/**
 * Папка редактора внутри материалов: общий дом черновиков, снимков и отложенных вариантов.
 * Одна на все обычные экземпляры с этим корнем — из какой бы копии кода их ни подняли.
 */
export const хранилищеРедактора = (repo) => path.join(repo, ПАПКА_РЕДАКТОРА);

// Папки считаются от любой базы: то же правило нужно и переносу, чтобы прочитать старое
// хранилище копии кода теми же именами настроек, а не своими.
export const папкаЧерновиковВ = (база, settings) => path.join(база, settings['хранение']['папкаЧерновиков']);
export const папкаСнимковВ = (база, settings) => path.join(база, settings['хранение']['папкаСнимков']);
export const папкаСпоровВ = (база, settings) => path.join(база, settings['хранение']['папкаСпоров']);

const draftsDir = (repo, settings) => папкаЧерновиковВ(хранилищеРедактора(repo), settings);
const historyDir = (repo, settings) => папкаСнимковВ(хранилищеРедактора(repo), settings);

/** Путь к файлу черновика этой версии статьи. */
export function draftPath(repo, settings, rel) {
  return path.join(draftsDir(repo, settings), draftName(rel));
}

/**
 * Прочитать черновик. Нет файла или он битый — вернётся null, программа не падает.
 * Запасной вариант — имя по прежней схеме: незаписанная работа не должна пропасть
 * только из-за того, что программа стала называть файлы иначе.
 */
export function loadDraft(repo, settings, rel) {
  return прочитатьЧерновик(draftPath(repo, settings, rel), rel)
    ?? прочитатьЧерновик(path.join(draftsDir(repo, settings), староеИмяЧерновика(rel)), rel);
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

/**
 * Все черновики, что лежат у программы: по одному на языковую версию. Нужны своду — работа,
 * подтверждённая автосохранением, для сайта такое же неопубликованное изменение, как правка файла.
 * Битый или чужой файл пропускается молча: работой человека он не считается, а падать своду нельзя.
 */
export function listDrafts(repo, settings) {
  const dir = draftsDir(repo, settings);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .map((имя) => прочитатьЛюбой(path.join(dir, имя)))
    .filter((draft) => draft !== null);
}

/** Черновик без вопроса о том, какой статье он должен принадлежать: путь берётся из него самого. */
function прочитатьЛюбой(file) {
  try {
    const draft = readDraft(fs.readFileSync(file, 'utf8'));
    return draft !== null && typeof draft['path'] === 'string' && draft['path'] !== '' ? draft : null;
  } catch {
    return null; // файл занят или нечитаем — считаем, что черновика нет
  }
}

/**
 * Отложенные варианты черновика этой версии: работа, которую перенос нашёл в старом хранилище и
 * которую программа НЕ выбрала, потому что под тем же именем уже лежал другой текст.
 * Пусто — спорить не о чем.
 */
export function спорыЧерновика(repo, settings, rel) {
  const dir = папкаСпоровВ(хранилищеРедактора(repo), settings);
  // Оба имени сразу: вариант мог приехать и от черновика прежней схемы имён, и он точно так же
  // остановит запись — иначе спор о старом файле молча ничего не сторожил бы.
  const начала = [префиксСпора(draftName(rel)), префиксСпора(староеИмяЧерновика(rel))];

  try {
    return fs.readdirSync(dir).filter((имя) => начала.some((н) => имя.startsWith(н))).sort();
  } catch (error) {
    // Папки нет — спорить не о чем. Любая другая беда чтения уходит наверх: молчаливое «споров
    // нет» открыло бы запись поверх работы человека именно тогда, когда сторож ослеп.
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * Записать черновик. Папка создаётся при первой записи и закрыта от git через .gitignore.
 *
 * Пока у версии есть неразобранный спор, запись отклоняется с понятным текстом: она легла бы
 * поверх одного из вариантов работы человека, а выбирать за него программа не вправе. Текст в окне
 * при этом цел — окно показывает отказ и держит правку у себя (`autosaveDraft`).
 */
export function saveDraft(repo, settings, draft) {
  const споры = спорыЧерновика(repo, settings, draft['path']);
  if (споры.length > 0) {
    const папка = папкаСпоровВ(хранилищеРедактора(repo), settings);
    throw new ApiError(409, settings['ошибкиСервера']['споренЧерновик'].replace('{папка}', папка));
  }

  const dir = draftsDir(repo, settings);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(draftPath(repo, settings, draft['path']), writeDraft(draft), 'utf8');
}

/** Убрать черновик: работа зафиксирована в настоящем файле, продолжать нечего. */
export function dropDraft(repo, settings, rel) {
  const file = draftPath(repo, settings, rel);
  if (fs.existsSync(file)) fs.rmSync(file);
}

const snapshotDir = (repo, settings, rel) => path.join(historyDir(repo, settings), historyFolder(rel));

/** Папка снимков этой версии: корзине нужен её состав, чтобы унести историю вместе со статьёй. */
export function historyDirOf(repo, settings, rel) {
  return snapshotDir(repo, settings, rel);
}

/**
 * Убрать всю историю этой версии статьи. Зовётся только при удалении самой статьи:
 * история без статьи — мусор, который лента всё равно никогда не покажет.
 */
export function dropHistory(repo, settings, rel) {
  const dir = snapshotDir(repo, settings, rel);
  if (fs.existsSync(dir)) fs.rmSync(dir, {recursive: true, force: true});
}

/** Имена снимков этой версии по порядку времени: имя начинается со времени, поэтому хватает сортировки. */
function snapshotNames(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

/** Все имена снимков этой языковой версии статьи: из них лента строит отметки. */
export function listSnapshots(repo, settings, rel) {
  return snapshotNames(snapshotDir(repo, settings, rel));
}

/**
 * Положить снимок сохранённого текста в историю и убрать лишние старые.
 * Снимки нужны, чтобы потом вернуться к прошлому состоянию (В1-13, В1-14).
 */
export function saveSnapshot(repo, settings, rel, text, author, iso) {
  const dir = snapshotDir(repo, settings, rel);
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
export function latestSnapshot(repo, settings, rel) {
  // Только настоящие снимки: посторонний файл, оказавшийся последним по алфавиту, иначе
  // выглядел бы как «истории нет», и внешняя правка сравнивалась бы не с тем состоянием.
  const свежий = версииИзИмён(snapshotNames(snapshotDir(repo, settings, rel))).at(-1);
  return свежий === undefined ? null : {имя: свежий['имя'], когда: свежий['iso'], автор: свежий['author']};
}

/** Содержимое снимка. Файл пропал или нечитаем — считаем, что известного состояния нет. */
export function snapshotText(repo, settings, rel, имя) {
  try {
    return fs.readFileSync(path.join(snapshotDir(repo, settings, rel), имя), 'utf8');
  } catch {
    return null;
  }
}

/** Сколько настоящих снимков хранится у этой версии: посторонние файлы в счёт не идут. */
export function countSnapshots(repo, settings, rel) {
  return версииИзИмён(snapshotNames(snapshotDir(repo, settings, rel))).length;
}
