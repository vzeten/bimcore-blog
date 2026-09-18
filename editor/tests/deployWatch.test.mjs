// Имя каждого теста повторяет формулировку правила.
//
// Слежение за выкладкой на GitHub (решение владельца 2026-09-18, п.5б). Сеть здесь не спрашивается:
// ответы API — ЗАПИСАННЫЕ ответы настоящего GitHub по репозиторию владельца (`githubActions.fixture.json`,
// сняты 2026-09-18: удачная выкладка, упавшая сборка 11.09 и упавшая выкладка 25.07). Ветвь «не GitHub»
// проверяется на учебном голом репозитории из обвязки публикации.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  запомнитьВыкладку, итогЗапусков, итогРабот, опросить, отметитьПоказ, прочитатьВыкладку, записатьВыкладку,
} from '../src/adapters/deployWatch.mjs';
import {pushRoute} from '../src/adapters/pushRoute.mjs';
import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {RU, СТАТЬЯ, запрос, настройкиСервера, среда, убратьПесочницы} from './publishHarness.mjs';

const ОТВЕТЫ = JSON.parse(fs.readFileSync(new URL('./githubActions.fixture.json', import.meta.url), 'utf8'));
const НАСТРОЙКИ = настройкиСервера();
const ОПРОС = НАСТРОЙКИ['выкладка']['опрос'];
const папки = [];
afterEach(() => {
  убратьПесочницы();
  while (папки.length > 0) fs.rmSync(папки.pop(), {recursive: true, force: true});
});

/** Ответ fetch: статус, тело и заголовки, как их отдаёт GitHub. */
const ответ = (status, тело = null, заголовки = {}) => ({
  status, ok: status >= 200 && status < 300,
  json: async () => тело,
  headers: {get: (имя) => заголовки[имя.toLowerCase()] ?? null},
});
/** Подставной fetch: отвечает по порядку и помнит, что спросили. */
const сеть = (...ответы) => {
  const вопросы = [];
  const fetch = async (адрес, опции) => {
    вопросы.push({адрес, заголовки: опции?.headers ?? {}});
    return ответы.shift();
  };
  return {fetch, вопросы};
};
const запись = (ещё = {}) => ({
  sha: 'a91c561a9bebac7f6e6d1e3ca308230d67e4639c', путь: RU, локали: ['ru'], когда: new Date(Date.now() - 60_000).toISOString(),
  состояние: 'ждём', причина: null, владелец: 'vzeten', имя: 'bimcore-blog', runId: null, runUrl: null, шаг: null, etag: null, показано: false,
  ...ещё,
});

describe('ответы GitHub', () => {
  it('удачный запуск — «обновлён» со ссылкой на отчёт', () => {
    expect(итогЗапусков(ОТВЕТЫ['успех'])).toMatchObject({состояние: 'обновлён', завершён: true, runUrl: expect.stringContaining('/actions/runs/')});
  });

  it('запусков ещё нет — ждём; идущий запуск — идёт', () => {
    expect(итогЗапусков({total_count: 0, workflow_runs: []})).toMatchObject({состояние: 'ждём', завершён: false});
    const идёт = {workflow_runs: [{...ОТВЕТЫ['успех'].workflow_runs[0], status: 'in_progress', conclusion: null}]};
    expect(итогЗапусков(идёт)).toMatchObject({состояние: 'идёт', завершён: false, вОчереди: false});
  });

  it('упала работа build — «не прошла сборка» с упавшим шагом; упала deploy — «GitHub не выложил сайт»', () => {
    expect(итогРабот(ОТВЕТЫ['работыСборки'])).toEqual({состояние: 'сборкаУпала', шаг: 'Run npm run build'});
    expect(итогРабот(ОТВЕТЫ['работыВыкладки'])).toEqual({состояние: 'выкладкаУпала', шаг: 'Run actions/deploy-pages@v4'});
  });
});

