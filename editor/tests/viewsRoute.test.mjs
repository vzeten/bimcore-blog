// Ручка просмотров (ED-024) целиком: снимок, общий предел запросов, беды и то, что секрет не уходит
// ни в ответ окну, ни в файлы запоминания, ни в журнал сервера.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {viewsRoute} from '../src/adapters/viewsRoute.mjs';
import {занять, завершить, пораСпросить} from '../src/adapters/viewsStore.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
const СЕКРЕТ = privateKey.export({type: 'pkcs8', format: 'pem'});
const ПРОПУСК = 'пропуск-google-не-для-глаз';
const ДЕНЬ = Date.parse('2026-09-23T12:00:00');

let repo;
let папка;
let журнал;

function настройки() {
  const settings = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
  settings['просмотры']['папкаКлюча'] = папка;
  return settings;
}

const свод = async () => [
  {key: 'a', наСайте: true, versions: {en: {path: 'docs/lessons/a.mdx', опубликован: true, отличается: false}}},
  {key: 'новая', наСайте: true, versions: {en: {path: 'docs/lessons/new.mdx', опубликован: false, отличается: null}}},
];
const git = {raw: async () => {
  throw new Error('нет git');
}, show: async () => {
  throw new Error('нет git');
}};

function отчёт() {
  const строка = (адрес, день, n) => ({dimensionValues: [{value: адрес}, {value: день}], metricValues: [{value: String(n)}]});
  return {rows: [строка('/lessons/a/', '20260920', 5), строка('/ru/lessons/a/', '20260910', 3), строка('/lessons/new/', '20260920', 9)], rowCount: 3};
}

function google() {
  return vi.fn(async (адрес) => (String(адрес).includes('oauth2')
    ? new Response(JSON.stringify({access_token: ПРОПУСК}), {status: 200})
    : new Response(JSON.stringify(отчёт()), {status: 200})));
}

async function спросить(settings = настройки()) {
  let ответ;
  const send = (_res, код, данные) => {
    ответ = {код, данные, текст: JSON.stringify(данные)};
  };
  const взята = await viewsRoute({
    req: {method: 'GET'}, res: {}, url: new URL('http://x/api/views'), repo, settings, git,
    publishedRef: () => null, articles: свод, send,
  });
  expect(взята).toBe(true);
  return ответ;
}

