// Корзина статей на диске: `editor/.trash/<запись>/` вне контента, сборки и git.
// Правил здесь немного, и все они про сохранность: состав архива фиксируется до первого действия,
// ни один путь не выходит за репозиторий или папку редактора, ссылки и junction в пути — отказ,
// оригиналы стираются только после того, как копия целиком легла в архив, возврат не перезаписывает
// чужое, а обрыв на любом шаге переживается повтором: оба хода идемпотентны и отмечают своё
// продвижение в описи. Автоматически чистятся только завершённые и просроченные записи.
// Опись и копии пишутся целиком: временный файл в служебной папке редактора с `fsync`, затем одна
// операция установки — `rename` поверх для описи и архива, `link` только на свободное имя при
// возврате. Обрыв в любой момент не оставляет ни битой описи, ни половинного файла на месте.
// Папка корзины и папка записи перед любым чтением, очисткой или возвратом проверяются на
// подмену ссылкой или junction: чужую папку программа не читает и не чистит.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {draftPath, historyDirOf} from './draftStore.mjs';

const ОПИСЬ = 'manifest.json';
/** Имя записи корзины: время и короткий хвост — в адресе ничего, кроме безопасных знаков. */
const ИМЯ_ЗАПИСИ = /^[0-9A-Za-z_-]{8,80}$/;

export function папкаКорзины(editorDir, settings) {
  return path.join(editorDir, settings['хранение']['папкаКорзины']);
}

export function дниКорзины(settings) {
  return Number(settings['хранение']['корзинаДней']) || 30;
}

/** Корни, из которых архив забирает файлы: содержимое из репозитория, служебные следы из папки редактора. */
function корни(repo, editorDir) {
  return {repo, editor: editorDir};
}

/**
 * Полный путь файла записи описи, проверенный: относительный без `..`, внутри своего корня,
 * ни сам файл, ни его папки — не ссылка и не junction. Нарушение — исключение «ссылкаВПути».
 */
function проверенный(корень, rel) {
  const части = String(rel).split('/');
  if (path.isAbsolute(rel) || части.some((ч) => ч === '' || ч === '.' || ч === '..')) throw new Error('ссылкаВПути');
  const полный = path.resolve(корень, ...части);
  if (!полный.startsWith(path.resolve(корень) + path.sep)) throw new Error('ссылкаВПути');
  // Существующая часть пути обязана быть настоящей: реальный путь папки совпадает с ожидаемым.
  let есть = полный;
  while (!fs.existsSync(есть)) есть = path.dirname(есть);
  if (!тотЖе(fs.realpathSync.native(есть), есть) || (есть === полный && fs.lstatSync(полный).isSymbolicLink())) throw new Error('ссылкаВПути');
  return полный;
}

const тотЖе = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

/** Существующая папка — настоящая: не ссылка, не junction и не лежит за ними. Иначе — исключение. */
function настоящаяПапка(dir) {
  if (fs.lstatSync(dir).isSymbolicLink() || !тотЖе(fs.realpathSync.native(dir), path.resolve(dir))) throw new Error('ссылкаВПути');
  return dir;
}

/** Папка корзины, проверенная на подмену; её ещё нет — `null`. */
function корзинаНастоящая(editorDir, settings) {
  const папка = папкаКорзины(editorDir, settings);
  return fs.existsSync(папка) ? настоящаяПапка(папка) : null;
}

/** Все обычные файлы под папкой, путями относительно `repo` со слэшами. Ссылки — отказ. */
function файлыПапки(repo, папка) {
  const итог = [];
  const обход = (dir) => {
    for (const запись of fs.readdirSync(dir, {withFileTypes: true})) {
      const полный = path.join(dir, запись.name);
      if (запись.isSymbolicLink()) throw new Error('ссылкаВПути');
      if (запись.isDirectory()) обход(полный);
      else итог.push(path.relative(repo, полный).split(path.sep).join('/'));
    }
  };
  обход(проверенный(repo, папка));
  return итог;
}

/**
 * Состав архива по решению об удалении: файлы статьи и состояния, все файлы её собственных папок,
 * черновик и снимки каждой языковой версии. Считается до первого действия и больше не меняется.
 */
