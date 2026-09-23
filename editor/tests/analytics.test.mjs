// Хранилище аналитики, Поиск Google и ручки (ED-054): замена дня целиком, откат, два экземпляра,
// приватность без ключа и то, что секрет не уходит ни в ответ, ни в базу, ни в журнал.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {открыть, заменитьДни, занять, отдать, добавитьРучное, вТранзакции, папкаАналитики} from '../src/adapters/analyticsStore.mjs';
import {строкиПоиска} from '../src/adapters/searchConsole.mjs';
import {analyticsRoute} from '../src/adapters/analyticsRoute.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
const СЕКРЕТ = privateKey.export({type: 'pkcs8', format: 'pem'});
const ПРОПУСК = 'пропуск-поиска-не-для-глаз';

let repo;
let папка;
let журнал;

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'аналитика-'));
  папка = fs.mkdtempSync(path.join(os.tmpdir(), 'ключ-'));
  fs.writeFileSync(path.join(папка, 'key.json'), JSON.stringify({type: 'service_account', client_email: 'e@x', private_key: СЕКРЕТ}));
  журнал = [];
  for (const способ of ['log', 'error', 'warn']) vi.spyOn(console, способ).mockImplementation((...части) => журнал.push(части.join(' ')));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const строка = (день, страница, показы) => [день, страница, показы, 1, 0.1, 5];

describe('хранилище', () => {
  it('день заменяется целиком: пропавшая страница уходит, повтор не удваивает', async () => {
    const база = await открыть(repo);
    заменитьДни(база, {с: '2026-09-01', по: '2026-09-02', строки: [строка('2026-09-01', '/a', 5), строка('2026-09-01', '/b', 3)], неполныйС: null});
    заменитьДни(база, {с: '2026-09-01', по: '2026-09-02', строки: [строка('2026-09-01', '/a', 7)], неполныйС: '2026-09-02'});
    expect(база.prepare('SELECT страница, показы FROM поиск').all()).toEqual([{страница: '/a', показы: 7}]);
    база.close();
  });

  it('обрыв посреди записи — откат, прежние дни целы', async () => {
    const база = await открыть(repo);
    заменитьДни(база, {с: '2026-09-01', по: '2026-09-01', строки: [строка('2026-09-01', '/a', 5)], неполныйС: null});
    expect(() => заменитьДни(база, {с: '2026-09-01', по: '2026-09-01', строки: [строка('2026-09-01', '/a', 1), строка('2026-09-01', '/a', 2)], неполныйС: null})).toThrow();
    expect(база.prepare('SELECT показы FROM поиск').all()).toEqual([{показы: 5}]);
    база.close();
  });

  it('неполные дни помечены', async () => {
    const база = await открыть(repo);
    заменитьДни(база, {с: '2026-09-20', по: '2026-09-22', строки: [строка('2026-09-20', '/a', 1), строка('2026-09-22', '/a', 1)], неполныйС: '2026-09-21'});
    expect(база.prepare('SELECT день, неполный FROM поиск ORDER BY день').all()).toEqual([{день: '2026-09-20', неполный: 0}, {день: '2026-09-22', неполный: 1}]);
    база.close();
  });

  it('два экземпляра: право обновлять у одного, свою отметку отдаёт только владелец; записи обоих ложатся', async () => {
    const первая = await открыть(repo);
    const вторая = await открыть(repo);
    const метка = занять(первая, 60_000, 1000);
    expect(метка).toBeTruthy();
    expect(занять(вторая, 60_000, 2000)).toBeNull();
    отдать(вторая, 'чужая');
    expect(занять(вторая, 60_000, 3000)).toBeNull();
    отдать(первая, метка);
    expect(занять(вторая, 60_000, 4000)).toBeTruthy();
    добавитьРучное(первая, {дата: '2026-09-24', текст: 'сменили заголовки'});
    добавитьРучное(вторая, {дата: '2026-09-24', текст: 'добавили FAQ', адрес: '/lessons/a'});
    expect(первая.prepare('SELECT count(*) AS n FROM ручные').get().n).toBe(2);
    первая.close();
    вторая.close();
  });

  it('папку базы нельзя создать — функции нет, без ошибки; своя папка прячется от Git', async () => {
    const занятый = fs.mkdtempSync(path.join(os.tmpdir(), 'аналитика-'));
    fs.mkdirSync(path.join(занятый, 'editor'));
    fs.writeFileSync(path.join(занятый, 'editor', '.analytics'), 'не папка');
    expect(await открыть(занятый)).toBeNull();
    const база = await открыть(repo);
    expect(fs.readFileSync(path.join(папкаАналитики(repo), '.gitignore'), 'utf8')).toBe('*\n');
    expect(() => вТранзакции(база, () => {
      throw new Error('стоп');
    })).toThrow('стоп');
    база.close();
  });
});

