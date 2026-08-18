// Заслоны пути картинки — одно правило на обе ручки: замену байтов и смену формата.
// Живут отдельным модулем, чтобы у правила «файл лежит строго в папке своей статьи»
// не появилось второго, чуть разошедшегося списка проверок.

import fs from 'node:fs';
import path from 'node:path';

/**
 * Папка статьи по пути её файла. `null` — статьи нет или это не файл:
 * класть и менять картинки тогда негде.
 */
export function папкаСтатьи(repo, article, insideRepo) {
  const файл = path.join(repo, article);
  if (!insideRepo(файл) || !fs.existsSync(файл) || !fs.lstatSync(файл).isFile()) return null;

  // Текстовая сверка `insideRepo` не видит ссылку-папку в самом пути статьи: junction внутри
  // репозитория, ведущий наружу, увёл бы запись за его пределы (находка ворот 2026-08-17).
  const dir = path.dirname(файл);
  const настоящий = path.relative(fs.realpathSync(repo), fs.realpathSync(dir));
  if (настоящий.startsWith('..') || path.isAbsolute(настоящий)) return null;

  return dir;
}

/**
 * Куда в самом деле ведёт путь картинки. `null` — путь выходит из папки статьи:
 * `..`, абсолютный, обратные косые или ссылка-папка в середине пути.
 *
 * Сверка двойная. Текстовая — `path.relative` от папки статьи, а не префикс строки: у соседних
 * папок бывает общее начало имени. Настоящая — `realpath` обеих сторон: ссылка-папка (symlink,
 * junction) уводит запись в чужое место, оставаясь текстуально внутри (находка ворот 2026-08-16).
 */
export function цельВнутриСтатьи(dir, src) {
  const target = path.resolve(dir, src);
  const внутри = path.relative(dir, target);
  if (String(src).includes('\\') || внутри === '' || внутри.startsWith('..') || path.isAbsolute(внутри)) return null;
  if (!fs.existsSync(target) || !fs.lstatSync(target).isFile()) return {target, есть: false};

  const настоящий = path.relative(fs.realpathSync(dir), fs.realpathSync(path.dirname(target)));
  if (настоящий.startsWith('..') || path.isAbsolute(настоящий)) return null;

  return {target, есть: true};
}

/**
 * Записать байты поверх существующего файла так, чтобы сбой на середине не оставил ни битой
 * картинки, ни хвоста: сначала целиком во временный файл, затем атомарный `rename`.
 *
 * Временная папка — служебная папка редактора, а НЕ папка статьи: файл в папке статьи принадлежит
 * статье (правило состава выпуска), и хвост от упавшей записи уехал бы в публикацию. Папка лежит
 * в том же репозитории — на одном томе с целью, иначе `rename` не был бы атомарным.
 */
export function записатьПоверх(repo, target, bytes) {
  const временный = времянка(repo);
  try {
    fs.writeFileSync(временный, bytes);
    fs.renameSync(временный, target);
  } finally {
    // Успех уносит файл сам (`rename`); хвост здесь остаётся только после сбоя.
    fs.rmSync(временный, {force: true});
  }
}

/**
 * Записать байты в НОВЫЙ файл, не перезаписывая существующий: `COPYFILE_EXCL` отказывает,
 * если адрес занят, — одной операцией, без щели между проверкой и записью.
 * Возвращает false при занятом адресе; прочие сбои поднимаются наверх.
 */
export function записатьНовый(repo, target, bytes) {
  const временный = времянка(repo);
  try {
    fs.writeFileSync(временный, bytes);
    fs.copyFileSync(временный, target, fs.constants.COPYFILE_EXCL);
    return true;
  } catch (ошибка) {
    if (ошибка?.code === 'EEXIST') return false;
    throw ошибка;
  } finally {
    fs.rmSync(временный, {force: true});
  }
}

function времянка(repo) {
  const папка = path.join(repo, 'editor', '.tmp');
  fs.mkdirSync(папка, {recursive: true});
  return path.join(папка, `замена-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}
