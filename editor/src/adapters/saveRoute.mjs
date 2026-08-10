// Ручка сохранения статьи: запись файла человека и служебные шаги после неё.
// Вынесено из сервера, чтобы он оставался в пределах лимита размера файла (SPEC 4.9).
// Правил здесь нет: они в `core` — сборка файла, защитные правила шапки, состояние версии.
//
// Пишется ровно один файл — тот, что открыт в окне. Видимость принадлежит языковой версии
// (SPEC 2.8), поэтому соседние версии сохранение не трогает ничем: ни записью, ни снимком
// в истории, ни готовностью.

import fs from 'node:fs';
import path from 'node:path';

import {buildHead, joinArticle, nothingChanged, splitArticle} from '../core/articleFile.mjs';
import {safeFrontmatter} from '../core/frontmatterRules.mjs';
import {afterEdit, состояниеДляОкна} from '../core/articleState.mjs';
import {позже, свежееЧерновика} from '../core/drafts.mjs';
import {badFields} from './httpBody.mjs';
import {dropDraft, fingerprint, loadDraft, saveSnapshot} from './draftStore.mjs';
import {gitAuthor} from './gitFile.mjs';
import {loadState, saveState} from './library.mjs';

/**
 * Служебный шаг после того, как файл статьи уже записан. Его сбой пишется в консоль сервера,
 * но не отменяет соседние шаги и не выдаётся человеку за неудачу сохранения: текст на диске.
 */
function безСрыва(шаг, предупреждения, код) {
  try {
    шаг();
  } catch (error) {
    console.error(error);
    // Молчать нельзя: человеку скажут «сохранено», а версия или готовность на диск не легли.
    // Код — внутренний договор сервера и окна; человеческий текст живёт в настройках.
    предупреждения.push(код);
  }
}

/**
 * Собрать текст файла из новой шапки и нового тела. Переводы строк и невидимая метка берутся
 * у самого файла: у каждой языковой версии они свои, и запись чужими переписала бы весь файл
 * вместо изменённых строк (SPEC 3.5, 5.1).
 *
 * Тело передаётся явно и всегда: это текст из окна. Возьми функция тело сама у файла — правка
 * человека молча не доехала бы до диска.
 */
function собрать(current, frontmatterRaw, body) {
  const toEol = (text) => (current.eol === '\r\n'
    ? text.replace(/\r?\n/g, '\r\n')
    : text.replace(/\r\n/g, '\n'));

  return joinArticle({
    head: buildHead({frontmatterRaw: toEol(frontmatterRaw), eol: current.eol, метка: current.метка}),
    body: toEol(body),
  });
}

/**
 * Обрабатывает `/api/article/save`. Возвращает true, если запрос был к ней.
 *
 * `фиксировать` — сохранение внешней правки версией: файл могли изменить, пока человек правил,
 * и чужая работа обязана попасть в историю до записи.
 * `последняяПравка` — время последней принятой правки по каждой статье: по нему запоздавший
 * запрос не стирает черновик, написанный уже после его отправки.
 */