describe('опрос', () => {
  it('упавший запуск: второй вопрос про работы, итог — упавший шаг; опрос кончается', async () => {
    const {fetch, вопросы} = сеть(ответ(200, ОТВЕТЫ['сборкаУпала'], {etag: 'W/"1"', 'x-ratelimit-remaining': '55'}), ответ(200, ОТВЕТЫ['работыСборки']));

    const итог = await опросить({запись: запись(), fetch, опрос: ОПРОС});

    expect(итог.ждатьМс).toBeNull();
    expect(итог.запись).toMatchObject({состояние: 'сборкаУпала', шаг: 'Run npm run build', etag: 'W/"1"'});
    expect(вопросы[0].адрес).toBe('https://api.github.com/repos/vzeten/bimcore-blog/actions/runs?head_sha=a91c561a9bebac7f6e6d1e3ca308230d67e4639c&per_page=3');
    expect(вопросы[1].адрес).toBe('https://api.github.com/repos/vzeten/bimcore-blog/actions/runs/34618517503/jobs');
  });

  it('повтор спрашивается с If-None-Match; 304 лимит не тратит и состояния не меняет', async () => {
    const {fetch, вопросы} = сеть(ответ(304, null, {'x-ratelimit-remaining': '50'}));

    const итог = await опросить({запись: запись({состояние: 'идёт', etag: 'W/"1"'}), fetch, опрос: ОПРОС});

    expect(вопросы[0].заголовки['If-None-Match']).toBe('W/"1"');
    expect(итог).toEqual({запись: expect.objectContaining({состояние: 'идёт'}), ждатьМс: ОПРОС['идётСек'] * 1000});
  });

  it('остаток лимита меньше пяти — следующий вопрос не раньше сброса', async () => {
    const сейчас = Date.now();
    const сброс = Math.floor(сейчас / 1000) + 600;
    const {fetch} = сеть(ответ(200, {workflow_runs: []}, {'x-ratelimit-remaining': '3', 'x-ratelimit-reset': String(сброс)}));

    const итог = await опросить({запись: запись(), fetch, опрос: ОПРОС, сейчас});

    expect(итог.ждатьМс).toBe(сброс * 1000 - сейчас);
  });

  it('25 минут без итога — «выкладку не видно», сеть больше не спрашивается', async () => {
    const {fetch, вопросы} = сеть();
    const давно = new Date(Date.now() - (ОПРОС['пределМинут'] + 1) * 60_000).toISOString();

    const итог = await опросить({запись: запись({когда: давно}), fetch, опрос: ОПРОС});

    expect(итог).toEqual({запись: expect.objectContaining({состояние: 'неВидно', причина: 'долго'}), ждатьМс: null});
    expect(вопросы).toEqual([]);
  });
});

describe('запись выкладки', () => {
  const папка = () => {
    const путь = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-deploy-'));
    папки.push(путь);
    return путь;
  };
  const git = (адрес) => ({raw: async () => `${адрес}\n`});

  it('удалённый на GitHub — ждём выкладки; владелец и имя взяты из адреса', async () => {
    const где = папка();
    await запомнитьВыкладку({git: git('https://github.com/vzeten/bimcore-blog.git'), editorDir: где, settings: НАСТРОЙКИ, sha: 'abc', путь: RU, локали: ['ru']});

    expect(прочитатьВыкладку(где, НАСТРОЙКИ)).toMatchObject({sha: 'abc', состояние: 'ждём', владелец: 'vzeten', имя: 'bimcore-blog', показано: false});
  });

  it('человек увидел итог — показано; чужая отправка запись не трогает', () => {
    const где = папка();
    записатьВыкладку(где, НАСТРОЙКИ, запись({состояние: 'обновлён'}));

    expect(отметитьПоказ(где, НАСТРОЙКИ, 'другой')).toBe(false);
    expect(отметитьПоказ(где, НАСТРОЙКИ, запись().sha)).toBe(true);
    expect(прочитатьВыкладку(где, НАСТРОЙКИ).показано).toBe(true);
  });

  it('учебный git: отправка прошла — «выкладку не видно (не GitHub)», в сеть ни одного вопроса', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    const {payload: коммит} = await запрос(publishRoute, место, '/api/publish/commit', {path: RU, подтверждено: true});
    await запрос(pushRoute, место, '/api/publish/plan', {path: RU});
    const отправка = await запрос(pushRoute, место, '/api/publish/push', {path: RU, sha: коммит.sha, подтверждено: true});

    expect(отправка.payload.отправлено).toBe(true);
    expect(прочитатьВыкладку(место.editorDir, НАСТРОЙКИ)).toMatchObject({
      sha: коммит.sha, путь: RU, локали: ['ru'], состояние: 'неВидно', причина: 'неGitHub',
    });
  }, ЖДАТЬ_GIT);
});
