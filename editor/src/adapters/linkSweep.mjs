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

import fs from 'node:fs';
import path from 'node:path';

import {безСсылок} from '../core/siteRoutes.mjs';
import {годныйПуть} from './releaseFacts.mjs';
import {путиСтатей} from './library.mjs';
import {latestSnapshot, saveSnapshot, snapshotText} from './draftStore.mjs';
import {gitAuthor} from './gitFile.mjs';
import {положитьЦеликом} from './trashStore.mjs';
import {образцыЦелей, откудаСсылка, сведенияСайта} from './linkFacts.mjs';
import {целиСтатьи} from './retireFacts.mjs';
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

  const цели = await целиСтатьи({git, repo, settings, rel});
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

  return {изменены, невосстановленные};
}