export function составАрхива({repo, editorDir, settings, решение}) {
  const записи = new Map();
  const добавить = (корень, rel) => {
    проверенный(корни(repo, editorDir)[корень], rel);
    записи.set(`${корень}/${rel}`, {корень, из: rel, в: `${корень}/${rel}`});
  };
  for (const файл of решение.файлы) добавить('repo', файл);
  for (const папка of решение.папки) for (const файл of файлыПапки(repo, папка)) добавить('repo', файл);
  for (const версия of решение.пути) {
    const черновик = draftPath(editorDir, settings, версия);
    if (fs.existsSync(черновик)) добавить('editor', path.relative(editorDir, черновик).split(path.sep).join('/'));
    const история = historyDirOf(editorDir, settings, версия);
    if (fs.existsSync(история)) {
      for (const имя of fs.readdirSync(история)) добавить('editor', path.relative(editorDir, path.join(история, имя)).split(path.sep).join('/'));
    }
  }
  return [...записи.values()];
}

function прочитатьОпись(dir) {
  try {
    const опись = JSON.parse(fs.readFileSync(path.join(dir, ОПИСЬ), 'utf8'));
    if (!опись || typeof опись !== 'object' || !Array.isArray(опись.файлы)) return null;
    return опись;
  } catch {
    return null;
  }
}

/**
 * Положить байты на место целиком. Сначала временный файл в `editor/.tmp` (тот же том) с `fsync`,
 * затем одна операция: `заменять` — `rename` поверх; иначе `link` временного файла на свободное
 * имя — занятое имя даёт `EEXIST` и `false`, ничего не перезаписав. Половинного файла на месте не
 * бывает ни при каком обрыве: до установки его там нет, после — он целый. Хвост уносится всегда.
 */
