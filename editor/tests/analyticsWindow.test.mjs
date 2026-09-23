// Окно аналитики (ED-054, операция 2): ручки только чтения и граница оси графика.
import {beforeEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {analyticsReadRoute, охватИзЗапроса} from '../src/adapters/analyticsReadRoute.mjs';
import {открыть, заменитьДни, записатьКоммит} from '../src/adapters/analyticsStore.mjs';
import {занять, завершить} from '../src/adapters/viewsStore.mjs';
import {граница} from '../src/ui/zones/BarChart.tsx';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
let repo;
let папка;

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'окно-'));
  папка = fs.mkdtempSync(path.join(os.tmpdir(), 'ключ-'));
  fs.writeFileSync(path.join(папка, 'key.json'), JSON.stringify({
    type: 'service_account', client_email: 'e@x', private_key: privateKey.export({type: 'pkcs8', format: 'pem'}),
  }));
});

function настройки(своя = папка) {
  const settings = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
  settings['просмотры']['папкаКлюча'] = своя;
  return settings;
}
async function спросить(адрес, settings = настройки()) {
  let ответ;
  const взята = await analyticsReadRoute({
    req: {method: 'GET'}, res: {}, url: new URL(`http://x${адрес}`), repo, settings,
    send: (_res, код, тело) => {
      ответ = {код, тело};
    },
  });
  expect(взята).toBe(true);
  return ответ;
}

describe('граница оси', () => {
  it('середина оси — целое число; не меньше 2', () => {
    expect([0, 1, 2, 3, 7, 15, 45, 6761, 8844].map(граница)).toEqual([2, 2, 2, 4, 8, 20, 60, 8000, 10000]);
    for (const в of [3, 7, 15, 45, 8844]) expect(Number.isInteger(граница(в) / 2)).toBe(true);
  });
});

describe('ручки чтения окна', () => {
  it('охват из запроса: сайт, язык, страница; чужое — сайт', () => {
    expect(охватИзЗапроса(null, ['en', 'ru'])).toBe('сайт');
    expect(охватИзЗапроса('ru', ['en', 'ru'])).toBe('ru');
    expect(охватИзЗапроса('de', ['en', 'ru'])).toBe('сайт');
    expect(охватИзЗапроса('стр:/ru/a', ['en', 'ru'])).toEqual({страница: '/ru/a'});
  });

  it('без ключа функции нет: пустой ответ, база не создаётся', async () => {
    const пустая = fs.mkdtempSync(path.join(os.tmpdir(), 'нет-ключа-'));
    expect((await спросить('/api/analytics/search', настройки(пустая))).тело).toEqual({есть: false});
    expect(fs.existsSync(path.join(repo, 'editor', '.analytics'))).toBe(false);
  });

  it('просмотры сайта: снимок GA4 — те же ряды и страницы, что у поиска; язык по адресу', async () => {
    const метка = занять(repo, 60_000, 1000);
    завершить(repo, {метка, когда: 1000, итог: 'есть', снимок: {запрошено: '2026-09-23T00:00:00Z', с: '20200101', поДень: '20260922', строки: [
      ['/lessons/a/', '20260920', 5], ['/ru/lessons/a/', '20260921', 3], ['/lessons/a/', '20260801', 40],
    ]}});
    (await открыть(repo)).close();

    const ряд = (await спросить('/api/analytics/views?шаг=месяц')).тело;
    expect(ряд.ряд.map((т) => [т.начало, т.показы])).toEqual([['2026-08-01', 40], ['2026-09-01', 8]]);
    const русские = (await спросить(`/api/analytics/views-pages?${new URLSearchParams({охват: 'ru'})}`)).тело;
    expect(русские.страницы).toEqual([expect.objectContaining({путь: '/ru/lessons/a', показы: 3, разницаПоказов: 3})]);
    const все = (await спросить('/api/analytics/views-pages')).тело;
    expect(все.страницы.find((с) => с.путь === '/lessons/a')).toMatchObject({показы: 5, разницаПоказов: -35});
  });

  it('ряд начинается не раньше первого дня с данными; страницы; действия без разницы, разница — по запросу', async () => {
    const база = await открыть(repo);
    заменитьДни(база, {с: '2026-06-01', по: '2026-09-22', строки: [
      ['2026-06-03', 'https://learn.bimcore.one/a/', 10, 1, 0.1, 5],
      ['2026-09-22', 'https://learn.bimcore.one/ru/b/', 20, 2, 0.1, 3],
    ], неполныйС: '2026-09-22'});
    записатьКоммит(база, [{
      коммит: 'c1', путь: 'docs/a.mdx', вид: 'правка', прежнийПуть: null, локаль: 'en', адрес: '/a', прежнийАдрес: '/a',
      дата: '2026-09-01T10:00:00+02:00', увидено: '2026-09-24T00:00:00Z', автор: 'v', дельта: '+текст', добавлено: 1, убрано: 0,
    }], 'c1');
    база.close();

    const ряд = (await спросить('/api/analytics/search?шаг=неделя')).тело;
    expect(ряд.с).toBe('2026-06-03');
    expect(ряд.ряд[0].начало).toBe('2026-06-01');
    expect(ряд.ряд.at(-1).неполный).toBe(true);
    const русский = (await спросить(`/api/analytics/search?${new URLSearchParams({шаг: 'месяц', охват: 'ru'})}`)).тело;
    expect(русский.ряд.map((т) => т.показы)).toEqual([0, 0, 0, 20]);

    const действия = (await спросить('/api/analytics/actions')).тело;
    expect(действия.события).toHaveLength(1);
    expect(действия.события[0]).not.toHaveProperty('дельта');
    const разница = (await спросить(`/api/analytics/delta?${new URLSearchParams({коммит: 'c1', путь: 'docs/a.mdx'})}`)).тело;
    expect(разница.дельта).toBe('+текст');
  });
});
