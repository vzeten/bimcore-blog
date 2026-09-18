// Ручка `/api/publish/state`: что сейчас на САЙТЕ у каждой языковой версии статьи. Окно публикации
// показывает это при открытии, до всякой проверки (решение владельца 2026-09-18, п.2): рядом с языком
// стоит его нынешнее состояние на сайте, по опубликованной основе, а не по файлу на диске.
//
// Только чтение: ни файлов, ни git ручка не меняет.

import fs from 'node:fs';
import path from 'node:path';

import {splitArticle} from '../core/articleFile.mjs';
import {доступностьШапки} from '../core/siteAccess.mjs';
import {годныйПуть} from './releaseFacts.mjs';
import {закреплённаяОснова} from './publishBase.mjs';
import {естьВОснове} from './publishFacts.mjs';
import {путиВерсийНаСайте} from './retireFacts.mjs';
import {ссылкиВОснове} from './linkFacts.mjs';
import {целиНедоступной} from './draftLinks.mjs';
import {черновыеПравки} from './library.mjs';
import {showFile} from './gitFile.mjs';
import {badFields, badPath} from './httpBody.mjs';

/** Обрабатывает `/api/publish/state`. Возвращает true, если запрос был к ней. */
export async function publishStateRoute({req, res, url, repo, settings, git, тело, insideRepo, send}) {
  if (url.pathname !== '/api/publish/state' || req.method !== 'POST') return false;

  const payload = await тело(req);
  const плохоеТело = badFields(payload, ['path'], settings['ошибкиСервера']);
  if (плохоеТело) {
    send(res, плохоеТело.status, {error: плохоеТело.error});
    return true;
  }
  const rel = payload.path;
  const bad = badPath([rel], (p) => insideRepo(path.join(repo, p)), (p) => fs.existsSync(path.join(repo, p)), settings['ошибкиСервера']);
  if (bad || !годныйПуть(rel, settings)) {
    send(res, bad?.status ?? 400, {error: bad?.error ?? settings['ошибкиСервера']['неПутьСтатьи']});
    return true;
  }

  send(res, 200, await состояниеНаСайте({repo, settings, git, rel}));
  return true;
}

/**
 * Состояние версий. `основаИзвестна: false` — сайт спросить не удалось, и `наСайте` у каждой версии
 * `null`: «не знаю» не подделывается под «нет на сайте». Статья вне сайта — одна строка своей версии.
 *
 * `ссылок` — в скольких статьях сайта есть ссылка на эту версию: столько правок получит публикация,
 * если сделает её недоступной (правило ВК, п.7). Цели считаются ТЕМ ЖЕ правилом, что у самой
 * публикации (`draftLinks.целиНедоступной`, замечание контролёра этапа 2): язык без своего файла, под
 * адресом которого сайт показывает обязательный, тоже теряет страницу. Языки, которых на сайте нет,
 * получат заглушку — как в плане. `статьи` — ключи этих статей: по ним окно считает статьи сразу по
 * всем отмеченным языкам (этап 3).
 */
export async function состояниеНаСайте({repo, settings, git, rel}) {
  const черновики = черновыеПравки(repo, settings);
  const версии = путиВерсийНаСайте(rel, settings);
  const своя = (путь) => ({файлЕсть: fs.existsSync(path.join(repo, путь)), черновикЖдёт: черновики.has(путь)});
  if (версии.length === 0) {
    return {path: rel, основаИзвестна: true, локали: [{локаль: null, путь: rel, ...своя(rel), наСайте: false, доступность: null, ссылок: 0, статьи: []}]};
  }

  const основа = await закреплённаяОснова({git, settings});
  const лежит = основа.ошибка ? null : await естьВОснове(git, основа.основа, версии.map((версия) => версия.путь));
  const свои = new Set(версии.map((версия) => версия.путь));
  const локали = [];
  for (const версия of версии) {
    const наСайте = лежит === null ? null : лежит.файлы.has(версия.путь);
    const текст = наСайте ? await showFile(git, основа.основа, версия.путь) : null;
    const доступность = текст === null ? null : доступностьШапки(splitArticle(текст).frontmatterRaw);
    const статьи = лежит === null ? [] : await статьиСоСсылками({git, repo, settings, основа: основа.основа, версия, версии, лежит, свои});
    локали.push({...версия, ...своя(версия.путь), наСайте, доступность, ссылок: статьи.length, статьи});
  }
  return {path: rel, основаИзвестна: лежит !== null, локали};
}

/** Ключи статей, где уберутся ссылки, если версия станет недоступной. Не узнали — пусто. */
async function статьиСоСсылками({git, repo, settings, основа, версия, версии, лежит, свои}) {
  let текст;
  try {
    текст = fs.readFileSync(path.join(repo, версия.путь), 'utf8');
  } catch {
    return [];
  }
  // Как в плане одной версии: язык, которого на сайте нет, получит заглушку и адреса не потеряет.
  const заглушки = версии.filter((другая) => другая.путь !== версия.путь && !лежит.файлы.has(другая.путь))
    .map((другая) => ({путь: другая.путь}));
  const цели = await целиНедоступной({git, settings, repo, rel: версия.путь, текст, основа, записи: заглушки});
  if (цели === null || цели.адреса.size === 0) return [];
  return (await ссылкиВОснове({git, repo, settings, основа, цели, свои}))?.ключи ?? [];
}
