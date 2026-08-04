// Ручка видимости статьи: `unlisted` в шапке каждой языковой версии.
// Вынесено из сервера, чтобы он оставался в пределах лимита размера файла (SPEC 4.9).

import fs from 'node:fs';
import path from 'node:path';

import {buildHead, joinArticle, splitArticle} from '../core/articleFile.mjs';
import {setUnlisted} from '../core/frontmatterRules.mjs';
import {badPath} from './httpBody.mjs';

/**
 * Обрабатывает `/api/visibility`. Возвращает true, если запрос её.
 * Плохой или отсутствующий путь — ошибка, а не тихий пропуск: иначе интерфейс сменит
 * видимость, хотя на диске ничего не записалось.
 * `фиксировать` — сохранение внешней правки версией: ручка переписывает настоящий файл,
 * поэтому чужая правка обязана лечь в историю до записи, как и при обычном сохранении.
 */
export async function visibilityRoute({req, res, url, repo, settings, тело, insideRepo, send, фиксировать}) {
  if (url.pathname !== '/api/visibility' || req.method !== 'POST') return false;

  const payload = await тело(req);
  const paths = payload.paths;

  const bad = badPath(
    paths,
    (rel) => insideRepo(path.join(repo, rel)),
    (rel) => fs.existsSync(path.join(repo, rel)),
    settings['ошибкиСервера'],
  );
  if (bad) {
    send(res, bad.status, {error: bad.error});
    return true;
  }

  const changed = [];
  for (const rel of paths) {
    await фиксировать(rel, true);

    const file = path.join(repo, rel);
    const current = splitArticle(fs.readFileSync(file, 'utf8'));
    const next = setUnlisted(current.frontmatterRaw, payload.скрыть === true);
    if (next === current.frontmatterRaw) continue; // уже в нужном состоянии — не ошибка

    const toEol = (text) => (current.eol === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text.replace(/\r\n/g, '\n'));
    const head = buildHead({frontmatterRaw: toEol(next), eol: current.eol, метка: current.метка});

    fs.writeFileSync(file, joinArticle({head, body: current.body}), 'utf8');
    changed.push(rel);
  }

  send(res, 200, {changed});
  return true;
}
