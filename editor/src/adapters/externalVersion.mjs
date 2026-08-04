// Фиксация внешней правки: файл статьи изменили мимо программы — сохраняем его содержимое версией.
// Здесь только внешний мир (диск и git); решения принимает `core/externalEdit.mjs`.

import fs from 'node:fs';
import path from 'node:path';

import {авторПравки, времяВерсии, естьВнешняяПравка} from '../core/externalEdit.mjs';
import {latestSnapshot, saveSnapshot, snapshotText} from './draftStore.mjs';
import {gitFacts, showFile} from './gitFile.mjs';
import {ApiError} from './httpBody.mjs';

/**
 * Сверить файл с последним известным состоянием и, если оно разошлось, положить содержимое
 * файла в историю отдельной версией. Возвращает записанную версию или `null`, если писать нечего.
 *
 * `обязательно` — вызов перед записью в настоящий файл: не смогли сохранить версию, значит писать
 * файл нельзя, иначе чужая правка исчезнет насовсем, а это ровно та дыра, которую задание чинит.
 * При открытии статьи вызов необязателен: чтение ничего не теряет, и ломать работу
 * из-за недоступного хранилища снимков было бы хуже, чем открыть статью.
 */
export async function фиксироватьВнешнюю({editorDir, repo, settings, git, ref, rel, обязательно = false}) {
  try {
    // Именно `await`, а не возврат обещания: иначе сбой записи пролетит мимо перехвата,
    // и «Сохранить поверх» затрёт файл, хотя версия не записалась.
    return await записать({editorDir, repo, settings, git, ref, rel});
  } catch (error) {
    console.error(error);
    if (обязательно) throw new ApiError(500, settings['ошибкиСервера']['неУдалосьЗаписатьВерсию']);
    return null;
  }
}

async function записать({editorDir, repo, settings, git, ref, rel}) {
  const file = path.join(repo, rel);
  if (!fs.existsSync(file)) return null;

  const текстФайла = fs.readFileSync(file, 'utf8');
  const снимок = latestSnapshot(editorDir, settings, rel);
  // Известное состояние: наш последний снимок, а если снимков нет — файл в опубликованной версии сайта.
  // Нет и там — известного состояния не существует, и первое увиденное содержимое надо сохранить.
  const известное = снимок === null
    ? await showFile(git, ref, rel)
    : snapshotText(editorDir, settings, rel, снимок['имя']);

  if (!естьВнешняяПравка({текстФайла, известное})) return null;

  const времяФайла = fs.statSync(file).mtime.toISOString();
  const {грязный, авторКоммита} = await gitFacts(git, rel);

  const автор = авторПравки({
    файлГрязный: грязный,
    авторКоммита,
    снимок,
    времяФайла,
    неизвестный: settings['реестр']['неизвестныйАвтор'],
  });
  const когда = времяВерсии({
    времяФайла,
    времяПоследнейВерсии: снимок?.['когда'] ?? null,
    сейчас: new Date().toISOString(),
  });

  saveSnapshot(editorDir, settings, rel, текстФайла, автор, когда);
  return {когда, автор};
}
