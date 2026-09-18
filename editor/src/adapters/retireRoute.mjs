// Ручки снятия статьи с сайта: `/api/retire` — что снимется и сколько статей получат правку ссылок,
// `/api/retire/commit` — запись снятия в хранилище после согласия человека.
//
// **Полной сборки сайта здесь нет** (решение владельца 2026-09-18, п.4: долгую сборку на компьютере
// убрать). Снятие только убирает файлы и превращает ссылки на статью в обычный текст; сайт
// собирает GitHub, и при неудаче живой сайт остаётся прежним. Поэтому запись снятия не спрашивает
// память сборки — в отличие от записи статьи (`publishRoute.mjs`), где этот заслон пока стоит.
//
// Остальные заслоны те же, что у публикации: основа закрепляется у сервера заново, очередь
// разбирается против неё, план считается заново и сверяется отпечатком показанного, источники
// открытой версии снимаются до плана. Отправка — общими ручками `/api/publish/plan` и `/push`.

import path from 'node:path';
import fs from 'node:fs';

import {СТРАНИЦА_КАТЕГОРИИ, КОРНЕВАЯ_СТРАНИЦА} from '../core/articleKind.mjs';
import {снятиеВозможно} from '../core/retirePlan.mjs';
import {годныйПуть, отпечатокИсточников, фактыВерсии} from './releaseFacts.mjs';
import {закреплённаяОснова} from './publishBase.mjs';
import {разобратьОчередь} from './publishRepair.mjs';
import {взятьЗамок, отпустить} from './publishLock.mjs';
import {отпечатокПлана} from './planBytes.mjs';
import {записатьПлан} from './planCommit.mjs';
import {планСнятия, путиВерсийНаСайте} from './retireFacts.mjs';
import {badFields, badPath} from './httpBody.mjs';

/** Режим записи снятия: он же метка в очереди, по ней ход узнаёт своё недосланное снятие. */
export const СНЯТИЕ = 'снятие';

/** Обрабатывает обе ручки снятия. Возвращает true, если запрос был к одной из них. */
export async function retireRoute({req, res, url, repo, editorDir, settings, git, тело, insideRepo, send}) {
  const показ = url.pathname === '/api/retire';
  const запись = url.pathname === '/api/retire/commit';
  if ((!показ && !запись) || req.method !== 'POST') return false;

  const payload = await тело(req);
  const плохоеТело = badFields(payload, ['path'], settings['ошибкиСервера']);
  if (плохоеТело) {
    send(res, плохоеТело.status, {error: плохоеТело.error});
    return true;
  }

  const rel = payload.path;
  const bad = badPath([rel], (p) => insideRepo(path.join(repo, p)), (p) => fs.existsSync(path.join(repo, p)), settings['ошибкиСервера']);
  if (bad) {
    send(res, bad.status, {error: bad.error});
    return true;
  }
  if (!годныйПуть(rel, settings)) {
    send(res, 400, {error: settings['ошибкиСервера']['неПутьСтатьи']});
    return true;
  }
  // Страница раздела держит под собой другие статьи: снимать её значит уронить раздел целиком.
  if ([СТРАНИЦА_КАТЕГОРИИ, КОРНЕВАЯ_СТРАНИЦА].includes(фактыВерсии(repo, rel, settings)?.вид)) {
    send(res, 400, {error: settings['ошибкиУдаления']['страницаРаздела'], код: 'страницаРаздела'});
    return true;
  }
  // Согласие человека приходит отдельным признаком: случайный повтор запроса снятием не становится.
  if (запись && (payload['подтверждено'] !== true || typeof payload['отпечаток'] !== 'string' || payload['отпечаток'] === '')) {
    send(res, 400, {error: settings['ошибкиСервера']['нетПодтверждения']});
    return true;
  }

  // Под замком публикации — весь заход: основа, очередь, план и запись идут от одного снимка.
  if (!взятьЗамок()) return отказ(res, send, settings, 'идётЗапись');
  try {
    return await снять({rel, payload, запись, repo, editorDir, settings, git, res, send});
  } finally {
    отпустить();
  }
}