export async function saveRoute({
  req, res, url, repo, editorDir, settings, git, тело, insideRepo, send, фиксировать, последняяПравка,
}) {
  if (url.pathname !== '/api/article/save' || req.method !== 'POST') return false;

  const payload = await тело(req);
  // Поля проверяются до работы с путями: без этого не-строка роняет `path.join` внутренней
  // ошибкой вместо понятного «неверный запрос» (SPEC 6.4). Пустое тело — законно, поэтому
  // у него проверяется только тип: статья без текста бывает, статья без пути — нет.
  const тексты = settings['ошибкиСервера'];
  const плохое = badFields(payload, ['path'], тексты)
    ?? (typeof payload.body === 'string' ? null : {status: 400, error: тексты['плохойЗапрос']});
  if (плохое) {
    send(res, плохое.status, {error: плохое.error});
    return true;
  }

  const file = path.join(repo, payload.path);
  if (!insideRepo(file) || !fs.existsSync(file)) {
    send(res, 404, {error: тексты['нетСтатьи']});
    return true;
  }

  // До проверки отпечатка и до записи: если файл изменили снаружи, его содержимое обязано лечь
  // в историю. Иначе «Сохранить поверх» затрёт чужую правку насовсем — в git её нет.
  await фиксировать(payload.path, true);

  const raw = fs.readFileSync(file, 'utf8');
  const current = splitArticle(raw);

  // Файл изменился снаружи, пока человек правил: молча затирать чужую правку нельзя.
  // Отдаём 409 и текущее содержимое файла — решение принимает человек (SPEC 6.4).
  // Отпечаток обязателен: без него проверку можно было бы обойти, просто не прислав поле.
  // Единственный способ записать поверх — явное решение человека (`перезаписать`).
  const отпечатокСейчас = fingerprint(raw);
  if (payload.перезаписать !== true) {
    if (typeof payload.отпечатокБазы !== 'string' || payload.отпечатокБазы === '') {
      send(res, 400, {error: тексты['плохойЗапрос']});
      return true;
    }

    if (payload.отпечатокБазы !== отпечатокСейчас) {
      send(res, 409, {
        error: тексты['файлИзменёнСнаружи'],
        конфликт: true,
        файл: {frontmatterRaw: current.frontmatterRaw, body: current.body},
        отпечаток: отпечатокСейчас,
      });
      return true;
    }
  }

  // Защитные правила применяются здесь: через сохранение проходит любая правка шапки.
  const safe = payload.frontmatterRaw === undefined
    ? {frontmatterRaw: current.frontmatterRaw, fixed: []}
    : safeFrontmatter(payload.path, payload.frontmatterRaw, settings['контент']);

  /** Убрать черновик после настоящего сохранения — но только если он не новее самого сохранения. */
  const убратьЧерновик = () => {
    const черновик = loadDraft(editorDir, settings, payload.path);
    if (черновик === null || свежееЧерновика(payload.правкаОт, черновик)) {
      dropDraft(editorDir, settings, payload.path);
    }
    // Порог свежести остаётся в памяти и после удаления черновика: без него поздний запрос
    // автосохранения воскресил бы черновик поверх только что сохранённой работы.
    последняяПравка.set(payload.path, позже(payload.правкаОт ?? new Date().toISOString(), последняяПравка.get(payload.path)));
  };

  // Ничего не изменилось — файл не трогаем вовсе. Так «открыл и сохранил» не портит статью.
  // Черновик при этом всё равно убираем: продолжать нечего, текст и так совпадает с файлом.
  if (nothingChanged(current, {body: payload.body, frontmatterRaw: safe.frontmatterRaw})) {
    убратьЧерновик();
    // Отпечаток возвращаем и здесь: после «сохранить поверх» текст мог совпасть с внешней
    // правкой, и без свежего отпечатка следующая правка дала бы ложный конфликт.
    send(res, 200, {saved: true, untouched: true, отпечаток: отпечатокСейчас});
    return true;
  }

  const текст = собрать(current, safe.frontmatterRaw, payload.body);
  fs.writeFileSync(file, текст, 'utf8');

  // Файл записан. Дальше идёт служебное: версия в истории, уборка черновика, готовность.
  // Каждый шаг отдельно: сбой одного не отменяет остальные и не превращает удавшееся сохранение
  // в «ничего не сохранилось». Иначе, например, упавший снимок оставлял бы старый черновик,
  // и при следующем открытии человек получал бы ложный выбор.
  // Автор известен: файл пишем мы, и подпись берётся у того, кто работает за программой.
  const автор = (await gitAuthor(git)) ?? settings['реестр']['неизвестныйАвтор'];
  const сейчас = new Date().toISOString();
  const state = afterEdit(loadState(repo, payload.path, settings), settings);

  const предупреждения = [];
  безСрыва(() => saveSnapshot(editorDir, settings, payload.path, текст, автор, сейчас), предупреждения, 'история');
  безСрыва(убратьЧерновик, предупреждения, 'черновик');
  // Правка после подготовки возвращает версию в черновик.
  безСрыва(() => saveState(repo, payload.path, settings, state), предупреждения, 'состояние');

  // Окну отдаём готовность ОТКРЫТОЙ версии, и только если она действительно легла на диск
  // (правило — в ядре).
  const наДиске = состояниеДляОкна(state, предупреждения);

  send(res, 200, {
    saved: true,
    fixed: safe.fixed,
    state: наДиске,
    отпечаток: fingerprint(текст),
    предупреждения,
  });
  return true;
}
