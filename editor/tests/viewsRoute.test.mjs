// Ручка просмотров (ED-024) целиком: снимок, общий предел запросов, беды и то, что секрет не уходит
// ни в ответ окну, ни в файлы запоминания, ни в журнал сервера.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
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

  it('папка запоминания прячется от Git сама, без правила в корневом .gitignore', async () => {
    execFileSync('git', ['init', '-q'], {cwd: repo});
    vi.stubGlobal('fetch', google());
    await спросить();
    const видит = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'editor'], {cwd: repo, encoding: 'utf8'});
    expect(видит).toBe('');
  });

  it('отчёт спрашивается «за всё время» — с дня настройки; снимок короче нужного спрашивается заново', async () => {
    const fetch = google();
    vi.stubGlobal('fetch', fetch);
    await спросить();
    const тело = JSON.parse(fetch.mock.calls.find(([адрес]) => String(адрес).includes('runReport'))[1].body);
    expect(тело.dateRanges[0].startDate).toBe('2020-01-01');
    const спрошено = fetch.mock.calls.length;
    const раньше = настройки();
    раньше['просмотры']['сДня'] = '2019-01-01';
    await спросить(раньше);
    expect(fetch.mock.calls.length).toBeGreaterThan(спрошено);
  });

  it('через 6 часов после удачного снимка Google спрашивается снова, раньше — нет', async () => {
    const fetch = google();
    vi.stubGlobal('fetch', fetch);
    await спросить();
    const спрошено = fetch.mock.calls.length;
    Date.now.mockReturnValue(ДЕНЬ + 5 * 3600_000);
    await спросить();
    expect(fetch.mock.calls.length).toBe(спрошено);
    Date.now.mockReturnValue(ДЕНЬ + 6 * 3600_000);
    await спросить();
    expect(fetch.mock.calls.length).toBeGreaterThan(спрошено);
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

  it('неопубликованная смена slug не даёт статье чужой адрес: считается только опубликованный текст', async () => {
    fs.writeFileSync(path.join(repo, 'docs', 'lessons', 'a.mdx'), '---\nslug: /lessons/new\n---\n');
    vi.stubGlobal('fetch', google());
    const опубликованный = '---\ntitle: A\n---\n';
    const ответ = await (async () => {
      let итог;
      await viewsRoute({
        req: {method: 'GET'}, res: {}, url: new URL('http://x/api/views'), repo, settings: настройки(),
        git: {...git, show: async ([где]) => (где === 'origin/main:docs/lessons/a.mdx' ? опубликованный : Promise.reject(new Error('нет')))},
        publishedRef: () => 'origin/main',
        articles: async () => [{key: 'a', наСайте: true, versions: {en: {path: 'docs/lessons/a.mdx', опубликован: true, отличается: true}}}],
        send: (_res, код, данные) => {
          итог = данные;
        },
      });
      return итог;
    })();
    // 8 — опубликованный адрес /lessons/a (5) и его русский адрес (3); 9 просмотров чужой /lessons/new
    // статье не достались, хотя местный `slug` уже указывает туда.
    expect(ответ.статьи.a.за30).toBe(8);
  });

  it('числа пришли, а снимок не записался — это неудача с паузой, Google не спрашивается снова', async () => {
    fs.mkdirSync(path.join(repo, 'editor', '.views', 'снимок.json'), {recursive: true});
    const fetch = google();
    vi.stubGlobal('fetch', fetch);
    const ответ = await спросить();
    expect(ответ.данные.надпись).toContain('не смогла сохранить');
    const спрошено = fetch.mock.calls.length;
    await спросить();
    await спросить();
    expect(fetch.mock.calls.length).toBe(спрошено);
  });

  it('папку запоминания нельзя создать — ответ без чисел, без падения и без обращения к Google', async () => {
    fs.mkdirSync(path.join(repo, 'editor'), {recursive: true});
    fs.writeFileSync(path.join(repo, 'editor', '.views'), 'не папка');
    const fetch = google();
    vi.stubGlobal('fetch', fetch);
    const ответ = await спросить();
    expect(ответ.код).toBe(200);
    expect(ответ.данные.статьи).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('два запроса разом — Google спрашивает только один экземпляр', async () => {
    const fetch = google();
    vi.stubGlobal('fetch', fetch);
    await Promise.all([спросить(), спросить()]);
    expect(fetch.mock.calls.filter(([адрес]) => String(адрес).includes('oauth2'))).toHaveLength(1);
  });
});

describe('общий предел запросов', () => {
  it('право спросить достаётся одному; отдаётся только своя отметка; брошенная снимается по сроку', () => {
    const первая = занять(repo, 1000, 5000);
    expect(первая).toBeTruthy();
    expect(занять(repo, 1000, 5500)).toBeNull();
    // Первая зависла, её отметку по сроку сняла вторая; поздний итог первой чужую отметку не снимает.
    const вторая = занять(repo, 1000, 7000);
    expect(вторая).toBeTruthy();
    завершить(repo, {метка: первая, когда: 7100, итог: 'нетСвязи', снимок: null});
    expect(занять(repo, 1000, 7200)).toBeNull();
    завершить(repo, {метка: вторая, когда: 7300, итог: 'нетСвязи', снимок: null});
    expect(занять(repo, 1000, 7400)).toBeTruthy();
  });

  it('беда с ключом у себя паузы не ждёт: Google не спрашивался', () => {
    expect(пораСпросить({снимок: null, попытка: {когда: ДЕНЬ, итог: 'нетКлюча'}, сейчас: ДЕНЬ + 1000, паузаЧасов: 3})).toBe(true);
    expect(пораСпросить({снимок: null, попытка: {когда: ДЕНЬ, итог: 'нетСвязи'}, сейчас: ДЕНЬ + 1000, паузаЧасов: 3})).toBe(false);
  });

  it('пора спросить: не в день удачного снимка и не раньше паузы после попытки', () => {
    const снимок = {запрошено: new Date(ДЕНЬ).toISOString()};
    expect(пораСпросить({снимок, попытка: null, сейчас: ДЕНЬ + 60_000, паузаЧасов: 3, обновлениеЧасов: 6})).toBe(false);
    // Снимок старше срока обновления — Google спрашивается снова, даже в те же сутки: досчитанное
    // за ночь подтягивается само, неполный день не держится до завтра.
    expect(пораСпросить({снимок, попытка: null, сейчас: ДЕНЬ + 5 * 3600_000, паузаЧасов: 3, обновлениеЧасов: 6})).toBe(false);
    expect(пораСпросить({снимок, попытка: null, сейчас: ДЕНЬ + 6 * 3600_000, паузаЧасов: 3, обновлениеЧасов: 6})).toBe(true);
    expect(пораСпросить({снимок: null, попытка: {когда: ДЕНЬ, итог: 'предел'}, сейчас: ДЕНЬ + 3600_000, паузаЧасов: 3})).toBe(false);
    expect(пораСпросить({снимок: null, попытка: {когда: ДЕНЬ, итог: 'предел'}, сейчас: ДЕНЬ + 4 * 3600_000, паузаЧасов: 3})).toBe(true);
    // Удача паузы не ставит: сегодняшний снимок и так закрывает день, а негодный снимок спрашивается заново.
    expect(пораСпросить({снимок: null, попытка: {когда: ДЕНЬ, итог: 'есть'}, сейчас: ДЕНЬ + 1000, паузаЧасов: 3})).toBe(true);
  });
});