/** Всё, что программа оставила: ответы, файлы запоминания и журнал. Секрета нигде нет. */
function безСекрета(...ответы) {
  const файлы = fs.existsSync(path.join(repo, 'editor', '.views'))
    ? fs.readdirSync(path.join(repo, 'editor', '.views')).map((имя) => fs.readFileSync(path.join(repo, 'editor', '.views', имя), 'utf8'))
    : [];
  for (const текст of [...ответы.map((ответ) => ответ.текст), ...файлы, журнал.join('\n')]) {
    expect(текст).not.toContain('PRIVATE KEY');
    expect(текст).not.toContain(ПРОПУСК);
  }
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'просмотры-'));
  fs.mkdirSync(path.join(repo, 'docs', 'lessons'), {recursive: true});
  fs.writeFileSync(path.join(repo, 'docs', 'lessons', 'a.mdx'), '---\ntitle: A\n---\n');
  fs.writeFileSync(path.join(repo, 'docs', 'lessons', 'new.mdx'), '---\ntitle: N\n---\n');
  папка = fs.mkdtempSync(path.join(os.tmpdir(), 'ключ-'));
  fs.writeFileSync(path.join(папка, 'key.json'), JSON.stringify({type: 'service_account', client_email: 'e@x', private_key: СЕКРЕТ}));
  журнал = [];
  for (const способ of ['log', 'error', 'warn']) vi.spyOn(console, способ).mockImplementation((...части) => журнал.push(части.join(' ')));
  vi.spyOn(Date, 'now').mockReturnValue(ДЕНЬ);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('просмотры статей', () => {
  it('числа по снимку; не выходившая на сайт статья — без чисел; секрета нигде нет', async () => {
    const fetch = google();
    vi.stubGlobal('fetch', fetch);
    const ответ = await спросить();
    expect(ответ.код).toBe(200);
    expect(ответ.данные.поДень).toBe('20260922');
    expect(ответ.данные.статьи.a.за30).toBe(8);
    expect(ответ.данные.статьи.a.языки).toMatchObject({en: 5, ru: 3});
    expect(ответ.данные.статьи.новая).toBeUndefined();
    expect(ответ.данные.надпись).toBeNull();
    безСекрета(ответ);
  });

  it('в тот же день Google второй раз не спрашивается: числа из снимка', async () => {
    const fetch = google();
    vi.stubGlobal('fetch', fetch);
    await спросить();
    const спрошено = fetch.mock.calls.length;
    const второй = await спросить();
    expect(fetch.mock.calls.length).toBe(спрошено);
    expect(второй.данные.статьи.a.за30).toBe(8);
  });

  it('нет ключа — прочерки и понятная надпись с папкой; Google не спрашивается', async () => {
    fs.rmSync(path.join(папка, 'key.json'));
    const fetch = google();
    vi.stubGlobal('fetch', fetch);
    const ответ = await спросить();
    expect(fetch).not.toHaveBeenCalled();
    expect(ответ.данные.статьи).toEqual({});
    expect(ответ.данные.надпись).toContain(папка);
    безСекрета(ответ);
  });

  it('сбой после удачи: прежние числа остаются и названы старыми; до паузы повтора нет', async () => {
    vi.stubGlobal('fetch', google());
    await спросить();
    // Следующий день: пора спросить снова, но Google не отвечает.
    Date.now.mockReturnValue(ДЕНЬ + 24 * 3600 * 1000);
    const упал = vi.fn(async () => {
      throw new Error(`сеть ${СЕКРЕТ}`);
    });
    vi.stubGlobal('fetch', упал);
    const ответ = await спросить();
    expect(ответ.данные.статьи.a.за30).toBe(8);
    expect(ответ.данные.надпись).toContain('Нет связи с Google');
    const попыток = упал.mock.calls.length;
    await спросить();
    expect(упал.mock.calls.length).toBe(попыток);
    безСекрета(ответ);
  });

  it('два запроса разом — Google спрашивает только один экземпляр', async () => {
    const fetch = google();
    vi.stubGlobal('fetch', fetch);
    await Promise.all([спросить(), спросить()]);
    expect(fetch.mock.calls.filter(([адрес]) => String(адрес).includes('oauth2'))).toHaveLength(1);
  });
});

describe('общий предел запросов', () => {
  it('право спросить достаётся одному; брошенная отметка снимается по сроку', () => {
    expect(занять(repo, 1000, 5000)).toBe(true);
    expect(занять(repo, 1000, 5000)).toBe(false);
    завершить(repo, {когда: 5000, итог: 'нетСвязи', снимок: null});
    expect(занять(repo, 1000, 6000)).toBe(true);
    expect(занять(repo, 1, Date.now() + 10_000)).toBe(true);
  });

  it('пора спросить: не в день удачного снимка и не раньше паузы после попытки', () => {
    const снимок = {запрошено: new Date(ДЕНЬ).toISOString()};
    expect(пораСпросить({снимок, попытка: null, сейчас: ДЕНЬ + 60_000, паузаЧасов: 3})).toBe(false);
    expect(пораСпросить({снимок: null, попытка: {когда: ДЕНЬ}, сейчас: ДЕНЬ + 3600_000, паузаЧасов: 3})).toBe(false);
    expect(пораСпросить({снимок: null, попытка: {когда: ДЕНЬ}, сейчас: ДЕНЬ + 4 * 3600_000, паузаЧасов: 3})).toBe(true);
  });
});
