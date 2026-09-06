// Имя каждого теста повторяет формулировку правила.
//
// Три заслона второго круга контролёра: последняя сверка отпечатка перед самым `push` под тем же
// замком; служебная ссылка на коммит принадлежит заходу до успешной записи очереди; снятая
// недоказанная запись не превращает показ в «уже на сайте». Проверяется на НАСТОЯЩЕМ git.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';

import {pushRoute} from '../src/adapters/pushRoute.mjs';
import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {запомнитьСборку} from '../src/adapters/buildMemory.mjs';
import {запомнитьПоказ} from '../src/adapters/pushMemory.mjs';
import {прочитатьОчередь, записатьОчередь} from '../src/adapters/commitQueue.mjs';
import {отпустить} from '../src/adapters/publishLock.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {RU, СТАТЬЯ, запрос, наСервере, настройкиСервера, сборщик, среда, убратьПесочницы} from './publishHarness.mjs';

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
const ссылки = (место) => место.git.raw(['for-each-ref', '--format=%(refname)', 'refs/editor/publish']);

/** Записанный, но не уехавший коммит статьи. Возвращает его полный SHA. */
async function ожидающийКоммит(место) {
  место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
  await собрать(место);
  const {status, payload} = await записать(место);
  expect(status).toBe(200);

  return payload.sha;
}

describe('последняя сверка перед самой отправкой', () => {
  it('статья изменилась внутри захода отправки, после разбора, — push не зовётся, запись и ссылка сняты', async () => {
    const место = await среда();
    const sha = await ожидающийКоммит(место);
    await показать(место);
    // Дверь к git: ровно во время позднего вопроса (перечень уезжающих коммитов) человек правит статью.
    const вызовы = [];
    let правлено = false;
    const сПравкой = {
      raw: async (аргументы) => {
        if (аргументы[0] === 'push') вызовы.push(аргументы);
        const ответ = await место.git.raw(аргументы);
        if (!правлено && аргументы.includes('rev-list') && аргументы.includes('--parents')) {
          правлено = true;
          место.положить(RU, `${СТАТЬЯ}Правка в последний миг.\n`);
        }

        return ответ;
      },
    };

    const {status, payload} = await запрос(pushRoute, {...место, git: сПравкой}, '/api/publish/push', {
      path: RU, sha, подтверждено: true,
    });

    expect(правлено).toBe(true);
    expect(status).toBe(409);
    expect(payload.код).toBe('статьяИзменилась');
    expect(вызовы).toEqual([]);
    expect(await наСервере(место)).toBe(место.основа);
    expect(очередь(место)).toEqual([]);
    expect((await ссылки(место)).trim()).toBe('');
    // Следующий ход честен: новый план по новому тексту, а не досылка старого.
    expect((await состав(место)).status).toBe(200);
  });
});

describe('служебная ссылка принадлежит заходу до записи очереди', () => {
  it('чтение путей коммита упало — отказ, очередь пуста, ссылки нет, следующий ход чист', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    // Дверь к git, у которой после создания коммита падает чтение его путей.
    let упало = false;
    const сПадением = {
      raw: async (аргументы) => {
        if (!упало && аргументы.includes('show') && аргументы.includes('--name-only')) {
          упало = true;
          throw new Error('git не ответил');
        }

        return место.git.raw(аргументы);
      },
    };

    const {status, payload} = await запрос(publishRoute, {...место, git: сПадением}, '/api/publish/commit', {
      path: RU, подтверждено: true,
    });

    expect(упало).toBe(true);
    expect(status).toBe(409);
    expect(payload.код).toBe('коммитНеУдался');
    expect(очередь(место)).toEqual([]);
    expect((await ссылки(место)).trim()).toBe('');
    expect(await наСервере(место)).toBe(место.основа);
    // Следующий ход чист: состав, сборка, запись и отправка проходят как обычно.
    expect((await состав(место)).status).toBe(200);
    await собрать(место);
    const {payload: запись} = await записать(место);
    await показать(место);
    expect((await отправить(место, запись.sha)).payload.отправлено).toBe(true);
  });

  it('запись очереди не легла на диск — ссылка отпущена, коммит никому не принадлежит', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    const сброс = vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {
      throw Object.assign(new Error('сброс не удался'), {code: 'EIO'});
    });

    let итог;
    try {
      итог = await записать(место);
    } finally {
      сброс.mockRestore();
    }

    expect(итог.payload.код).toBe('происхождениеНеЗаписано');
    expect(очередь(место)).toEqual([]);
    expect((await ссылки(место)).trim()).toBe('');
  });
});

describe('снятая недоказанная запись не выдаётся за «уже на сайте»', () => {
  it('показ после снятия старой записи без отпечатка отвечает честным кодом, а не успехом', async () => {
    const место = await среда();
    записатьОчередь(место.editorDir, настройкиСервера(), [{
      sha: 'c'.repeat(40), пути: [RU], созданные: [], удалённые: [], основа: место.основа,
      когда: new Date().toISOString(), состояние: 'сделан',
    }]);

    const {status, payload} = await показать(место);

    expect(status).toBe(409);
    expect(payload.код).toBe('неНашКоммит');
    expect(payload.уже).toBeUndefined();
    expect(очередь(место)).toEqual([]);
    // Согласие на ту запись тоже не проходит: отправки нет, сервер не тронут.
    expect((await отправить(место, 'c'.repeat(40))).status).toBe(409);
    expect(await наСервере(место)).toBe(место.основа);
    // А чистый показ после этого — обычный: снимать нечего, уезжать нечему.
    expect((await показать(место)).payload.уже).toBe(true);
  });

  it('снятое намерение оборванной записи тоже называется честно', async () => {
    const место = await среда();
    записатьОчередь(место.editorDir, настройкиСервера(), [{
      sha: 'd'.repeat(40), пути: [RU], созданные: [], удалённые: [], основа: место.основа, путь: RU, отпечаток: 'x',
      когда: new Date().toISOString(), состояние: 'намерение',
    }]);

    const {status, payload} = await показать(место);

    expect(status).toBe(409);
    expect(payload.код).toBe('неНашКоммит');
    expect(очередь(место)).toEqual([]);
  });
});
