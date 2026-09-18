// Ручка `/api/publish/versions`: дата записи блога и выбранная доступность у отмеченных НЕоткрытых
// языков (этап 3, решение владельца 2026-09-18, п.2). Открытый язык пишет окно своим сохранением;
// у остальных окна нет, и их файлы пишет сервер — до проверок, потому что проверяется то, что уедет.
//
// **Чужую работу запись не трогает.** Есть у языка подтверждённый черновик, отличный от файла, или
// нерешённый спор — отказ с понятной причиной: человек открывает этот язык и сохраняет. Сведение за
// него программа не делает. Файл пишется только через сверку (`mergeGate.записатьСверив`): изменился
// он между чтением и записью — отказ, а прежний и новый текст ложатся снимками в историю. Записываются
// все языки или никто: не лёг один — уже записанные возвращаются к прежнему тексту, а невернувшиеся
// называются человеку. Записанная шапка возвращает готовность языка в черновик, как сохранение окна.

import fs from 'node:fs';
import path from 'node:path';

import {readField, splitArticle} from '../core/articleFile.mjs';
import {articlePlace} from '../core/frontmatterRules.mjs';
import {РЕЖИМЫ, шапкаДоступности} from '../core/siteAccess.mjs';
import {РОД_БЛОГА, датаРасходится} from '../core/publishDate.mjs';
import {дописатьПоля, заменитьШапку} from '../core/refineHead.mjs';
import {закреплённаяОснова} from './publishBase.mjs';
import {датаПоОснове, сегодняшнийДень} from './publishDateFacts.mjs';
import {отмеченныеВерсии} from './publishVersions.mjs';
import {годныйПуть} from './releaseFacts.mjs';
import {loadState, saveState, черновыеПравки} from './library.mjs';
import {afterEdit} from '../core/articleState.mjs';
import {прочитатьСпор} from './conflictStore.mjs';
import {записатьСверив} from './mergeGate.mjs';
import {fingerprint, latestSnapshot, saveSnapshot, snapshotText} from './draftStore.mjs';
import {gitAuthor} from './gitFile.mjs';
import {badFields} from './httpBody.mjs';

/** Обрабатывает `/api/publish/versions`. Возвращает true, если запрос был к ней. */
export async function publishVersionsRoute({req, res, url, repo, settings, git, тело, insideRepo, send}) {
  if (url.pathname !== '/api/publish/versions' || req.method !== 'POST') return false;

  const payload = await тело(req);
  const плохоеТело = badFields(payload, ['path'], settings['ошибкиСервера']);
  const rel = payload?.path;
  const отмечены = плохоеТело || !годныйПуть(rel, settings) ? null : отмеченныеВерсии({payload, rel, repo, settings, insideRepo});
  const режим = payload?.['доступность'] ?? null;
  if (отмечены === null || отмечены.ошибка || (режим !== null && !РЕЖИМЫ.includes(режим))) {
    send(res, плохоеТело?.status ?? 400, {error: плохоеТело?.error ?? отмечены?.ошибка ?? settings['ошибкиСервера']['неПутьСтатьи']});
    return true;
  }
  const другие = отмечены.версии.filter((путь) => путь !== rel);

  // Сперва — чья-то незаписанная работа, у ВСЕХ языков разом и до первой записи: иначе один язык
  // получил бы новую шапку, а на втором публикация всё равно остановилась бы.
  const черновики = черновыеПравки(repo, settings);
  const ждёт = другие.find((путь) => черновики.has(путь) || прочитатьСпор(repo, settings, путь) !== null);
  if (ждёт !== undefined) {
    const локаль = articlePlace(ждёт, settings['контент']).locale;
    const язык = settings['локали'][локаль] ?? локаль;
    send(res, 409, {error: settings['отказыКоммита']['правкаЯзыкаЖдёт'].replace('{ЯЗЫК}', язык), код: 'правкаЯзыкаЖдёт', путь: ждёт});
    return true;
  }

  const блог = другие.some((путь) => articlePlace(путь, settings['контент']).kind === РОД_БЛОГА);
  const основа = блог ? await закреплённаяОснова({git, settings}) : null;
  if (основа?.ошибка) {
    send(res, 409, {error: settings['отказыОтправки'][основа.ошибка] ?? основа.ошибка, код: основа.ошибка});
    return true;
  }

  // Новые тексты считаются для всех прежде записи: не посчиталась дата одного — не пишется никто.
  const новые = [];
  for (const путь of другие) {
    const было = fs.readFileSync(path.join(repo, путь), 'utf8');
    const стало = await новыйТекст({git, repo, settings, путь, было, режим, основа: основа?.основа});
    if (стало === null) {
      send(res, 409, {error: settings['отказыКоммита']['составНеДоказан'], код: 'фактыНеизвестны'});
      return true;
    }
    if (стало !== было) новые.push({путь, было, стало});
  }

  const автор = (await gitAuthor(git)) ?? settings['реестр']['неизвестныйАвтор'];
  const записаны = [];
  for (const новый of новые) {
    const {путь, было, стало} = новый;
    if (!записатьСверив({file: path.join(repo, путь), ожидаемыйОтпечаток: fingerprint(было), текст: стало})) {
      // Все или никто (замечание контролёра): уже переписанные языки возвращаются к прежнему тексту
      // тем же заслоном сверки. Не вернулся — он назван в `изменены`, и человек увидит его в причине.
      const изменены = откатить({repo, settings, записаны, автор});
      send(res, 409, {error: settings['отказыКоммита']['статьяИзменилась'], код: 'статьяИзменилась', путь, изменены});
      return true;
    }
    записаны.push(новый);
    вИсторию({repo, settings, путь, было, стало, автор});
  }

  // Правка шапки возвращает версию в черновик — так же, как сохранение окна (`saveRoute.mjs`).
  // Служебное: файлы уже записаны, и сбой готовности публикацию не отменяет.
  for (const {путь} of записаны) {
    try {
      const прежнее = loadState(repo, путь, settings);
      const новое = afterEdit(прежнее, settings);
      if (новое !== прежнее) saveState(repo, путь, settings, новое);
    } catch (ошибка) {
      console.error(ошибка);
    }
  }

  send(res, 200, {path: rel, изменены: записаны.map((новый) => новый.путь)});
  return true;
}