async function снять({rel, payload, запись, repo, editorDir, settings, git, res, send}) {
  const место = путиВерсийНаСайте(rel, settings);
  // Статья вне сайта (песочница): снимать нечего, и сервер сайта спрашивать незачем.
  if (место.length === 0) return показать(res, send, {наСайте: false, статей: 0, отпечаток: null});

  const основа = await закреплённаяОснова({git, settings});
  if (основа.ошибка) return отказ(res, send, settings, 'сайтНеизвестен');

  const очередь = await разобратьОчередь({git, repo, editorDir, settings, основа: основа.основа});
  if (очередь.ошибка) return отказ(res, send, settings, очередь.ошибка);
  const ждёт = очередь.ожидающие.at(-1);
  if (ждёт !== undefined) {
    // Своё недосланное снятие ход досылает сам; чужую запись досылает только «Опубликовать».
    const своё = ждёт.режим === СНЯТИЕ && место.some((версия) => версия.путь === ждёт.путь);
    return отказ(res, send, settings, своё ? 'снятиеНеДослано' : 'естьНеотправленное');
  }

  // Источники открытой версии снимаются ДО плана: ровно это значение ляжет в очередь, и отправка
  // перед самым `push` сверит с ним диск.
  const источники = отпечатокИсточников(repo, rel, settings);
  const план = await планСнятия({git, repo, settings, rel, основа: основа.основа});
  if (план.ошибка) return отказ(res, send, settings, план.ошибка);
  if (!план.наСайте) return показать(res, send, {наСайте: false, статей: 0, отпечаток: null});
  if (план.разрывы.length > 0) return отказ(res, send, settings, план.разрывы[0].причина, {разрывы: план.разрывы});
  if (!снятиеВозможно(план) || план.отказ) return отказ(res, send, settings, 'составНеДоказан', {отказ: план.отказ ?? null});

  const отпечаток = отпечатокПлана({основа: основа.основа, родитель: основа.основа, записи: план.записи, режим: СНЯТИЕ});
  if (!запись) return показать(res, send, {наСайте: true, статей: план.статей, отпечаток});

  // Согласие относится к показанному плану. Сайт или статья изменились — спросить заново.
  if (payload['отпечаток'] !== отпечаток) return отказ(res, send, settings, 'статьяИзменилась');
  if (отпечатокИсточников(repo, rel, settings) !== источники) return отказ(res, send, settings, 'статьяИзменилась');

  const итог = await записатьПлан({
    git, repo, editorDir, settings, основа: основа.основа, записи: план.записи, rel, отпечаток, источники,
    сообщение: String(settings['выпуск']['сообщениеСнятия']).replace('{статья}', rel),
    ещё: {режим: СНЯТИЕ},
  });
  if (итог.ошибка) return отказ(res, send, settings, итог.ошибка);

  send(res, 200, {path: rel, коммит: итог.коммит.короткий, sha: итог.коммит.полный, пути: итог.пути, ссылкиВСтатьях: план.статей});
  return true;
}

function показать(res, send, ответ) {
  send(res, 200, ответ);
  return true;
}

/**
 * Отказ кодом и словами человеку. Слова снятия — в `ошибкиУдаления`; коды, общие с публикацией,
 * говорят знакомыми фразами записи и отправки. Кода без своей фразы быть не должно.
 */
function отказ(res, send, settings, код, ещё = {}) {
  const слова = settings['ошибкиУдаления'][код] ?? settings['отказыКоммита'][код] ?? settings['отказыОтправки'][код];
  send(res, 409, {error: typeof слова === 'string' ? слова : `${settings['ошибкиСервера']['внутренняя']} (${код})`, код, ...ещё});
  return true;
}
