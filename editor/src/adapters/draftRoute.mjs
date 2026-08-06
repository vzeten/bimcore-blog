// Ручка автосохранения: пишет черновик рядом с редактором и НЕ трогает настоящий `.mdx`.
// Вынесено из сервера, чтобы он оставался в пределах лимита размера файла (SPEC 4.9).
// Правила порядка и разбора живут в ядре (`core/drafts.mjs`), здесь только файлы и ответы.

import fs from 'node:fs';
import path from 'node:path';

import {splitArticle} from '../core/articleFile.mjs';
import {newDraft, позже, свежееЧерновика} from '../core/drafts.mjs';
import {dropDraft, loadDraft, saveDraft} from './draftStore.mjs';
import {badPath} from './httpBody.mjs';

/**
 * Обрабатывает `/api/draft`. Возвращает true, если запрос был к ней.
 * `последняяПравка` — память сервера о времени последней принятой правки по каждой статье.
 */
export async function draftRoute({req, res, url, repo, editorDir, settings, тело, insideRepo, send, последняяПравка}) {
  if (url.pathname !== '/api/draft' || req.method !== 'POST') return false;

  const payload = await тело(req);
  const rel = payload.path;
  const bad = badPath(
    [rel],
    (p) => insideRepo(path.join(repo, p)),
    (p) => fs.existsSync(path.join(repo, p)),
    settings['ошибкиСервера'],
  );
  if (bad) {
    send(res, bad.status, {error: bad.error});
    return true;
  }

  // Запрос мог быть прерван браузером, но приняться сервером: старая правка не должна ни затирать,
  // ни удалять уже записанную свежую. Порядок — по времени правки в окне, а не прихода запроса.
  // Порог берётся и из памяти: настоящее сохранение убирает черновик, и без памяти
  // задержавшийся старый запрос воскресил бы его поверх уже сохранённой работы.
  const порог = позже(последняяПравка.get(rel), loadDraft(editorDir, settings, rel)?.['правкаОт']);
  if (!свежееЧерновика(payload.правкаОт, {правкаОт: порог})) {
    send(res, 200, {автосохранено: null, устарел: true});
    return true;
  }
  последняяПравка.set(rel, позже(payload.правкаОт, порог));

  // Имя «тело» здесь занято чтением запроса, поэтому текст статьи назван иначе.
  const текстЧерновика = String(payload.body ?? '');
  const шапка = String(payload.frontmatterRaw ?? '');

  // Черновик, слово в слово равный файлу, хранить незачем. Заодно это закрывает гонку:
  // запрос, посланный до кнопки «Сохранить», не воскресит черновик уже сохранённой работы.
  const текущий = splitArticle(fs.readFileSync(path.join(repo, rel), 'utf8'));
  if (текущий.body === текстЧерновика && текущий.frontmatterRaw === шапка) {
    dropDraft(editorDir, settings, rel);
    send(res, 200, {автосохранено: null, совпадаетСФайлом: true});
    return true;
  }

  const когда = new Date().toISOString();
  saveDraft(editorDir, settings, newDraft({
    path: rel,
    frontmatterRaw: шапка,
    body: текстЧерновика,
    отпечатокБазы: String(payload.отпечатокБазы ?? ''),
    когда,
    правкаОт: typeof payload.правкаОт === 'string' ? payload.правкаОт : когда,
  }));

  send(res, 200, {автосохранено: когда});
  return true;
}
