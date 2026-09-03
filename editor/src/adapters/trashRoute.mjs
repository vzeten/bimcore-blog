// Ручки корзины: перечень записей и возврат одной записи. Сама работа с архивом — в `trashStore.mjs`.

import {badFields} from './httpBody.mjs';
import {вернутьИзКорзины, дниКорзины, списокКорзины} from './trashStore.mjs';

/** Обрабатывает `/api/trash` и `/api/trash/restore`. Возвращает true, если запрос был к ним. */
export async function trashRoute({req, res, url, repo, editorDir, settings, тело, send}) {
  if (url.pathname === '/api/trash' && req.method === 'GET') {
    try {
      send(res, 200, {дней: дниКорзины(settings), записи: списокКорзины({editorDir, settings})});
    } catch (error) {
      console.error(error);
      send(res, 500, {error: settings['ошибкиУдаления']['архивПовреждён']});
    }
    return true;
  }

  if (url.pathname !== '/api/trash/restore' || req.method !== 'POST') return false;

  const payload = await тело(req);
  const плохоеТело = badFields(payload, ['id'], settings['ошибкиСервера']);
  if (плохоеТело) {
    send(res, плохоеТело.status, {error: плохоеТело.error});
    return true;
  }

  // Клиент присылает только имя записи: опись читается с диска и проверяется там, а не берётся из запроса.
  const итог = вернутьИзКорзины({repo, editorDir, settings, id: payload.id});
  if (итог.ошибка) {
    const код = {нетЗаписи: 404, возвратКонфликт: 409}[итог.ошибка] ?? 500;
    send(res, код, {error: settings['ошибкиУдаления'][итог.ошибка], причина: итог.ошибка, конфликты: итог.конфликты ?? []});
    return true;
  }
  send(res, 200, итог);
  return true;
}
