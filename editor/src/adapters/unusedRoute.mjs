// Ручка `/api/publish/tidy`: убрать лишние файлы папки статьи в корзину, когда публиковать больше
// нечего.
//
// **Зачем отдельная ручка.** Обычно лишнее уносит сама запись статьи (`publishRoute.mjs`). Но бывает,
// что кроме лишнего файла публиковать нечего вовсе — его нет ни на сайте, ни в изменениях, — и до
// записи ход не доходит. Окно при этом уже назвало человеку файл, который уберётся. Промолчи
// программа здесь — её слово разошлось бы с делом: список показан, а файл остался лежать.
//
// Git эта ручка не трогает ничем: ни индекса, ни коммита, ни отправки. Работа только с диском —
// перенос в корзину редактора, откуда человек возвращает всё одним нажатием.
//
// Согласие человека приходит отдельным признаком, как у записи: случайный повтор запроса не должен
// уносить файлы сам по себе. Замок публикации берётся общий — иначе уборка и запись статьи взялись
// бы за одни и те же файлы разом.

import path from 'node:path';
import fs from 'node:fs';

import {годныйПуть} from './releaseFacts.mjs';
import {отмеченныеВерсии} from './publishVersions.mjs';
import {взятьЗамок, отпустить} from './publishLock.mjs';
import {убратьЛишнее} from './unusedFacts.mjs';
import {badFields, badPath} from './httpBody.mjs';

/** Обрабатывает `/api/publish/tidy`. Возвращает true, если запрос был к ней. */
export async function unusedRoute({req, res, url, repo, editorDir, settings, тело, insideRepo, send}) {
  if (url.pathname !== '/api/publish/tidy' || req.method !== 'POST') return false;

  const ошибки = settings['ошибкиСервера'];
  const payload = await тело(req);
  const плохоеТело = badFields(payload, ['path'], ошибки);
  if (плохоеТело) {
    send(res, плохоеТело.status, {error: плохоеТело.error});
    return true;
  }

  const rel = payload.path;
  const bad = badPath([rel], (p) => insideRepo(path.join(repo, p)), (p) => fs.existsSync(path.join(repo, p)), ошибки);
  if (bad || !годныйПуть(rel, settings)) {
    send(res, bad?.status ?? 400, {error: bad?.error ?? ошибки['неПутьСтатьи']});
    return true;
  }

  // Те же отмеченные языки и тот же заслон пути, что у показа состава и у записи: галочкой нельзя
  // добраться до чужой папки.
  const отмечены = отмеченныеВерсии({payload, rel, repo, settings, insideRepo});
  if (отмечены.ошибка) {
    send(res, 400, {error: отмечены.ошибка});
    return true;
  }

  if (payload['подтверждено'] !== true) {
    send(res, 400, {error: ошибки['нетПодтверждения']});
    return true;
  }

  if (!взятьЗамок()) {
    send(res, 409, {error: settings['отказыКоммита']['идётЗапись'], код: 'идётЗапись'});
    return true;
  }

  try {
    const итог = убратьЛишнее({repo, editorDir, settings, версии: отмечены.версии});
    if (итог.ошибка) {
      send(res, 500, {error: settings['отказыКоммита'][итог.ошибка], код: итог.ошибка});
      return true;
    }
    send(res, 200, {path: rel, убрано: итог.убрано, корзина: итог.корзина ?? null});
  } finally {
    отпустить();
  }

  return true;
}