describe('Поиск Google', () => {
  const ответ = (строки, метаданные) => new Response(JSON.stringify({rows: строки, metadata: метаданные}), {status: 200});
  const r = (день, стр, показы) => ({keys: [день, стр], impressions: показы, clicks: 1, ctr: 0.2, position: 3});

  it('страницы читаются до конца; неполный день; постоянный адрес без перенаправлений', async () => {
    const порции = [ответ(Array.from({length: 25000}, () => r('2026-09-01', '/a', 1))), ответ([r('2026-09-02', '/b', 4)], {first_incomplete_date: '2026-09-02'})];
    const fetch = vi.fn(async () => порции.shift());
    vi.stubGlobal('fetch', fetch);
    const итог = await строкиПоиска({пропуск: ПРОПУСК, ресурс: 'https://learn.bimcore.one/', с: '2026-09-01', по: '2026-09-02', срокМс: 1000});
    expect(итог.строки).toHaveLength(25001);
    expect(итог.неполныйС).toBe('2026-09-02');
    const [адрес, опции] = fetch.mock.calls[0];
    expect(адрес).toBe('https://searchconsole.googleapis.com/webmasters/v3/sites/https%3A%2F%2Flearn.bimcore.one%2F/searchAnalytics/query');
    expect(опции.redirect).toBe('error');
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({startRow: 25000, dimensions: ['date', 'page'], dataState: 'all'});
  });

  it('обрыв на любой странице — причина, а не половина дней', async () => {
    const порции = [ответ(Array.from({length: 25000}, () => r('2026-09-01', '/a', 1)))];
    vi.stubGlobal('fetch', vi.fn(async () => порции.shift() ?? null));
    expect(await строкиПоиска({пропуск: ПРОПУСК, ресурс: 'https://learn.bimcore.one/', с: '2026-09-01', по: '2026-09-02', срокМс: 1000}))
      .toEqual({причина: 'нетСвязи'});
    for (const [статус, причина] of [[403, 'нетДоступа'], [429, 'предел'], [500, 'сбойGoogle']]) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {status: статус})));
      expect(await строкиПоиска({пропуск: ПРОПУСК, ресурс: 'https://learn.bimcore.one/', с: '2026-09-01', по: '2026-09-02', срокМс: 1000})).toEqual({причина});
    }
    expect(await строкиПоиска({пропуск: ПРОПУСК, ресурс: 'http://чужой', с: '2026-09-01', по: '2026-09-02', срокМс: 1})).toEqual({причина: 'нетДоступа'});
  });
});

describe('ручки аналитики', () => {
  function настройки(своя = папка) {
    const settings = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
    settings['просмотры']['папкаКлюча'] = своя;
    return settings;
  }
  const git = {raw: async () => {
    throw new Error('нет git');
  }, show: async () => {
    throw new Error('нет git');
  }};
  async function спросить(метод, адрес, данные, settings = настройки()) {
    let ответ;
    const взята = await analyticsRoute({
      req: {method: метод}, res: {}, url: new URL(`http://x${адрес}`), repo, settings, git,
      тело: async () => данные, send: (_res, код, тело) => {
        ответ = {код, тело, текст: JSON.stringify(тело)};
      },
    });
    expect(взята).toBe(true);
    return ответ;
  }
  const google = () => vi.fn(async (адрес) => (String(адрес).includes('oauth2')
    ? new Response(JSON.stringify({access_token: ПРОПУСК}), {status: 200})
    : new Response(JSON.stringify({rows: [{keys: ['2026-09-20', 'https://learn.bimcore.one/lessons/a/'], impressions: 9, clicks: 2, ctr: 0.2, position: 4}]}), {status: 200})));

  it('без ключа функции нет: ни базы, ни надписей', async () => {
    const пустая = fs.mkdtempSync(path.join(os.tmpdir(), 'нет-ключа-'));
    expect((await спросить('GET', '/api/analytics', null, настройки(пустая))).тело).toEqual({есть: false});
    expect((await спросить('POST', '/api/analytics/manual', {дата: '2026-09-24', текст: 'x'}, настройки(пустая))).код).toBe(404);
    expect(fs.existsSync(папкаАналитики(repo))).toBe(false);
  });

  it('поиск загружается в базу; ручное событие; описание к несуществующему — отказ; секрета нигде нет', async () => {
    vi.stubGlobal('fetch', google());
    const сводка = await спросить('GET', '/api/analytics');
    expect(сводка.тело).toMatchObject({есть: true, днейПоиска: 1, поиск: 'есть'});
    expect((await спросить('POST', '/api/analytics/manual', {дата: '2026-09-24', текст: 'заголовки'})).тело).toEqual({ид: 1});
    expect((await спросить('POST', '/api/analytics/manual', {дата: '24.09', текст: 'x'})).код).toBe(400);
    expect((await спросить('POST', '/api/analytics/describe', {коммит: 'abc', путь: 'docs/a.mdx', описание: 'x'})).код).toBe(404);
    const база = fs.readFileSync(path.join(папкаАналитики(repo), 'аналитика.sqlite'));
    for (const текст of [сводка.текст, база.toString('latin1'), журнал.join('\n')]) {
      expect(текст).not.toContain('PRIVATE KEY');
      expect(текст).not.toContain(Buffer.from(ПРОПУСК).toString('latin1'));
    }
  });

  it('в течение срока обновления Google второй раз не спрашивается', async () => {
    const fetch = google();
    vi.stubGlobal('fetch', fetch);
    await спросить('GET', '/api/analytics');
    const спрошено = fetch.mock.calls.length;
    await спросить('GET', '/api/analytics');
    expect(fetch.mock.calls.length).toBe(спрошено);
  });
});
