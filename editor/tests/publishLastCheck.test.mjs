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
import {запомнитьПоказ} from '../src/adapters/pushMemory.mjs';
import {прочитатьОчередь, записатьОчередь} from '../src/adapters/commitQueue.mjs';
import {отпустить} from '../src/adapters/publishLock.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {EN, ES, RU, СТАТЬЯ, запрос, наСервере, настройкиСервера, среда, убратьПесочницы} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

afterEach(() => {
  запомнитьПоказ(null);
  отпустить();
  убратьПесочницы();
});

const состав = (место) => запрос(releaseRoute, место, '/api/release', {path: RU});
const записать = (место) => запрос(publishRoute, место, '/api/publish/commit', {path: RU, подтверждено: true});
const показать = (место) => запрос(pushRoute, место, '/api/publish/plan', {path: RU});
const отправить = (место, sha) => запрос(pushRoute, место, '/api/publish/push', {path: RU, sha, подтверждено: true});
const очередь = (место) => прочитатьОчередь(место.editorDir, настройкиСервера()).записи;
const ссылки = (место) => место.git.raw(['for-each-ref', '--format=%(refname)', 'refs/editor/publish']);

/** Записанный, но не уехавший коммит статьи. Возвращает его полный SHA. */
async function ожидающийКоммит(место) {
  место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
  const {status, payload} = await записать(место);
  expect(status).toBe(200);

  return payload.sha;
}

/**
 * Дверь к git, которая во время ПОСЛЕДНЕГО асинхронного вопроса перед отправкой (счёт отставания)
 * делает на диске названную правку и считает вызовы `push`.
 */
function дверьСПравкой(место, правка) {
  const вызовы = [];
  let правлено = false;
  const git = {
    raw: async (аргументы) => {
      if (аргументы[0] === 'push') вызовы.push(аргументы);
      const ответ = await место.git.raw(аргументы);
      if (!правлено && аргументы.includes('rev-list') && аргументы.includes('--count')) {
        правлено = true;
        правка();
      }

      return ответ;
    },
  };

  return {git, вызовы, правлено: () => правлено};
}

describe('последний заслон — синхронно, вплотную к отправке', () => {
  const ПАПКА = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba';

  /** Правка во время последнего вопроса к git останавливает отправку и снимает запись со ссылкой. */
  async function правкаОстанавливает(место, sha, правка) {
    const дверь = дверьСПравкой(место, правка);

    const {status, payload} = await запрос(pushRoute, {...место, git: дверь.git}, '/api/publish/push', {
      path: RU, sha, подтверждено: true,
    });

    expect(дверь.правлено()).toBe(true);
    expect(status).toBe(409);
    expect(payload.код).toBe('статьяИзменилась');
    expect(дверь.вызовы).toEqual([]);
    expect(await наСервере(место)).toBe(место.основа);
    expect(очередь(место)).toEqual([]);
    expect((await ссылки(место)).trim()).toBe('');
    // Следующий ход честен: новый план по новому составу, а не досылка старого.
    expect((await состав(место)).status).toBe(200);
  }

  it('late.png появилась во время последнего вопроса к git — заслон видит её, push не зовётся', async () => {
    const место = await среда();
    const sha = await ожидающийКоммит(место);
    await показать(место);

    await правкаОстанавливает(место, sha, () => место.положить(`${ПАПКА}/late.png`, 'поздняя картинка'));
  });

  it('текст изменился во время последнего вопроса к git — заслон видит его, push не зовётся', async () => {
    const место = await среда();
    const sha = await ожидающийКоммит(место);
    await показать(место);

    await правкаОстанавливает(место, sha, () => место.положить(RU, `${СТАТЬЯ}Правка в последний миг.\n`));
  });

  it('картинка пропала во время последнего вопроса к git — заслон видит это, push не зовётся', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ, [`${ПАПКА}/cover.png`]: 'картинка'});
    const sha = await ожидающийКоммит(место);
    await показать(место);

    await правкаОстанавливает(место, sha, () => fs.rmSync(`${место.repo}/${ПАПКА}/cover.png`));
  });

  it('без правки тот же заход доезжает до сайта: заслон не ложный', async () => {
    const место = await среда();
    const sha = await ожидающийКоммит(место);
    await показать(место);
    const дверь = дверьСПравкой(место, () => undefined);

    const {payload} = await запрос(pushRoute, {...место, git: дверь.git}, '/api/publish/push', {
      path: RU, sha, подтверждено: true,
    });

    expect(payload.отправлено).toBe(true);
    expect(дверь.вызовы).toHaveLength(1);
    expect(await наСервере(место)).toBe(sha);
  });
});

