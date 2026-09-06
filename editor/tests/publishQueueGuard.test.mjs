// Имя каждого теста повторяет формулировку правила.
//
// Три заслона вокруг очереди ожидающих коммитов, найденные независимым контролёром:
// разбор очереди идёт только под общим замком и не стирает чужую запись; ожидающий коммит держится
// служебной ссылкой и переживает уборку git, а пропавший не блокирует навсегда и не даёт ложного
// успеха; запись хранит путь и отпечаток показанного плана, и изменившаяся статья не уезжает.
// Проверяется на НАСТОЯЩЕМ git с настоящим удалённым.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {pushRoute} from '../src/adapters/pushRoute.mjs';
import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {запомнитьСборку} from '../src/adapters/buildMemory.mjs';
import {запомнитьПоказ} from '../src/adapters/pushMemory.mjs';
import {прочитатьОчередь, записатьОчередь} from '../src/adapters/commitQueue.mjs';
import {разобратьОчередь} from '../src/adapters/publishRepair.mjs';
import {взятьЗамок, отпустить} from '../src/adapters/publishLock.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {EN, RU, СТАТЬЯ, запрос, наСервере, настройкиСервера, сборщик, среда, убратьПесочницы} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

afterEach(() => {
  запомнитьСборку(null);
  запомнитьПоказ(null);
  отпустить();
  убратьПесочницы();
});

const состав = (место) => запрос(releaseRoute, место, '/api/release', {path: RU});
const собрать = (место) => запрос(releaseRoute, место, '/api/release/build', {path: RU}, {запуск: сборщик()});
const записать = (место) => запрос(publishRoute, место, '/api/publish/commit', {path: RU, подтверждено: true});
const показать = (место) => запрос(pushRoute, место, '/api/publish/plan', {path: RU});
const отправить = (место, sha) => запрос(pushRoute, место, '/api/publish/push', {path: RU, sha, подтверждено: true});
const очередь = (место) => прочитатьОчередь(место.editorDir, настройкиСервера()).записи;
const ссылка = (место, sha) => место.git.raw(['rev-parse', '--quiet', '--verify', `refs/editor/publish/${sha}`]).catch(() => '');

/** Записанный, но не уехавший коммит статьи. Возвращает его полный SHA. */
async function ожидающийКоммит(место) {
  место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
  await собрать(место);
  const {status, payload} = await записать(место);
  expect(status).toBe(200);

  return payload.sha;
}

describe('разбор очереди под общим замком', () => {
  it('без замка разбор не идёт и очередь не трогает', async () => {
    const место = await среда();
    const sha = await ожидающийКоммит(место);

    const итог = await разобратьОчередь({
      git: место.git, repo: место.repo, editorDir: место.editorDir, settings: настройкиСервера(), основа: место.основа,
    });

    expect(итог.ошибка).toBe('идётЗапись');
    expect(очередь(место).map((своя) => своя.sha)).toEqual([sha]);
  });

  it('замок занят другим заходом — состав отвечает «идёт запись» и очередь не трогает', async () => {
    const место = await среда();
    const sha = await ожидающийКоммит(место);
    expect(взятьЗамок()).toBe(true);

    const {status, payload} = await состав(место);

    expect(status).toBe(409);
    expect(payload.код).toBe('идётЗапись');
    expect(очередь(место).map((своя) => своя.sha)).toEqual([sha]);
  });

  it('запись, появившаяся во время разбора, не стирается: пишется сегодняшняя очередь без снятого', async () => {
    const место = await среда();
    const доехавший = await ожидающийКоммит(место);
    await место.git.raw(['push', 'origin', `${доехавший}:refs/heads/main`]);
    const новая = {
      sha: 'b'.repeat(40), пути: [RU], основа: место.основа, путь: RU, отпечаток: 'x', созданные: [], удалённые: [],
      когда: new Date().toISOString(), состояние: 'сделан',
    };
    // Дверь к git, через которую в разгар разбора кто-то дописывает в очередь новую запись.
    let дописано = false;
    const сГонкой = {
      raw: async (аргументы) => {
        const ответ = await место.git.raw(аргументы);
        if (!дописано && аргументы.includes('merge-base')) {
          дописано = true;
          записатьОчередь(место.editorDir, настройкиСервера(), [...очередь(место), новая]);
        }

        return ответ;
      },
    };

    const {status} = await запрос(releaseRoute, {...место, git: сГонкой}, '/api/release', {path: RU});

    expect(дописано).toBe(true);
    // Доехавший снят, а запись, появившаяся после чтения, на месте: разбор её не видел и не судил.
    expect(status).toBe(200);
    expect(очередь(место).map((своя) => своя.sha)).toEqual(['b'.repeat(40)]);
  });
});

