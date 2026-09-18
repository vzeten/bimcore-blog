// Ручки корзины: перечень записей, возврат одной записи и безвозвратное стирание записи.
// Сама работа с архивом — в `trashStore.mjs`.

import {badFields} from './httpBody.mjs';
import {вернутьИзКорзины, списокКорзины} from './trashStore.mjs';
import {стеретьЗапись} from './trashDrop.mjs';

/** Обрабатывает `/api/trash`, `/api/trash/restore` и `/api/trash/drop`. Возвращает true, если запрос их. */
export async function trashRoute({req, res, url, repo, editorDir, settings, тело, send}) {
  if (url.pathname === '/api/trash' && req.method === 'GET') {
    try {
      send(res, 200, {записи: списокКорзины({repo, settings})});
    } catch (error) {
      console.error(error);
      send(res, 500, {error: settings['ошибкиУдаления']['архивПовреждён']});
    }
    return true;
  }

  // Стирание насовсем: двумя заходами, как у удаления статьи. Без `подтверждено` сервер только
  // называет, что именно исчезнет; с ним — стирает. Случайный повтор запроса ничего не уносит.
  if (url.pathname === '/api/trash/drop' && req.method === 'POST') {
    const тело1 = await тело(req);
    const плохо = badFields(тело1, ['id'], settings['ошибкиСервера']);
    if (плохо) {
      send(res, плохо.status, {error: плохо.error});
      return true;
    }
    const записи = списокКорзины({repo, settings});
    const запись = записи.find((з) => з.id === тело1.id);
    if (запись === undefined) {
      send(res, 404, {error: settings['ошибкиУдаления']['нетЗаписи'], причина: 'нетЗаписи'});
      return true;
    }
    if (тело1.подтверждено !== true) {
      send(res, 200, {спрашиваю: true, id: запись.id, название: запись.название ?? '', пути: запись.пути ?? [], языки: запись.языки ?? []});
      return true;
    }
    const итог = стеретьЗапись({repo, settings, id: тело1.id});
    if (итог.ошибка) {
      const код = {нетЗаписи: 404, записьНезавершена: 409}[итог.ошибка] ?? 500;
      send(res, код, {error: settings['ошибкиУдаления'][итог.ошибка], причина: итог.ошибка});
      return true;
    }
    send(res, 200, {стёрто: итог.стёрто});
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