describe('служебная ссылка принадлежит заходу до записи очереди', () => {
  it('чтение путей коммита упало — отказ, очередь пуста, ссылки нет, следующий ход чист', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
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
    // Следующий ход чист: состав, запись и отправка проходят как обычно.
    expect((await состав(место)).status).toBe(200);
    const {payload: запись} = await записать(место);
    await показать(место);
    expect((await отправить(место, запись.sha)).payload.отправлено).toBe(true);
  });

  it('закрепление легло, но git бросил — отказ, очередь пуста, ссылки нет', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    // Дверь к git: `update-ref` служебной ссылки выполняется по-настоящему, а ответ теряется.
    let легло = false;
    const сПотерей = {
      raw: async (аргументы) => {
        const ответ = await место.git.raw(аргументы);
        if (!легло && аргументы[0] === 'update-ref' && String(аргументы[1]).startsWith('refs/editor/publish/')) {
          легло = true;
          throw new Error('ответ потерян');
        }

        return ответ;
      },
    };

    const {status, payload} = await запрос(publishRoute, {...место, git: сПотерей}, '/api/publish/commit', {
      path: RU, подтверждено: true,
    });

    expect(легло).toBe(true);
    expect(status).toBe(409);
    expect(payload.код).toBe('коммитНеУдался');
    expect(очередь(место)).toEqual([]);
    expect((await ссылки(место)).trim()).toBe('');
  });

  it('ссылка-сирота без записи очереди снимается ближайшим разбором, ветки и индекс не тронуты', async () => {
    const место = await среда();
    const sha = await ожидающийКоммит(место);
    // Так выглядит старый мусор: ссылка есть, записи о ней нет.
    записатьОчередь(место.editorDir, настройкиСервера(), []);
    expect((await ссылки(место)).trim()).toContain(sha);
    const былаГолова = (await место.git.raw(['rev-parse', 'HEAD'])).trim();

    await состав(место);

    expect((await ссылки(место)).trim()).toBe('');
    expect((await место.git.raw(['rev-parse', 'HEAD'])).trim()).toBe(былаГолова);
    expect((await место.git.raw(['diff', '--cached', '--name-only'])).trim()).toBe('');
  });

  it('запись очереди не легла на диск — ссылка отпущена, коммит никому не принадлежит', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
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

describe('пустая очередь и снятая запись не выдаются за «уже на сайте»', () => {
  it('очередь пуста — показ говорит «отправлять нечего», а отправка «уже» лишь про коммит, доказанный в ветке', async () => {
    const место = await среда();

    const показ = await показать(место);
    const чужой = await отправить(место, 'e'.repeat(40));
    const доказанный = await отправить(место, место.основа);

    expect(показ.status).toBe(409);
    expect(показ.payload.код).toBe('нечегоОтправлять');
    expect(чужой.status).toBe(409);
    expect(доказанный.status).toBe(200);
    expect(доказанный.payload.уже).toBe(true);
  });

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
    // А чистый показ после этого честен: снимать нечего, уезжать нечему — и это не «уже на сайте».
    expect((await показать(место)).payload.код).toBe('нечегоОтправлять');
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
