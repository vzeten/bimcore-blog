// Ручка видимости статьи: `unlisted` в шапке каждой языковой версии.
// Вынесено из сервера, чтобы он оставался в пределах лимита размера файла (SPEC 4.9).

import fs from 'node:fs';
import path from 'node:path';

import {buildHead, joinArticle, splitArticle} from '../core/articleFile.mjs';
import {setUnlisted} from '../core/frontmatterRules.mjs';
import {badFields, badPath} from './httpBody.mjs';
import {fingerprint, saveSnapshot} from './draftStore.mjs';
import {gitAuthor} from './gitFile.mjs';

/**
 * Обрабатывает `/api/visibility`. Возвращает true, если запрос её.
 * Плохой или отсутствующий путь — ошибка, а не тихий пропуск: иначе интерфейс сменит
 * видимость, хотя на диске ничего не записалось.
 * `фиксировать` — сохранение внешней правки версией: ручка переписывает настоящий файл,
 * поэтому чужая правка обязана лечь в историю до записи, как и при обычном сохранении.
 */
export async function visibilityRoute({req, res, url, repo, editorDir, settings, git, тело, insideRepo, send, фиксировать}) {
  if (url.pathname !== '/api/visibility' || req.method !== 'POST') return false;

  const payload = await тело(req);

  // Тело обязано быть объектом: `null` и число — такой же плохой запрос, как битый JSON,
  // и без проверки чтение полей роняет ручку внутренней ошибкой вместо понятного 400 (SPEC 6.4).
  const плохоеТело = badFields(payload, [], settings['ошибкиСервера']);
  if (плохоеТело) {
    send(res, плохоеТело.status, {error: плохоеТело.error});
    return true;
  }

  const paths = payload.paths;

  // Видимость — это «да» или «нет», и другого значения у неё быть не может. Без проверки любое
  // постороннее значение молча означало бы «показывать в меню»: запрос с опечаткой снял бы
  // `unlisted` со всех языковых версий и получил бы в ответ успех (SPEC 6.4).
  if (typeof payload['скрыть'] !== 'boolean') {
    send(res, 400, {error: settings['ошибкиСервера']['плохойЗапрос']});
    return true;
  }

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

  // Автор известен: файл пишем мы. Спрашиваем один раз на весь запрос — языковых версий несколько,
  // а правка одна и та же.
  const автор = (await gitAuthor(git)) ?? settings['реестр']['неизвестныйАвтор'];

  const changed = [];
  const отпечатки = {};
  const предупреждения = [];

  for (const rel of paths) {
    await фиксировать(rel, true);

    const file = path.join(repo, rel);
    const current = splitArticle(fs.readFileSync(file, 'utf8'));
    const next = setUnlisted(current.frontmatterRaw, payload['скрыть']);
    if (next === current.frontmatterRaw) continue; // уже в нужном состоянии — не ошибка

    const toEol = (text) => (current.eol === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text.replace(/\r\n/g, '\n'));
    const head = buildHead({frontmatterRaw: toEol(next), eol: current.eol, метка: current.метка});

    const текст = joinArticle({head, body: current.body});
    fs.writeFileSync(file, текст, 'utf8');
    changed.push(rel);
    // Окну нужен свежий отпечаток: без него следующее сохранение сравнило бы свою правку
    // с файлом, каким он был до смены видимости, и получило бы ложное «изменён снаружи».
    отпечатки[rel] = fingerprint(текст);

    // Своя запись обязана лечь в историю сразу. Иначе программа при следующем обращении увидит,
    // что файл разошёлся с последним снимком, и запишет собственную работу как чужую правку
    // с автором «Неизвестный» — в ленте появятся версии, которых человек не делал.
    // Сбой истории не отменяет уже записанный файл: он отдельным предупреждением, как в сохранении.
    try {
      // Время берётся здесь, а не до фиксации внешней правки: снимки упорядочены по времени
      // в имени, и наш снимок обязан быть свежее того, что могла записать фиксация. Встань он
      // раньше, последним в истории оказалось бы прежнее содержимое, и следующее обращение
      // снова приняло бы нашу запись за чужую.
      saveSnapshot(editorDir, settings, rel, текст, автор, new Date().toISOString());
    } catch (error) {
      console.error(error);
      if (!предупреждения.includes('история')) предупреждения.push('история');
    }
  }

  send(res, 200, {changed, отпечатки, предупреждения});
  return true;
}
