// Ручки значка «Сайт»: `GET /api/site/state` — как идёт выкладка последней отправки на GitHub,
// `POST /api/site/seen` — человек увидел итог, и значок гаснет. Само слежение — `deployWatch.mjs`.
//
// Окно спрашивает состояние раз в несколько секунд с любого экрана; этот же вопрос будит опрос
// GitHub, если отправка ещё не выложена, — второго опроса при этом не заводится.

import {отметитьПоказ, прочитатьВыкладку} from './deployWatch.mjs';

/** Обрабатывает обе ручки. Возвращает true, если запрос был к одной из них. */
export async function siteStateRoute({req, res, url, editorDir, settings, тело, send, слежение}) {
  if (url.pathname === '/api/site/state' && req.method === 'GET') {
    слежение?.разбудить();
    send(res, 200, дляОкна(прочитатьВыкладку(editorDir, settings)));
    return true;
  }
  if (url.pathname === '/api/site/seen' && req.method === 'POST') {
    const payload = await тело(req);
    if (typeof payload?.sha !== 'string' || payload.sha === '') {
      send(res, 400, {error: settings['ошибкиСервера']['плохойЗапрос']});
      return true;
    }
    send(res, 200, {показано: отметитьПоказ(editorDir, settings, payload.sha)});
    return true;
  }
  return false;
}

/** Окну — только то, что оно показывает: служебные поля опроса (ETag, имя репозитория) не нужны. */
function дляОкна(запись) {
  if (запись === null) return {состояние: 'нет'};
  const {sha, путь, локали, когда, состояние, причина, шаг, runUrl, показано} = запись;
  return {sha, путь, локали, когда, состояние, причина, шаг, runUrl, показано};
}