/** Вернуть уже записанные языки к прежнему тексту. Возвращает пути, которые вернуть не вышло. */
function откатить({repo, settings, записаны, автор}) {
  const невернулись = [];
  for (const {путь, было, стало} of [...записаны].reverse()) {
    if (записатьСверив({file: path.join(repo, путь), ожидаемыйОтпечаток: fingerprint(стало), текст: было})) {
      вИсторию({repo, settings, путь, было: стало, стало: было, автор});
    } else {
      невернулись.push(путь);
    }
  }
  return невернулись;
}

/**
 * Текст версии с выбранной доступностью (`null` в запросе — доступность не трогается) и датой
 * записи блога по закреплённой основе. Дату спросить не удалось — `null`.
 */
async function новыйТекст({git, repo, settings, путь, было, режим, основа}) {
  const род = articlePlace(путь, settings['контент']).kind;
  const порядок = settings['поляСоздания'][род]?.['порядок'] ?? [];
  let шапка = splitArticle(было).frontmatterRaw;
  if (режим !== null) шапка = шапкаДоступности(шапка, режим, порядок);

  if (род === РОД_БЛОГА) {
    const дата = await датаПоОснове({git, repo, rel: путь, settings, основа, сегодня: сегодняшнийДень()});
    if (дата.ошибка) return null;
    if (дата.нужна !== null && датаРасходится({нужна: дата.нужна, вФайле: readField(шапка, 'date')})) {
      шапка = дописатьПоля(шапка, [{ключ: 'date', строка: `date: ${дата.нужна}`}], порядок);
    }
  }

  return шапка === splitArticle(было).frontmatterRaw ? было : заменитьШапку(было, шапка);
}

/** Прежний текст (если его в истории ещё нет) и новый — снимками. Служебное: файл уже записан. */
function вИсторию({repo, settings, путь, было, стало, автор}) {
  try {
    const сейчас = new Date();
    const последний = latestSnapshot(repo, settings, путь);
    if (последний === null || snapshotText(repo, settings, путь, последний['имя']) !== было) {
      saveSnapshot(repo, settings, путь, было, settings['реестр']['неизвестныйАвтор'], new Date(сейчас.getTime() - 1).toISOString());
    }
    saveSnapshot(repo, settings, путь, стало, автор, сейчас.toISOString());
  } catch (ошибка) {
    console.error(ошибка);
  }
}
