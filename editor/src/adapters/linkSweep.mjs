// Уборка ссылок на снятую статью в файлах на компьютере: `/api/links/sweep`.
//
// Зовётся ходом удаления после отправки снятия и до корзины: на сайте ссылки уже стали текстом, и
// диск обязан сказать то же самое, иначе следующая публикация соседа вернула бы на сайт битую
// ссылку. Правило то же, что у снятия (`core/siteRoutes.mjs`), только по местным файлам.
//
// **Локальный файл правится, даже если он разошёлся с сайтом.** Неопубликованная работа человека
// в нём остаётся, уходит только ссылка на статью, которой больше нет. Каждый файл ложится целиком
// (временный файл и замена одной операцией), прежний и новый текст остаются снимками в истории.
//
// Статья к этому часу ещё на диске: адреса и файлы, от которых считается уборка, берутся у неё.
//
// **Черновики автосохранения правятся тоже** (добавка ВК к этапу 2): работа, принятая сервером, но
// не записанная в файл, вернула бы ссылку при следующем сохранении соседа. У черновика правится
// только тело; его база сдвигается на новый файл, если стояла на прежнем, — иначе открытие соседа
// увидело бы «файл изменён снаружи» там, где изменилась одна и та же ссылка.
//
// `толькоВерсия: true` — уборка ссылок на языковые версии, ставшие недоступными публикацией
// (правило ВК, п.7): целями служат только их адреса, остальные языки статьи на сайте остаются.
// Версии перечислены в `версии` (этап 3: несколько языков одной публикацией), без него — одна `path`.

import fs from 'node:fs';
import path from 'node:path';

import {адресВерсии, безСсылок} from '../core/siteRoutes.mjs';
import {splitArticle} from '../core/articleFile.mjs';
import {годныйПуть} from './releaseFacts.mjs';
import {путиСтатей} from './library.mjs';
import {fingerprint, latestSnapshot, listDrafts, saveDraft, saveSnapshot, snapshotText} from './draftStore.mjs';
import {gitAuthor} from './gitFile.mjs';
import {положитьЦеликом} from './trashStore.mjs';
import {образцыЦелей, откудаСсылка, сведенияСайта} from './linkFacts.mjs';
import {целиСтатьи} from './retireFacts.mjs';
import {отмеченныеВерсии} from './publishVersions.mjs';
import {badFields, badPath} from './httpBody.mjs';

/** Обрабатывает `/api/links/sweep`. Возвращает true, если запрос был к ней. */
export async function linkSweepRoute({req, res, url, repo, editorDir, settings, git, тело, insideRepo, send}) {
  if (url.pathname !== '/api/links/sweep' || req.method !== 'POST') return false;

  const payload = await тело(req);
  const плохоеТело = badFields(payload, ['path'], settings['ошибкиСервера']);
  if (плохоеТело) {
    send(res, плохоеТело.status, {error: плохоеТело.error});
    return true;
  }
  const rel = payload.path;
  const bad = badPath([rel], (p) => insideRepo(path.join(repo, p)), (p) => fs.existsSync(path.join(repo, p)), settings['ошибкиСервера']);
  if (bad || !годныйПуть(rel, settings)) {
    send(res, bad?.status ?? 400, {error: bad?.error ?? settings['ошибкиСервера']['неПутьСтатьи']});
    return true;
  }

  const версии = payload['толькоВерсия'] === true ? отмеченныеВерсии({payload, rel, repo, settings, insideRepo}) : null;
  if (версии?.ошибка) {
    send(res, 400, {error: версии.ошибка});
    return true;
  }
  const цели = версии !== null ? целиВерсий(repo, settings, версии.версии) : await целиСтатьи({git, repo, settings, rel});
  const автор = (await gitAuthor(git)) ?? settings['реестр']['неизвестныйАвтор'];
  send(res, 200, убратьНаДиске({repo, editorDir, settings, цели, автор}));
  return true;
}

/**
 * Убрать ссылки на статью во всех документах сайта на диске, кроме файлов самой статьи.
 * Возвращает `{изменены, невосстановленные}`: во втором — файлы, которые записать не вышло или где
 * после уборки осталось непонятное; их человеку называют, и корзина ждёт повтора.
 */
