// Поиск Google (Search Console, ED-054): дневные показы, переходы, CTR и позиция по страницам сайта.
// Тот же служебный доступ и ключ, что у просмотров GA4 (`ga4Client.mjs`), право — только чтение поиска.
//
// Адрес API постоянный и задан здесь; ресурс сайта — настройкой. Перенаправления запрещены, у запросов
// срок. Наружу — строки или свой код причины; ключ, пропуск и ответ Google не выходят отсюда.

import {запрос} from './ga4Client.mjs';

const АДРЕС = 'https://searchconsole.googleapis.com/webmasters/v3/sites';
/** Строк в одной странице ответа — предел Search Console. */
const СТРАНИЦА = 25000;

/** `YYYY-MM-DD` без проверки календаря: даты считает зовущий. */
const годныйДень = (день) => /^\d{4}-\d{2}-\d{2}$/.test(String(день));

/**
 * Строки поиска за дни `с`…`по`: `{строки: [[день, страница, показы, переходы, ctr, позиция]], неполныйС}`
 * или `{причина}` — `нетДоступа`, `предел`, `нетСвязи`, `сбойGoogle`. `неполныйС` — первый день, который
 * Google ещё досчитывает (`first_incomplete_date` при `dataState: all`), или `null`. Все страницы ответа
 * собираются до конца; оборвалось на любой — причина, а не половина дней.
 */
export async function строкиПоиска({пропуск, ресурс, с, по, срокМс}) {
  if (!годныйДень(с) || !годныйДень(по) || !/^(https:\/\/|sc-domain:)/.test(String(ресурс))) return {причина: 'нетДоступа'};

  const строки = [];
  let неполныйС = null;
  for (let сдвиг = 0; ; сдвиг += СТРАНИЦА) {
    const ответ = await запрос(`${АДРЕС}/${encodeURIComponent(ресурс)}/searchAnalytics/query`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${пропуск}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        startDate: с, endDate: по, dimensions: ['date', 'page'], type: 'web', dataState: 'all',
        rowLimit: СТРАНИЦА, startRow: сдвиг,
      }),
    }, срокМс);

    if (ответ === null) return {причина: 'нетСвязи'};
    if (ответ.status === 401 || ответ.status === 403 || ответ.status === 404) return {причина: 'нетДоступа'};
    if (ответ.status === 429) return {причина: 'предел'};
    if (!ответ.ok) return {причина: 'сбойGoogle'};

    let тело;
    try {
      тело = await ответ.json();
    } catch {
      return {причина: 'сбойGoogle'};
    }

    const порция = тело.rows ?? [];
    for (const строка of порция) {
      const [день, страница] = строка.keys ?? [];
      if (!годныйДень(день) || typeof страница !== 'string') continue;
      строки.push([день, страница, Number(строка.impressions) || 0, Number(строка.clicks) || 0,
        Number(строка.ctr) || 0, Number(строка.position) || 0]);
    }
    const первыйНеполный = тело.metadata?.first_incomplete_date;
    if (годныйДень(первыйНеполный)) неполныйС = неполныйС && неполныйС < первыйНеполный ? неполныйС : первыйНеполный;

    if (порция.length < СТРАНИЦА) return {строки, неполныйС};
  }
}
