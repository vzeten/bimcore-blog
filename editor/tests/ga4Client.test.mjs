// Граница с Google Analytics (ED-024): ключ, пропуск и отчёт — на поддельном ключе и поддельных ответах.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {найтиКлюч, получитьПропуск, отчётПросмотров} from '../src/adapters/ga4Client.mjs';

const {privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
const СЕКРЕТ = privateKey.export({type: 'pkcs8', format: 'pem'});
const ПРОПУСК = 'пропуск-google-не-для-глаз';

function папкаКлюча(файлы) {
  const папка = fs.mkdtempSync(path.join(os.tmpdir(), 'ключ-'));
  for (const [имя, текст] of Object.entries(файлы)) fs.writeFileSync(path.join(папка, имя), текст);
  return папка;
}
const ключJSON = JSON.stringify({type: 'service_account', client_email: 'editor@x.iam.gserviceaccount.com', private_key: СЕКРЕТ});

afterEach(() => vi.unstubAllGlobals());

describe('ключ', () => {
  it('единственный ключ служебного доступа читается', () => {
    const найден = найтиКлюч(папкаКлюча({'int-lines-08.json': ключJSON}));
    expect(найден.ключ.почта).toBe('editor@x.iam.gserviceaccount.com');
  });

  it('каждая беда — свой код, без текста ключа', () => {
    expect(найтиКлюч('относительная/папка')).toEqual({причина: 'нетПапки'});
    expect(найтиКлюч(path.join(os.tmpdir(), 'нет-такой-папки-ключа'))).toEqual({причина: 'нетПапки'});
    expect(найтиКлюч(папкаКлюча({}))).toEqual({причина: 'нетКлюча'});
    expect(найтиКлюч(папкаКлюча({'a.json': ключJSON, 'b.json': ключJSON}))).toEqual({причина: 'многоКлючей'});
    expect(найтиКлюч(папкаКлюча({'a.json': '{"type":"authorized_user"}'}))).toEqual({причина: 'неКлюч'});
    expect(найтиКлюч(папкаКлюча({'a.json': 'не json ' + СЕКРЕТ}))).toEqual({причина: 'неКлюч'});
  });

  it('ключ внутри рабочей копии Git не читается: оттуда он уезжает на GitHub одной командой', () => {
    const корень = папкаКлюча({});
    fs.mkdirSync(path.join(корень, '.git'));
    const папка = path.join(корень, 'keys');
    fs.mkdirSync(папка);
    fs.writeFileSync(path.join(папка, 'a.json'), ключJSON);
    expect(найтиКлюч(папка)).toEqual({причина: 'ключВGit'});
  });
});

describe('пропуск и отчёт', () => {
  const ключ = {почта: 'editor@x.iam.gserviceaccount.com', секрет: СЕКРЕТ};

  it('пропуск: по сети идёт подпись, а не ключ; адрес постоянный, без перенаправлений', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({access_token: ПРОПУСК}), {status: 200}));
    vi.stubGlobal('fetch', fetch);
    expect(await получитьПропуск(ключ, 1000)).toEqual({пропуск: ПРОПУСК});
    const [адрес, опции] = fetch.mock.calls[0];
    expect(адрес).toBe('https://oauth2.googleapis.com/token');
    expect(опции.redirect).toBe('error');
    expect(опции.signal).toBeDefined();
    expect(String(опции.body)).not.toContain('PRIVATE');
  });

  it('пропуск: отказ Google, сбой Google и нет связи — свои коды', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {status: 400})));
    expect(await получитьПропуск(ключ, 1000)).toEqual({причина: 'ключОтклонён'});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {status: 503})));
    expect(await получитьПропуск(ключ, 1000)).toEqual({причина: 'сбойGoogle'});
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error(`сеть упала ${СЕКРЕТ}`);
    }));
    expect(await получитьПропуск(ключ, 1000)).toEqual({причина: 'нетСвязи'});
    expect(await получитьПропуск({почта: 'x', секрет: 'не ключ'}, 1000)).toEqual({причина: 'неКлюч'});
  });

  it('отчёт: фильтр потока learn, страницы читаются до конца', async () => {
    const строка = (адрес, день, n) => ({dimensionValues: [{value: адрес}, {value: день}], metricValues: [{value: String(n)}]});
    const страницы = [
      {rows: Array.from({length: 50000}, () => строка('/a/', '20260901', 1)), rowCount: 50001},
      {rows: [строка('/b/', '20260902', 7)], rowCount: 50001},
    ];
    const fetch = vi.fn(async () => new Response(JSON.stringify(страницы.shift()), {status: 200}));
    vi.stubGlobal('fetch', fetch);
    const итог = await отчётПросмотров({пропуск: ПРОПУСК, ресурс: '531436914', поток: '14901060917', с: '20250901', по: '20260922', срокМс: 1000});
    expect(итог.строки).toHaveLength(50001);
    expect(итог.строки.at(-1)).toEqual(['/b/', '20260902', 7]);
    const [адрес, опции] = fetch.mock.calls[0];
    expect(адрес).toBe('https://analyticsdata.googleapis.com/v1beta/properties/531436914:runReport');
    expect(опции.redirect).toBe('error');
    const тело = JSON.parse(опции.body);
    expect(тело.dimensionFilter.filter).toEqual({fieldName: 'streamId', stringFilter: {matchType: 'EXACT', value: '14901060917'}});
    expect(тело.dateRanges).toEqual([{startDate: '2025-09-01', endDate: '2026-09-22'}]);
    expect(JSON.parse(fetch.mock.calls[1][1].body).offset).toBe(50000);
  });

  it('отчёт: нет доступа, предел, сбой и нет связи — свои коды', async () => {
    const спросить = () => отчётПросмотров({пропуск: ПРОПУСК, ресурс: '1', поток: '2', с: '20260101', по: '20260102', срокМс: 1000});
    for (const [статус, причина] of [[403, 'нетДоступа'], [429, 'предел'], [500, 'сбойGoogle']]) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"x"}}', {status: статус})));
      expect(await спросить()).toEqual({причина});
    }
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('timeout');
    }));
    expect(await спросить()).toEqual({причина: 'нетСвязи'});
    expect(await отчётПросмотров({пропуск: ПРОПУСК, ресурс: '1/../x', поток: '2', с: '1', по: '2', срокМс: 1})).toEqual({причина: 'нетДоступа'});
  });
});
