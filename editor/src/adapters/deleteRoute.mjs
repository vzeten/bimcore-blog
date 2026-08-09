// Ручка удаления статьи. Правила — в `core/deleteArticle.mjs`, работа с диском — в `deleteArticle.mjs`.
// Отдельным модулем, как и остальные ручки: сервер иначе выходит за предел размера файла (SPEC 4.9).

import fs from 'node:fs';
import path from 'node:path';

import {удалитьСтатью} from './deleteArticle.mjs';
import {badFields, badPath} from './httpBody.mjs';

/**
 * Обрабатывает `/api/article/delete`. Возвращает true, если запрос был к ней.
 *
 * Причина отказа приходит кодом, а слова человеку берутся из настроек: коды — договор сервера
 * и окна, текст меняется без правки кода (SPEC 4.4).
 */
export async function deleteRoute({
  req, res, url, repo, editorDir, settings, git, publishedRef, тело, insideRepo, send, articles,
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
  // проверки путь к картинке внутри папки статьи сошёл бы за «версию», и вместе с ней уехал бы
  // и сам текст: ручка стирает папку целиком. Для необратимого действия догадки недопустимы.
  const свод = await articles();
  const этоСтатья = свод.some((статья) => Object.values(статья.versions).some((v) => v.path === payload.path));
  if (!этоСтатья) {
    send(res, 404, {error: settings['ошибкиУдаления']['нетСтатьи'], причина: 'нетСтатьи', стёрто: []});
    return true;
  }

  const итог = await удалитьСтатью({
    repo, editorDir, settings, git, ref: publishedRef(), rel: payload.path,
  });

  if (итог.ошибка) {
    // Статья на сайте — не поломка программы, а состояние мира: 409, как и занятый путь
    // при создании. Нет статьи — 404. Сбой посреди стирания — наша беда, 500. Остальное —
    // отказ по правилам, то есть плохой запрос.
    const код = {ужеНаСайте: 409, нетСтатьи: 404, удалилосьНеВсё: 500}[итог.ошибка] ?? 400;
    // Перечень уже стёртого уходит вместе с отказом: без него человек не знает, что именно
    // исчезло, а список статей ему об этом скажет только про статьи, не про картинки.
    send(res, код, {
      error: settings['ошибкиУдаления'][итог.ошибка],
      причина: итог.ошибка,
      стёрто: итог.стёрто ?? [],
    });
    return true;
  }

  send(res, 200, итог);
  return true;
}
