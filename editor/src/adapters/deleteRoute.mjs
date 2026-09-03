// Ручка удаления статьи. Правила — в `core/deleteArticle.mjs`, работа с диском — в `deleteArticle.mjs`.
// Отдельным модулем, как и остальные ручки: сервер иначе выходит за предел размера файла (SPEC 4.9).

import fs from 'node:fs';
import path from 'node:path';

import {исполнитьУдаление, решитьУдаление} from './deleteArticle.mjs';
import {badFields, badPath} from './httpBody.mjs';
import {дниКорзины} from './trashStore.mjs';

/**
 * Обрабатывает `/api/article/delete`. Возвращает true, если запрос был к ней.
 *
 * Два захода одним адресом: без `подтверждено` сервер только называет режим — корзина или навсегда —
 * и состав языков, ничего не меняя; с `подтверждено`, равным этому режиму, действует. Подтверждение
 * другого режима — отказ: режим решает сервер по свежим фактам, а не окно по старым.
 * Причина отказа приходит кодом, слова человеку берутся из настроек (SPEC 4.4).
 */
export async function deleteRoute({
  req, res, url, repo, editorDir, settings, git, publishedRef, тело, insideRepo, send, articles, последняяПравка,
}) {
  if (url.pathname !== '/api/article/delete' || req.method !== 'POST') return false;

  const payload = await тело(req);
  const плохоеТело = badFields(payload, ['path'], settings['ошибкиСервера']);
  if (плохоеТело) {
    send(res, плохоеТело.status, {error: плохоеТело.error});
    return true;
  }

  // Путь проверяется до любой работы с файлами: `..` увёл бы удаление за пределы репозитория.
  const плохойПуть = badPath(
    [payload.path],
    (rel) => insideRepo(path.join(repo, rel)),
    (rel) => fs.existsSync(path.join(repo, rel)),
    settings['ошибкиСервера'],
  );
  if (плохойПуть) {
    send(res, плохойПуть.status, {error: плохойПуть.error});
    return true;
  }

  // Удаляется только статья и только та, которую программа сама показывает в списке. Без этой
  // проверки путь к картинке внутри папки статьи сошёл бы за «версию».
  const свод = await articles();
  const статья = свод.find((запись) => Object.values(запись.versions).some((v) => v.path === payload.path));
  if (статья === undefined) {
    send(res, 404, {error: settings['ошибкиУдаления']['нетСтатьи'], причина: 'нетСтатьи', стёрто: []});
    return true;
  }

  const решение = await решитьУдаление({repo, settings, git, ref: publishedRef(), rel: payload.path});
  if (решение.ошибка) {
    send(res, решение.ошибка === 'нетСтатьи' ? 404 : 400, {error: settings['ошибкиУдаления'][решение.ошибка], причина: решение.ошибка, стёрто: []});
    return true;
  }

  const ответ = {режим: решение.режим, причина: решение.причина, пути: решение.пути, языки: решение.языки, дней: дниКорзины(settings)};
  if (payload.подтверждено === undefined) {
    send(res, 200, ответ);
    return true;
  }
  if (payload.подтверждено !== решение.режим) {
    send(res, 409, {...ответ, error: settings['ошибкиУдаления']['подтверждениеНеТо'], причина: 'подтверждениеНеТо', стёрто: []});
    return true;
  }

  // Поздний черновик из окна не должен воскресить удалённое: время удаления становится порогом свежести.
  const сейчас = new Date().toISOString();
  for (const версия of решение.пути) последняяПравка?.set(версия, сейчас);

  const итог = исполнитьУдаление({repo, editorDir, settings, решение, статья: {название: статья.title ?? ''}});
  if (итог.ошибка) {
    // Сбой посреди стирания — наша беда, 500; остальное — отказ по правилам.
    const код = {удалилосьНеВсё: 500, переносНеЗавершён: 500}[итог.ошибка] ?? 400;
    send(res, код, {error: settings['ошибкиУдаления'][итог.ошибка], причина: итог.ошибка, стёрто: итог.стёрто ?? []});
    return true;
  }

  send(res, 200, {...итог, дней: ответ.дней});
  return true;
}
