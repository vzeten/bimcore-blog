// Граница с Google Analytics: ключ служебного доступа, пропуск Google и отчёт о просмотрах.
//
// **Секрет не выходит отсюда.** Ключ читается с диска владельца, подписывает короткий запрос и живёт
// только в памяти этого захода; пропуск Google — тоже. Наружу модуль отдаёт либо строки отчёта, либо
// СВОЙ код причины: ни текста ключа, ни пропуска, ни ответа Google, ни исключения с ними — в журнал,
// окно или файл запоминания не попадает ничего из этого (условие контролёра Codex, 2026-09-23).
//
// Адреса Google постоянные и заданы здесь, а не настройкой: чужой адрес в настройке увёл бы подписанный
// ключом запрос куда угодно. Перенаправления запрещены по той же причине, у каждого запроса есть срок.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const АДРЕС_ПРОПУСКА = 'https://oauth2.googleapis.com/token';
const АДРЕС_ОТЧЁТА = 'https://analyticsdata.googleapis.com/v1beta/properties';
const ОБЛАСТЬ = 'https://www.googleapis.com/auth/analytics.readonly';
/** Строк в одной странице отчёта. Предел Google — 250 000; меньшие страницы быстрее доходят. */
const СТРАНИЦА = 50000;

/**
 * Ключ из папки владельца: единственный обычный файл `*.json` служебного доступа. Отказ — `{причина}`
 * одним из кодов `нетПапки`, `ключВGit`, `нетКлюча`, `многоКлючей`, `неКлюч`.
 * Папка внутри рабочей копии Git — отказ читать: оттуда ключ одной командой уезжает на GitHub.
 */
export function найтиКлюч(папка) {
  let корень;
  try {
    if (!path.isAbsolute(String(папка ?? ''))) return {причина: 'нетПапки'};
    корень = fs.realpathSync.native(папка);
    if (!fs.statSync(корень).isDirectory()) return {причина: 'нетПапки'};
  } catch {
    return {причина: 'нетПапки'};
  }
  if (внутриGit(корень)) return {причина: 'ключВGit'};

  let файлы;
  try {
    файлы = fs.readdirSync(корень, {withFileTypes: true})
      .filter((запись) => запись.name.toLowerCase().endsWith('.json'));
  } catch {
    return {причина: 'нетПапки'};
  }
  if (файлы.length === 0) return {причина: 'нетКлюча'};
  if (файлы.length > 1) return {причина: 'многоКлючей'};
  // Связь или папка под именем ключа — не ключ: по связи программа ушла бы читать чужой файл.
  if (!файлы[0].isFile()) return {причина: 'неКлюч'};

  try {
    const файл = path.join(корень, файлы[0].name);
    if (внутриGit(path.dirname(fs.realpathSync.native(файл)))) return {причина: 'ключВGit'};
    const ключ = JSON.parse(fs.readFileSync(файл, 'utf8'));
    if (ключ?.type !== 'service_account' || typeof ключ.client_email !== 'string' || typeof ключ.private_key !== 'string') {
      return {причина: 'неКлюч'};
    }
    return {ключ: {почта: ключ.client_email, секрет: ключ.private_key}};
  } catch {
    return {причина: 'неКлюч'};
  }
}

/** Есть ли `.git` в самой папке или у любого её предка. */
export function внутриGit(папка) {
  let текущая = папка;
  for (;;) {
    if (fs.existsSync(path.join(текущая, '.git'))) return true;
    const выше = path.dirname(текущая);
    if (выше === текущая) return false;
    текущая = выше;
  }
}

/** Запрос с запретом перенаправлений и сроком. Сбой сети и срок — `null`, без исключения наружу. */
async function запрос(адрес, опции, срокМс) {
  try {
    return await fetch(адрес, {...опции, redirect: 'error', signal: AbortSignal.timeout(срокМс)});
  } catch {
    return null;
  }
}

/**
 * Пропуск Google на час: подписанное ключом заявление по стандарту служебного доступа. Сам ключ по
 * сети не идёт — идёт подпись. Отказ — `{причина}`: `неКлюч` (подпись не сложилась), `ключОтклонён`,
 * `нетСвязи`.
 */
export async function получитьПропуск(ключ, срокМс, сейчас = Date.now()) {
  const b64 = (значение) => Buffer.from(JSON.stringify(значение)).toString('base64url');
  const сек = Math.floor(сейчас / 1000);
  const тело = `${b64({alg: 'RS256', typ: 'JWT'})}.${b64({iss: ключ.почта, scope: ОБЛАСТЬ, aud: АДРЕС_ПРОПУСКА, iat: сек, exp: сек + 3600})}`;

  let подпись;
  try {
    подпись = crypto.sign('RSA-SHA256', Buffer.from(тело), ключ.секрет).toString('base64url');
  } catch {
    return {причина: 'неКлюч'};
  }

  const ответ = await запрос(АДРЕС_ПРОПУСКА, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${тело}.${подпись}`}),
  }, срокМс);
  if (ответ === null) return {причина: 'нетСвязи'};
  if (!ответ.ok) return {причина: ответ.status >= 500 ? 'сбойGoogle' : 'ключОтклонён'};

  try {
    const {access_token: пропуск} = await ответ.json();
    return typeof пропуск === 'string' && пропуск !== '' ? {пропуск} : {причина: 'сбойGoogle'};
  } catch {
    return {причина: 'сбойGoogle'};
  }
}

/** День `YYYYMMDD` в виде, который понимает отчёт: `YYYY-MM-DD`. */
const дата = (день) => `${день.slice(0, 4)}-${день.slice(4, 6)}-${день.slice(6, 8)}`;

/**
 * Просмотры страниц потока по дням: `{строки: [[адрес, день, просмотры]]}` или `{причина}` —
 * `нетДоступа` (у ключа нет права на ресурс), `предел` (Google просит подождать), `нетСвязи`,
 * `сбойGoogle`. Страницы отчёта читаются по очереди, пока Google не отдаст все строки.
 */
export async function отчётПросмотров({пропуск, ресурс, поток, с, по, срокМс}) {
  if (!/^\d+$/.test(String(ресурс)) || !/^\d+$/.test(String(поток))) return {причина: 'нетДоступа'};

  const строки = [];
  for (let сдвиг = 0; ; сдвиг += СТРАНИЦА) {
    const ответ = await запрос(`${АДРЕС_ОТЧЁТА}/${ресурс}:runReport`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${пропуск}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        dateRanges: [{startDate: дата(с), endDate: дата(по)}],
        dimensions: [{name: 'pagePath'}, {name: 'date'}],
        metrics: [{name: 'screenPageViews'}],
        // Ресурс общий на два сайта: без этого фильтра в числа статей вошли бы страницы магазина.
        dimensionFilter: {filter: {fieldName: 'streamId', stringFilter: {matchType: 'EXACT', value: String(поток)}}},
        limit: СТРАНИЦА,
        offset: сдвиг,
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

    for (const строка of тело.rows ?? []) {
      const [адрес, день] = (строка.dimensionValues ?? []).map((значение) => String(значение?.value ?? ''));
      const просмотры = Number(строка.metricValues?.[0]?.value);
      if (/^\d{8}$/.test(день) && Number.isFinite(просмотры)) строки.push([адрес, день, просмотры]);
    }

    const всего = Number(тело.rowCount ?? 0);
    if ((тело.rows ?? []).length === 0 || сдвиг + СТРАНИЦА >= всего) return {строки};
  }
}
