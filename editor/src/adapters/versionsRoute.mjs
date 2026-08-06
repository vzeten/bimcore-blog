// Ручки ленты версий: перечень версий статьи и содержимое одной версии.
// Вынесено из сервера, чтобы он оставался в пределах лимита размера файла (SPEC 4.9).
// Правил здесь нет: свёртку в сеансы делает ядро, чтение файлов — хранилище снимков.

import fs from 'node:fs';
import path from 'node:path';

import {splitArticle} from '../core/articleFile.mjs';
import {toSessions, версииИзИмён} from '../core/history.mjs';
import {listSnapshots, snapshotText} from './draftStore.mjs';


/**
 * Обрабатывает `/api/versions` и `/api/version`. Возвращает true, если запрос был к ним.
 *
 * Имя версии приходит от клиента, поэтому путь из него не собирается: имя сверяется с перечнем
 * известных имён этой же статьи. Иначе `имя=../../что-то` увело бы чтение за папку истории.
 */
export async function versionsRoute({req, res, url, repo, editorDir, settings, insideRepo, send}) {
  const лента = url.pathname === '/api/versions';
  const одна = url.pathname === '/api/version';
  if ((!лента && !одна) || req.method !== 'GET') return false;

  const тексты = settings['ошибкиСервера'];
  const rel = url.searchParams.get('path');

  if (typeof rel !== 'string' || rel === '' || !insideRepo(path.join(repo, rel))) {
    send(res, 400, {error: тексты['плохойЗапрос']});
    return true;
  }

  if (!fs.existsSync(path.join(repo, rel))) {
    send(res, 404, {error: тексты['нетСтатьи']});
    return true;
  }

  // Что считается версией — решает ядро, и решает один раз: лента и открытие версии смотрят
  // на один и тот же перечень. Иначе посторонний файл, не попавший в ленту, открывался бы
  // прямым запросом по имени.
  const версии = версииИзИмён(listSnapshots(editorDir, settings, rel));

  if (лента) {
    send(res, 200, {сеансы: toSessions(версии)});
    return true;
  }

  const имя = url.searchParams.get('имя');
  // Сверка со списком, а не проверка образцом: список — единственное доказательство,
  // что такой снимок у этой статьи действительно есть.
  if (typeof имя !== 'string' || !версии.some((версия) => версия.имя === имя)) {
    send(res, 404, {error: тексты['нетВерсии']});
    return true;
  }

  const текст = snapshotText(editorDir, settings, rel, имя);
  if (текст === null) {
    // Снимок был в перечне, но исчез между показом ленты и открытием.
    send(res, 404, {error: тексты['нетВерсии']});
    return true;
  }

  // Разбираем снимок: он хранит весь файл целиком, а человеку нужна статья, а не сырая шапка.
  const {frontmatterRaw, body} = splitArticle(текст);
  send(res, 200, {имя, frontmatterRaw, body});
  return true;
}