export function положитьЦеликом(editorDir, target, bytes, заменять) {
  const папка = path.join(editorDir, '.tmp');
  fs.mkdirSync(папка, {recursive: true});
  const временный = path.join(папка, `корзина-${process.pid}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
  try {
    const fd = fs.openSync(временный, 'w');
    try {
      fs.writeSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (заменять) {
      fs.renameSync(временный, target);
      return true;
    }
    try {
      fs.linkSync(временный, target);
      return true;
    } catch (error) {
      if (error?.code === 'EEXIST') return false;
      throw error;
    }
  } finally {
    fs.rmSync(временный, {force: true});
  }
}

function записатьОпись(editorDir, dir, опись) {
  fs.mkdirSync(dir, {recursive: true});
  положитьЦеликом(editorDir, path.join(dir, ОПИСЬ), JSON.stringify(опись, null, 2), true);
}

/** Копия в архив: повтор переноса перезаписывает свою же копию. */
function копия(editorDir, от, куда) {
  fs.mkdirSync(path.dirname(куда), {recursive: true});
  положитьЦеликом(editorDir, куда, fs.readFileSync(от), true);
}

/** Копия на место при возврате: только на свободное имя — чужое не перезаписывается. */
function копияНовая(editorDir, от, куда) {
  fs.mkdirSync(path.dirname(куда), {recursive: true});
  return положитьЦеликом(editorDir, куда, fs.readFileSync(от), false);
}

/** Убрать папку, если после удаления файлов статьи в ней ничего не осталось, и так вверх до корня статьи. */
function убратьПустые(repo, папка) {
  let текущая = path.resolve(repo, ...папка.split('/'));
  const предел = path.resolve(repo, ...папка.split('/'));
  while (текущая.startsWith(предел) && fs.existsSync(текущая) && fs.readdirSync(текущая).length === 0) {
    fs.rmdirSync(текущая);
    текущая = path.dirname(текущая);
  }
}

/**
 * Перенос статьи в корзину по готовому составу. Шаги отмечаются в описи: `перенос` — копирование
 * идёт, оригиналы целы; `скопировано` — архив полный, оригиналы стираются; `готово`.
 * Повтор с любого шага доводит запись до конца, ничего не теряя.
 */
export function вКорзину({repo, editorDir, settings, статья, состав, сейчас = new Date()}) {
  const id = `${сейчас.toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
  const dir = path.join(папкаКорзины(editorDir, settings), id);
  const опись = {версия: 1, id, удалено: сейчас.toISOString(), статья, состояние: 'перенос', файлы: состав};
  const корзина = папкаКорзины(editorDir, settings);
  fs.mkdirSync(корзина, {recursive: true});
  настоящаяПапка(корзина);
  записатьОпись(editorDir, dir, опись);
  return довести({repo, editorDir, settings, dir, опись});
}

/** Довести перенос до конца с того шага, на котором он остановился. */
export function довести({repo, editorDir, settings, dir, опись}) {
  const корень = корни(repo, editorDir);
  if (опись.состояние === 'перенос') {
    for (const файл of опись.файлы) {
      const от = проверенный(корень[файл.корень], файл.из);
      const куда = проверенный(dir, файл.в);
      if (fs.existsSync(от)) копия(editorDir, от, куда);
      else if (!fs.existsSync(куда)) throw new Error('архивПовреждён');
    }
    опись.состояние = 'скопировано';
    записатьОпись(editorDir, dir, опись);
  }
  if (опись.состояние === 'скопировано') {
    for (const файл of опись.файлы) {
      const от = проверенный(корень[файл.корень], файл.из);
      if (fs.existsSync(от)) fs.rmSync(от);
    }
    for (const папка of опись.статья.папки ?? []) убратьПустые(repo, папка);
    опись.состояние = 'готово';
    записатьОпись(editorDir, dir, опись);
  }
  void settings;
  return {id: опись.id, удалено: опись.удалено};
}

function срокДо(опись, settings) {
  return new Date(Date.parse(опись.удалено) + дниКорзины(settings) * 86_400_000).toISOString();
}

/**
 * Записи корзины. Попутно чистятся только записи `готово`, чей срок вышел: незавершённые переносы
 * и возвраты, повреждённые описи и всё, что не удалось разобрать, остаются как есть.
 */
export function списокКорзины({editorDir, settings, сейчас = new Date()}) {
  const папка = корзинаНастоящая(editorDir, settings);
  if (папка === null) return [];
  const записи = [];
  for (const имя of fs.readdirSync(папка).sort().reverse()) {
    if (!ИМЯ_ЗАПИСИ.test(имя)) continue;
    const dir = path.join(папка, имя);
    // Подменённая папка записи не читается и не чистится: за ней чужие файлы.
    if (!fs.statSync(dir).isDirectory() || fs.lstatSync(dir).isSymbolicLink() || !тотЖе(fs.realpathSync.native(dir), dir)) continue;
    const опись = прочитатьОпись(dir);
    if (опись === null) continue;
    const срок = срокДо(опись, settings);
    if (опись.состояние === 'готово' && Date.parse(срок) <= сейчас.getTime()) {
      fs.rmSync(dir, {recursive: true, force: true});
      continue;
    }
    записи.push({id: опись.id, удалено: опись.удалено, срокДо: срок, состояние: опись.состояние, ...опись.статья});
  }
  return записи;
}

/**
 * Возврат записи на место. Сначала все конфликты: файл на месте с другим содержимым — отказ целиком
 * без единой записи. Совпадающий байт в байт файл конфликтом не считается — так повтор после обрыва
 * проходит. Архивный файл отсутствует (перенос оборвался до копии) — оригинал обязан быть цел.
 */
export function вернутьИзКорзины({repo, editorDir, settings, id}) {
  if (!ИМЯ_ЗАПИСИ.test(String(id))) return {ошибка: 'нетЗаписи'};
  let dir;
  try {
    const папка = корзинаНастоящая(editorDir, settings);
    if (папка === null || !fs.existsSync(path.join(папка, id))) return {ошибка: 'нетЗаписи'};
    dir = настоящаяПапка(path.join(папка, id));
  } catch {
    return {ошибка: 'ссылкаВПути'};
  }
  const опись = прочитатьОпись(dir);
  if (опись === null) return {ошибка: 'нетЗаписи'};
  const корень = корни(repo, editorDir);
  const план = [];
  const конфликты = [];
  try {
    for (const файл of опись.файлы) {
      const куда = проверенный(корень[файл.корень], файл.из);
      const от = проверенный(dir, файл.в);
      const вАрхиве = fs.existsSync(от);
      const наМесте = fs.existsSync(куда);
      if (!вАрхиве && !наМесте) return {ошибка: 'архивПовреждён'};
      if (вАрхиве && наМесте && !fs.readFileSync(от).equals(fs.readFileSync(куда))) конфликты.push(файл.из);
      if (вАрхиве && !наМесте) план.push({от, куда});
    }
  } catch (error) {
    return {ошибка: error.message === 'ссылкаВПути' ? 'ссылкаВПути' : 'архивПовреждён'};
  }
  if (конфликты.length > 0) return {ошибка: 'возвратКонфликт', конфликты};
  опись.состояние = 'возврат';
  записатьОпись(editorDir, dir, опись);
  for (const {от, куда} of план) {
    if (!копияНовая(editorDir, от, куда)) {
      return {ошибка: 'возвратКонфликт', конфликты: [path.relative(repo, куда).split(path.sep).join('/')]};
    }
  }
  fs.rmSync(dir, {recursive: true, force: true});
  return {возвращено: опись.статья.пути ?? []};
}
