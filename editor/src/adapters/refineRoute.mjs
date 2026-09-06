// Ручки «Доработать»: план (только чтение) и применение выбранных обработчиков одной операцией.
//
// Снимок открытой версии читается одним заходом — текст, байты всех файлов, о которых она говорит,
// перечень имён её папки — и сворачивается в отпечаток. План отдаёт его окну; применение требует
// его назад, а после всех долгих вычислений (скрипт картинок, автор из git) сверяет снимок ещё раз
// и от этой сверки до истории и файлов идёт без единого `await`: изменение снаружи в любой момент
// даёт 409 без единой постоянной записи. Версия до операции пишется из того же проверенного снимка,
// поэтому отдельная фиксация внешней правки здесь не зовётся. Граница атомарности — файловая
// операция `refineWrite`; черновик и состояние обслуживаются после и сбоем операции не считаются.
// Правил доработки здесь нет: реестр и оркестрация в `core/refine.mjs`.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {ИНСТРУМЕНТЫ_ПЛАНА, ОБРАБОТЧИКИ, ПО_УМОЛЧАНИЮ, выполнить} from '../core/refine.mjs';
import {именаМедиа} from '../core/refineText.mjs';
import {afterEdit} from '../core/articleState.mjs';
import {папкаСтатьи, цельВнутриСтатьи} from './assetGuards.mjs';
import {dropDraft, fingerprint, saveSnapshot} from './draftStore.mjs';
import {gitAuthor} from './gitFile.mjs';
import {ApiError, badFields} from './httpBody.mjs';
import {инструментыМедиа} from './imagePrep.mjs';
import {loadState, saveState} from './library.mjs';
import {АварияОтката, записатьНабор} from './refineWrite.mjs';

/** Статьи, над которыми применение уже идёт: второе параллельное — гонка на тех же файлах. */
const занятые = new Set();

export async function refineRoute({req, res, url, repo, editorDir, settings, git, тело, insideRepo, send, последняяПравка}) {
  const план = url.pathname === '/api/refine/plan';
  if ((!план && url.pathname !== '/api/refine/apply') || req.method !== 'POST') return false;

  const ошибки = settings['ошибкиСервера'];
  const payload = await тело(req);
  const плохо = badFields(payload, ['path'], ошибки);
  if (плохо) {
    send(res, плохо.status, {error: плохо.error});
    return true;
  }
  const rel = payload.path;
  const dir = папкаСтатьи(repo, rel, insideRepo);
  if (dir === null) {
    send(res, 404, {error: ошибки['нетСтатьи']});
    return true;
  }
  const выбранные = набор(payload['выбранные']);

  if (план) {
    const снимок = собратьСнимок(repo, rel, dir);
    const {отчёт} = await выполнить(снимок, выбранные, settings, ИНСТРУМЕНТЫ_ПЛАНА);
    send(res, 200, {path: rel, отпечаток: снимок.отпечаток, обработчики: отчёт});
    return true;
  }
  if (typeof payload['отпечаток'] !== 'string' || payload['отпечаток'] === '') {
    send(res, 400, {error: ошибки['плохойЗапрос']});
    return true;
  }
  if (занятые.has(rel)) {
    send(res, 409, {error: ошибки['доработкаИдёт']});
    return true;
  }
  занятые.add(rel);
  try {
    await применить({repo, editorDir, settings, git, rel, dir, выбранные, ждали: payload['отпечаток'], send, res, последняяПравка});
  } finally {
    занятые.delete(rel);
  }
  return true;
}

/** Набор кодов из запроса: только известные реестру; нет поля — умолчание реестра. */
function набор(значение) {
  if (!Array.isArray(значение)) return ПО_УМОЛЧАНИЮ;
  const известные = new Set(ОБРАБОТЧИКИ.map((з) => з.код));
  return значение.filter((код) => известные.has(код));
}

