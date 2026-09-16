// Ручка даты записи блога: какая дата обязана стоять у открытой версии по сегодняшнему сайту.
//
// **Ничего не пишет.** Файл человека меняет окно — тем же сохранением, каким сохраняется любая его
// правка: так дата попадает и в историю версий, и в отпечаток проверок, и в сборку, и в коммит,
// а второго писателя файлов статьи в программе не появляется.
//
// Зовётся окном перед обязательными проверками публикации. Основа закрепляется здесь же и тем же
// способом, что у состава и записи: дата, посчитанная по вчерашнему сайту, развела бы языковые
// версии одной записи по разным дням.

import path from 'node:path';
import fs from 'node:fs';

import {readField, splitArticle} from '../core/articleFile.mjs';
import {articlePlace} from '../core/frontmatterRules.mjs';
import {РОД_БЛОГА} from '../core/publishDate.mjs';
import {закреплённаяОснова} from './publishBase.mjs';
import {датаПоОснове, сегодняшнийДень} from './publishDateFacts.mjs';
import {годныйПуть} from './releaseFacts.mjs';
import {badFields, badPath} from './httpBody.mjs';

/** Обрабатывает `/api/publish/date`. Возвращает true, если запрос был к ней. */
export async function publishDateRoute({req, res, url, repo, settings, git, тело, insideRepo, send}) {
  if (url.pathname !== '/api/publish/date' || req.method !== 'POST') return false;

  const payload = await тело(req);
  const плохоеТело = badFields(payload, [], settings['ошибкиСервера']);
  if (плохоеТело) {
    send(res, плохоеТело.status, {error: плохоеТело.error});
    return true;
  }

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

  // Заслон пути стоит здесь, а не в окне: ответ этой ручки станет строкой в файле статьи, и
  // «из окна такой путь не приходит» защитой не является.
  if (!годныйПуть(rel, settings)) {
    send(res, 400, {error: settings['ошибкиСервера']['неПутьСтатьи']});
    return true;
  }

  // **Род проверяется до всякого вопроса к хранилищу.** Дата живёт только у блога; у документации и
  // песочницы её нет вовсе, и закреплять ради них основу значит спрашивать сервер сайта на каждой
  // публикации без единой причины.
  if (articlePlace(rel, settings['контент']).kind !== РОД_БЛОГА) {
    send(res, 200, {path: rel, нужна: null, вФайле: null});
    return true;
  }

  const основа = await закреплённаяОснова({git, settings});
  if (основа.ошибка) {
    send(res, 409, {error: settings['отказыОтправки'][основа.ошибка] ?? основа.ошибка, код: основа.ошибка});
    return true;
  }

  const итог = await датаПоОснове({
    git, repo, rel, settings, основа: основа.основа, сегодня: сегодняшнийДень(),
  });
  if (итог.ошибка) {
    send(res, 409, {error: settings['отказыКоммита']['составНеДоказан'], код: итог.ошибка});
    return true;
  }

  let вФайле = null;
  try {
    вФайле = readField(splitArticle(fs.readFileSync(path.join(repo, rel), 'utf8')).frontmatterRaw, 'date') || null;
  } catch {
    // Статью удалили или перенесли, пока окно было открыто. Дальше публикация всё равно откажет
    // на своей проверке пути; здесь достаточно честно сказать, что даты в файле нет.
    вФайле = null;
  }

  send(res, 200, {path: rel, нужна: итог.нужна, вФайле});
  return true;
}