describe('ожидающий коммит переживает уборку git', () => {
  it('служебная ссылка держит коммит: после git gc --prune=now досылается тот же SHA', async () => {
    const место = await среда();
    const sha = await ожидающийКоммит(место);
    expect((await ссылка(место, sha)).trim()).toBe(sha);

    await место.git.raw(['gc', '--prune=now', '--quiet']);
    await показать(место);
    const {payload} = await отправить(место, sha);

    expect(payload.отправлено).toBe(true);
    expect(await наСервере(место)).toBe(sha);
    // Работа уехала — ссылка отпущена, очередь пуста; ветка и индекс человека не тронуты.
    expect((await ссылка(место, sha)).trim()).toBe('');
    expect(очередь(место)).toEqual([]);
    expect((await место.git.raw(['rev-parse', 'HEAD'])).trim()).toBe(место.основа);
  });

  it('коммит пропал из хранилища — запись снимается с честным кодом, ложного успеха нет, новый план проходит', async () => {
    const место = await среда();
    const sha = await ожидающийКоммит(место);
    // Так выглядит чужая рука: ссылку сняли, уборка стёрла недостижимый коммит.
    await место.git.raw(['update-ref', '-d', `refs/editor/publish/${sha}`]);
    await место.git.raw(['gc', '--prune=now', '--quiet']);
    expect((await место.git.raw(['rev-parse', '--quiet', '--verify', `${sha}^{commit}`]).catch(() => '')).trim()).toBe('');

    const показ = await показать(место);
    const отправка = await отправить(место, sha);

    expect(показ.payload.код).toBe('коммитПропал');
    expect(отправка.status).toBe(409);
    expect(отправка.payload.код).toBe('коммитПропал');
    expect(await наСервере(место)).toBe(место.основа);
    expect(очередь(место)).toEqual([]);
    // Человек не заперт: новый ход строит новый коммит и доезжает до сайта.
    expect((await состав(место)).status).toBe(200);
    await собрать(место);
    const новый = (await записать(место)).payload.sha;
    await показать(место);
    expect((await отправить(место, новый)).payload.отправлено).toBe(true);
  });
});

describe('статья после показа не меняется', () => {
  it('запись хранит путь открытой локали и отпечаток показанного плана', async () => {
    const место = await среда();
    const показанный = (await состав(место)).payload.отпечаток;
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    const новыйПоказ = (await состав(место)).payload.отпечаток;
    await собрать(место);
    await записать(место);

    const [запись] = очередь(место);

    expect(запись.путь).toBe(RU);
    expect(запись.отпечаток).toBe(новыйПоказ);
    expect(запись.отпечаток).not.toBe(показанный);
  });

  it('статья изменилась между показом и отправкой — отправки нет, push не зовётся, запись снята', async () => {
    const место = await среда();
    const sha = await ожидающийКоммит(место);
    await показать(место);
    место.положить(RU, `${СТАТЬЯ}Совсем другая строка.\n`);
    const вызовы = [];
    const следящий = {
      raw: async (аргументы) => {
        if (аргументы[0] === 'push') вызовы.push(аргументы);
        return место.git.raw(аргументы);
      },
    };

    const {status, payload} = await запрос(pushRoute, {...место, git: следящий}, '/api/publish/push', {
      path: RU, sha, подтверждено: true,
    });

    expect(status).toBe(409);
    expect(payload.код).toBe('статьяИзменилась');
    expect(вызовы).toEqual([]);
    expect(await наСервере(место)).toBe(место.основа);
    expect(очередь(место)).toEqual([]);
    expect((await ссылка(место, sha)).trim()).toBe('');
    // Следующий состав не говорит «есть неотправленное»: человека спрашивают заново о новом тексте.
    expect((await состав(место)).status).toBe(200);
  });

  it('запись старого вида без пути и отпечатка читается, но досылке не подлежит', async () => {
    const место = await среда();
    const sha = await ожидающийКоммит(место);
    const старая = очередь(место).map(({путь, отпечаток, ...остальное}) => остальное);
    записатьОчередь(место.editorDir, настройкиСервера(), старая);
    expect(прочитатьОчередь(место.editorDir, настройкиСервера()).ошибка).toBeUndefined();

    const {status, payload} = await отправить(место, sha);

    expect(status).toBe(409);
    expect(payload.отправлено).toBeUndefined();
    expect(await наСервере(место)).toBe(место.основа);
    expect(очередь(место)).toEqual([]);
  });

  it('файл статьи исчез после записи — отправки нет: показанный план нечем подтвердить', async () => {
    const место = await среда();
    const sha = await ожидающийКоммит(место);
    await показать(место);
    fs.rmSync(path.join(место.repo, RU));

    // Досылку начинают из соседней версии: путь записи проверяется по самой записи, а не по запросу.
    const {status, payload} = await запрос(pushRoute, место, '/api/publish/push', {path: EN, sha, подтверждено: true});

    expect(status).toBe(409);
    expect(payload.код).toBe('статьяИзменилась');
    expect(await наСервере(место)).toBe(место.основа);
    expect(очередь(место)).toEqual([]);
  });
});
