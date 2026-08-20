// Ручка создания статьи. Правила — в `core/newArticle.mjs`, запись — в `createArticle.mjs`.
// Вынесено из сервера, чтобы он оставался в пределах лимита размера файла (SPEC 4.9).

import fs from 'node:fs';
import path from 'node:path';

import {адресИзНазвания} from '../core/newArticle.mjs';
import {createArticle} from './createArticle.mjs';
import {saveSnapshot} from './draftStore.mjs';
import {gitAuthor} from './gitFile.mjs';
import {badFields} from './httpBody.mjs';

/**
 * Обрабатывает `/api/article/new`. Возвращает true, если запрос был к ней.
 *
 * Причины отказа приходят кодом, а человеческий текст берётся из настроек: коды — внутренний
 * договор сервера и окна, слова человеку меняются без правки кода (SPEC 4.4).
 */
export async function createRoute({req, res, url, repo, editorDir, settings, git, тело, send}) {
  if (url.pathname !== '/api/article/new' || req.method !== 'POST') return false;

  const payload = await тело(req);
  const плохоеТело = badFields(payload, ['раздел', 'название'], settings['ошибкиСервера']);
  if (плохоеТело) {
    send(res, плохоеТело.status, {error: плохоеТело.error});
    return true;
  }

  const итог = createArticle({
    repo,
    settings,
    раздел: payload['раздел'],
    название: payload['название'],
    адрес: typeof payload['адрес'] === 'string' ? payload['адрес'] : '',
    язык: typeof payload['язык'] === 'string' ? payload['язык'] : '',
  });

  if (итог.ошибка) {
    // Занятый путь и занятый адрес — не поломка программы, а состояние мира: 409, как у конфликта
    // при сохранении. Остальное — плохой запрос либо сбой записи.
    const код = {путьЗанят: 409, адресЗанят: 409, неЗаписалось: 500}[итог.ошибка] ?? 400;
    // Где именно занято — часть самой причины: без адреса человеку некуда идти разбираться.
    const текст = settings['ошибкиСоздания'][итог.ошибка];
    send(res, код, {
      error: итог.занято ? `${текст} ${итог.занято}` : текст,
      причина: итог.ошибка,
      занято: итог.занято ?? null,
    });
    return true;
  }

  // Кто создал статью, известно точно: её создали мы. Без снимка реестр покажет автором
  // «Неизвестный» у статьи, которую человек только что завёл своими руками: он берёт автора
  // из git и истории, а незакоммиченный файл git ещё не знает.
  try {
    const автор = (await gitAuthor(git)) ?? settings['реестр']['неизвестныйАвтор'];
    const сейчас = new Date().toISOString();
    // Снимок нужен КАЖДОЙ созданной версии, а не только той, что открылась. Без него реестр
    // подпишет заглушку «Неизвестный», а при первом её открытии посчитает содержимое чужой
    // правкой со стороны — хотя завела файл сама программа.
    for (const версия of итог.версии ?? [итог.path]) {
      saveSnapshot(editorDir, settings, версия, fs.readFileSync(path.join(repo, версия), 'utf8'), автор, сейчас);
    }
  } catch (error) {
    // История — служебный шаг: статья уже создана, и отменять её из-за этого нельзя.
    console.error(error);
  }

  send(res, 200, итог);
  return true;
}

/** Подсказка адреса для окна: показать человеку, что получится, до создания. */
export function адресДляПоказа(название) {
  return адресИзНазвания(название);
}