async function применить({repo, editorDir, settings, git, rel, dir, выбранные, ждали, send, res, последняяПравка}) {
  const ошибки = settings['ошибкиСервера'];
  const снимок = собратьСнимок(repo, rel, dir);
  if (снимок.отпечаток !== ждали) return send(res, 409, {error: ошибки['доработкаСнимокУстарел']});

  const {копия, отчёт, изменения} = await выполнить(снимок, выбранные, settings, инструментыМедиа({repo, settings}));
  if (изменения.текст === null && изменения.файлы.length === 0) {
    return send(res, 200, {path: rel, применено: false, обработчики: отчёт, отпечаток: fingerprint(снимок.текст), предупреждения: []});
  }
  const автор = (await gitAuthor(git)) ?? settings['реестр']['неизвестныйАвтор'];
  const сейчас = new Date().toISOString();
  // Последняя сверка после всех `await`: статья, имена и байты медиа. Дальше до истории и файлов —
  // только синхронные шаги, щели для чужой правки нет.
  if (собратьСнимок(repo, rel, dir).отпечаток !== снимок.отпечаток) return send(res, 409, {error: ошибки['доработкаСнимокУстарел']});
  // Версия до операции обязана лечь в историю раньше первой записи: не легла — записи не будет.
  try {
    saveSnapshot(editorDir, settings, rel, снимок.текст, автор, сейчас);
  } catch (ошибка) {
    console.error(ошибка);
    throw new ApiError(500, ошибки['доработкаНеЗаписалась']);
  }
  try {
    записатьНабор({repo, dir, файлСтатьи: path.join(repo, rel), изменения, снимок, ошибки});
  } catch (ошибка) {
    if (ошибка instanceof АварияОтката) return send(res, 500, {error: ошибка.message, авария: true, невосстановлено: ошибка.невосстановлено});
    if (ошибка instanceof ApiError) throw ошибка;
    console.error(ошибка);
    throw new ApiError(500, ошибки['доработкаНеЗаписалась']);
  }

  // Файлы записаны. Обслуживание после — версия итога, черновик, готовность: сбой любого шага
  // называется предупреждением, а не отменой уже применённых файлов.
  const предупреждения = [];
  const обслужить = (шаг, код) => {
    try {
      шаг();
    } catch (ошибка) {
      console.error(ошибка);
      предупреждения.push(код);
    }
  };
  обслужить(() => saveSnapshot(editorDir, settings, rel, копия.текст, автор, new Date().toISOString()), 'история');
  обслужить(() => dropDraft(editorDir, settings, rel), 'черновик');
  обслужить(() => saveState(repo, rel, settings, afterEdit(loadState(repo, rel, settings), settings)), 'состояние');
  последняяПравка.set(rel, сейчас);
  return send(res, 200, {path: rel, применено: true, обработчики: отчёт, отпечаток: fingerprint(копия.текст), предупреждения});
}

/** Снимок одной версии: текст, байты используемых файлов папки, перечень имён (с одним уровнем подпапок). */
export function собратьСнимок(repo, rel, dir) {
  const байтыТекста = fs.readFileSync(path.join(repo, rel));
  const текст = байтыТекста.toString('utf8');
  const файлы = new Map();
  for (const имя of именаМедиа(текст)) {
    const место = цельВнутриСтатьи(dir, `./${имя}`);
    if (место?.есть) файлы.set(имя, fs.readFileSync(место.target));
  }
  const имена = new Set(перечень(dir));
  return {путь: rel, текст, байтыТекста, файлы, имена, отпечаток: отпечаток(rel, байтыТекста, файлы, имена)};
}

function перечень(dir) {
  const имена = [];
  for (const вход of fs.readdirSync(dir, {withFileTypes: true})) {
    if (вход.isFile()) имена.push(вход.name);
    if (вход.isDirectory() && !вход.name.startsWith('.')) {
      for (const внутри of fs.readdirSync(path.join(dir, вход.name), {withFileTypes: true})) {
        if (внутри.isFile()) имена.push(`${вход.name}/${внутри.name}`);
      }
    }
  }
  return имена.sort();
}

/** Куски отделяются длиной, как у отпечатка подготовки: имя и байты могут содержать любой знак. */
function отпечаток(rel, байтыТекста, файлы, имена) {
  const хеш = crypto.createHash('sha1');
  const кусок = (байты) => {
    хеш.update(`${байты.length}:`);
    хеш.update(байты);
  };
  кусок(Buffer.from(rel, 'utf8'));
  кусок(байтыТекста);
  for (const имя of [...файлы.keys()].sort()) {
    кусок(Buffer.from(имя, 'utf8'));
    кусок(файлы.get(имя));
  }
  кусок(Buffer.from([...имена].sort().join('\n'), 'utf8'));
  return хеш.digest('hex');
}
