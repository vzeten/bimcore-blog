// Окно аналитики (ED-054, операция 2): ручки только чтения над базой операции 1.
// GET `/api/analytics/search` — ряд поиска по охвату и шагу; `/api/analytics/pages` — страницы 30/30;
// `/api/analytics/actions` — события и ручные события; `/api/analytics/delta` — текст разницы одного события.
//
// Приватно, как и основа: без ключа владельца функции нет, ответ пустой и без надписей. Здесь ничего не
// пишется и Google не спрашивается — обновление базы живёт в `analyticsRoute.mjs`.

import {найтиКлюч} from './ga4Client.mjs';
import {открыть, строкиПоискаЗа, первыйДеньПоиска, событияДляОкна, ручныеДляОкна, дельтаСобытия, сводка} from './analyticsStore.mjs';
import {ряд, страницы, последнийПолный, сдвиг} from '../core/searchSeries.mjs';

const ДЕНЬ = /^\d{4}-\d{2}-\d{2}$/;
const ШАГИ = ['день', 'неделя', 'месяц'];

/** Охват из строки запроса: `сайт`, код языка сайта или `стр:/путь`. Чужое — `сайт`. */
export function охватИзЗапроса(значение, языки) {
  const текст = String(значение ?? 'сайт');
  if (текст.startsWith('стр:') && текст.length > 4) return {страница: текст.slice(4)};
  return языки.includes(текст) ? текст : 'сайт';
}

/** Обрабатывает ручки чтения окна аналитики. true, если запрос её. */
export async function analyticsReadRoute({req, res, url, repo, settings, send}) {
  const ручки = ['/api/analytics/search', '/api/analytics/pages', '/api/analytics/actions', '/api/analytics/delta'];
  if (req.method !== 'GET' || !ручки.includes(url.pathname)) return false;

  const база = найтиКлюч(settings['просмотры']['папкаКлюча']).ключ ? await открыть(repo) : null;
  if (!база) {
    send(res, 200, {есть: false});
    return true;
  }

  try {
    const языки = Object.keys(settings['локали']);
    const сайт = {языки, обязательный: settings['обязательныйЯзык']};
    const охват = охватИзЗапроса(url.searchParams.get('охват'), языки);

    if (url.pathname === '/api/analytics/actions') {
      send(res, 200, {есть: true, события: событияДляОкна(база), ручные: ручныеДляОкна(база)});
      return true;
    }
    if (url.pathname === '/api/analytics/delta') {
      send(res, 200, {есть: true, дельта: дельтаСобытия(база, url.searchParams.get('коммит') ?? '', url.searchParams.get('путь') ?? '')});
      return true;
    }

    const первый = первыйДеньПоиска(база);
    if (первый === null) {
      send(res, 200, {есть: true, ряд: [], страницы: [], по: null, полныйПо: null});
      return true;
    }
    const последний = сводка(база).последнийДеньПоиска;

    if (url.pathname === '/api/analytics/pages') {
      const строки = строкиПоискаЗа(база, сдвиг(последний, -70), последний);
      send(res, 200, {есть: true, ...страницы(строки, {охват, сайт})});
      return true;
    }

    // Ряд: по умолчанию — год по неделям; месяцы — всё, что есть; дни — заданный отрезок или 90 дней.
    const шаг = ШАГИ.includes(url.searchParams.get('шаг')) ? url.searchParams.get('шаг') : 'неделя';
    const поЗапросу = url.searchParams.get('по');
    const по = ДЕНЬ.test(поЗапросу ?? '') && поЗапросу < последний ? поЗапросу : последний;
    const сЗапроса = url.searchParams.get('с');
    const поУмолчанию = шаг === 'месяц' ? первый : сдвиг(по, шаг === 'неделя' ? -364 : -89);
    const с = ДЕНЬ.test(сЗапроса ?? '') && сЗапроса <= по ? сЗапроса : поУмолчанию;
    const строки = строкиПоискаЗа(база, с < первый ? первый : с, по);
    send(res, 200, {
      есть: true, шаг, с, по, первый,
      полныйПо: последнийПолный(строки),
      ряд: ряд(строки, {охват, шаг, с, по, сайт}),
    });
    return true;
  } finally {
    база.close();
  }
}
