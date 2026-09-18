// Ручка `/api/publish/state`: что сейчас на САЙТЕ у каждой языковой версии статьи. Окно публикации
// показывает это при открытии, до всякой проверки (решение владельца 2026-09-18, п.2): рядом с языком
// стоит его нынешнее состояние на сайте, по опубликованной основе, а не по файлу на диске.
//
// Только чтение: ни файлов, ни git ручка не меняет.

import fs from 'node:fs';
import path from 'node:path';

import {splitArticle} from '../core/articleFile.mjs';
import {isUnlisted} from '../core/frontmatterRules.mjs';
import {черновикСайта} from '../core/localeSigns.mjs';
import {ДОСТУПНО, НЕДОСТУПНО, ПО_ССЫЛКЕ} from '../core/siteAccess.mjs';
import {адресВерсии} from '../core/siteRoutes.mjs';
import {годныйПуть} from './releaseFacts.mjs';
import {закреплённаяОснова} from './publishBase.mjs';
import {естьВОснове} from './publishFacts.mjs';
import {путиВерсийНаСайте} from './retireFacts.mjs';
import {сведенияСайта, ссылкиВОснове} from './linkFacts.mjs';
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
 * если сделает её недоступной (правило ВК, п.7). У версии, которой на сайте нет, — ноль.
 */
export async function состояниеНаСайте({repo, settings, git, rel}) {
  const черновики = черновыеПравки(repo, settings);
  const версии = путиВерсийНаСайте(rel, settings);
  const своя = (путь) => ({файлЕсть: fs.existsSync(path.join(repo, путь)), черновикЖдёт: черновики.has(путь)});
  if (версии.length === 0) {
    return {path: rel, основаИзвестна: true, локали: [{локаль: null, путь: rel, ...своя(rel), наСайте: false, доступность: null, ссылок: 0}]};
  }

  const основа = await закреплённаяОснова({git, settings});
  const лежит = основа.ошибка ? null : await естьВОснове(git, основа.основа, версии.map((версия) => версия.путь));
  const сайт = сведенияСайта(repo, settings);
  const свои = new Set(версии.map((версия) => версия.путь));
  const локали = [];
  for (const версия of версии) {
    const наСайте = лежит === null ? null : лежит.файлы.has(версия.путь);
    const текст = наСайте ? await showFile(git, основа.основа, версия.путь) : null;
    const доступность = текст === null ? null : доступностьШапки(splitArticle(текст).frontmatterRaw);
    let ссылок = 0;
    if (доступность !== null && доступность !== НЕДОСТУПНО) {
      const адрес = адресВерсии(версия.путь, текст, сайт);
      const цели = {адреса: new Set(адрес === '' ? [] : [адрес]), файлы: new Set([версия.путь])};
      ссылок = (await ссылкиВОснове({git, repo, settings, основа: основа.основа, цели, свои}))?.статей ?? 0;
    }
    локали.push({...версия, ...своя(версия.путь), наСайте, доступность, ссылок});
  }
  return {path: rel, основаИзвестна: лежит !== null, локали};
}

/** Доступность по шапке с сайта: `draft` сильнее `unlisted`, как их читает и сам сайт. */
function доступностьШапки(шапка) {
  if (черновикСайта(шапка)) return НЕДОСТУПНО;
  return isUnlisted(шапка) ? ПО_ССЫЛКЕ : ДОСТУПНО;
}