export function убратьНаДиске({repo, editorDir, settings, цели, автор, сейчас = new Date().toISOString()}) {
  const сайт = сведенияСайта(repo, settings);
  const части = образцыЦелей(цели);
  const изменены = [];
  const невосстановленные = [];
  if (части.length === 0) return {изменены, невосстановленные};
  const прежние = new Map();

  const корни = settings['контент'].filter((root) => root['наСайте'] === true);
  for (const путь of путиСтатей(repo, settings, корни)) {
    if (цели.файлы.has(путь)) continue;
    const полный = path.join(repo, путь);
    let текст;
    try {
      текст = fs.readFileSync(полный, 'utf8');
    } catch {
      невосстановленные.push(путь);
      continue;
    }
    if (!части.some((часть) => текст.includes(часть))) continue;

    const итог = безСсылок(текст, цели, откудаСсылка(путь, текст, сайт));
    if (итог.непонятные.length > 0) {
      невосстановленные.push(путь);
      continue;
    }
    if (итог.заменено === 0) continue;

    try {
      положитьЦеликом(editorDir, полный, Buffer.from(итог.текст, 'utf8'), true);
      изменены.push(путь);
      прежние.set(путь, {было: fingerprint(текст), стало: итог.текст});
    } catch (ошибка) {
      console.error(ошибка);
      невосстановленные.push(путь);
      continue;
    }
    // История: прежний текст, если его там ещё нет, и новый. Служебное — файл уже записан, и сбой
    // истории не превращает уборку в неудачу.
    try {
      const последний = latestSnapshot(repo, settings, путь);
      if (последний === null || snapshotText(repo, settings, путь, последний['имя']) !== текст) {
        const раньше = new Date(Date.parse(сейчас) - 1).toISOString();
        saveSnapshot(repo, settings, путь, текст, settings['реестр']['неизвестныйАвтор'], раньше);
      }
      saveSnapshot(repo, settings, путь, итог.текст, автор, сейчас);
    } catch (ошибка) {
      console.error(ошибка);
    }
  }

  убратьВЧерновиках({repo, settings, сайт, цели, части, прежние, невосстановленные});
  return {изменены, невосстановленные};
}

/**
 * Подтверждённые черновики автосохранения соседей. Ссылка уходит из тела; база черновика, стоявшая
 * на прежнем файле, сдвигается на новый. Не вышло — путь в `невосстановленные`, как и у файла.
 */
function убратьВЧерновиках({repo, settings, сайт, цели, части, прежние, невосстановленные}) {
  for (const черновик of listDrafts(repo, settings)) {
    const путь = черновик['path'];
    const файл = прежние.get(путь);
    if (!сайт.корни.some((корень) => путь.startsWith(`${корень}/`))) continue;
    if (цели.файлы.has(путь) || (файл === undefined && !части.some((часть) => черновик['body'].includes(часть)))) continue;
    const шапка = `---\n${черновик['frontmatterRaw']}\n---\n`;
    // Перевод строки впереди не даёт телу, начатому чертой `---`, прочитаться шапкой.
    const итог = безСсылок(`\n${черновик['body']}`, цели, откудаСсылка(путь, шапка, сайт));
    if (итог.непонятные.length > 0) {
      невосстановленные.push(путь);
      continue;
    }
    if (итог.заменено === 0 && файл === undefined) continue;
    const новый = {...черновик, body: итог.текст.slice(1)};
    if (файл !== undefined && черновик['отпечатокБазы'] === файл.было) {
      const {frontmatterRaw, body} = splitArticle(файл.стало);
      Object.assign(новый, {отпечатокБазы: fingerprint(файл.стало)},
        typeof черновик['базаТело'] === 'string' ? {базаШапка: frontmatterRaw, базаТело: body} : {});
    }
    try {
      saveDraft(repo, settings, новый);
    } catch (ошибка) {
      console.error(ошибка);
      невосстановленные.push(путь);
    }
  }
}

/** Цели уборки — названные языковые версии: адрес каждой в её языке и её файл. */
function целиВерсий(repo, settings, версии) {
  const цели = {адреса: new Set(), файлы: new Set()};
  for (const rel of версии) {
    let текст = '';
    try {
      текст = fs.readFileSync(path.join(repo, rel), 'utf8');
    } catch {
      // Файла нет — адрес возьмётся по пути, как его считает сам сайт.
    }
    const адрес = адресВерсии(rel, текст, сведенияСайта(repo, settings));
    if (адрес !== '') цели.адреса.add(адрес);
    цели.файлы.add(rel);
  }
  return цели;
}
