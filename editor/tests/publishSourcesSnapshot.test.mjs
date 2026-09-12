// Имя каждого теста повторяет формулировку правила.
//
// Запись очереди хранит отпечаток тех местных источников, которым соответствует утверждённый план
// и созданное дерево, — снятый ДО построения плана, а не новый снимок после асинхронных вызовов
// git. Файл, появившийся во время закрепления служебной ссылки, в дерево не попал — и заслон перед
// отправкой обязан это увидеть. Проверяется на НАСТОЯЩЕМ git.
import {afterEach, describe, expect, it, vi} from 'vitest';

import {pushRoute} from '../src/adapters/pushRoute.mjs';
import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {запомнитьСборку} from '../src/adapters/buildMemory.mjs';
import {запомнитьПоказ} from '../src/adapters/pushMemory.mjs';
import {прочитатьОчередь} from '../src/adapters/commitQueue.mjs';
import {отпечатокИсточников} from '../src/adapters/releaseFacts.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {RU, СТАТЬЯ, запрос, наСервере, настройкиСервера, сборщик, среда, убратьПесочницы} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

afterEach(() => {
  запомнитьСборку(null);
  запомнитьПоказ(null);
  убратьПесочницы();
});

const ПАПКА = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba';
const состав = (место) => запрос(releaseRoute, место, '/api/release', {path: RU});
const собрать = (место) => запрос(releaseRoute, место, '/api/release/build', {path: RU}, {запуск: сборщик()});
const показать = (место) => запрос(pushRoute, место, '/api/publish/plan', {path: RU});
const очередь = (место) => прочитатьОчередь(место.editorDir, настройкиСервера()).записи;
const ссылки = (место) => место.git.raw(['for-each-ref', '--format=%(refname)', 'refs/editor/publish']);

/** Дверь к git, которая считает вызовы `push` и ровно во время названного вызова делает правку. */
function дверь(место, {когда = () => false, правка = () => undefined} = {}) {
  const вызовы = [];
  let сделано = false;
  const git = {
    raw: async (аргументы) => {
      if (аргументы[0] === 'push') вызовы.push(аргументы);
      if (!сделано && когда(аргументы)) {
        сделано = true;
        правка();
      }

      return место.git.raw(аргументы);
    },
  };

  return {git, вызовы, сделано: () => сделано};
}

const закрепление = (аргументы) => аргументы[0] === 'update-ref' && String(аргументы[1]).startsWith('refs/editor/publish/');

describe('отпечаток источников в записи — тот, что соответствует созданному дереву', () => {
  it('late.png появилась во время update-ref служебной ссылки — отправки нет, push=0, очередь и ссылка прибраны', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    const запись = дверь(место, {когда: закрепление, правка: () => место.положить(`${ПАПКА}/late.png`, 'поздняя картинка')});

    const создание = await запрос(publishRoute, {...место, git: запись.git}, '/api/publish/commit', {path: RU, подтверждено: true});

    expect(запись.сделано()).toBe(true);
    expect(создание.status).toBe(200);
    // Коммит картинки не содержит, а запись очереди хранит отпечаток источников ПЛАНА, не диска.
    expect(await место.git.raw(['show', '--name-only', '--format=', создание.payload.sha])).not.toContain('late.png');
    expect(очередь(место)[0].источники).not.toBe(отпечатокИсточников(место.repo, RU, настройкиСервера()));

    // Отправка сразу после записи (показ окна ещё не спрашивал): заслон видит late.png.
    const отправка = дверь(место);
    const итог = await запрос(pushRoute, {...место, git: отправка.git}, '/api/publish/push', {
      path: RU, sha: создание.payload.sha, подтверждено: true,
    });

    expect(итог.status).toBe(409);
    expect(итог.payload.код).toBe('статьяИзменилась');
    expect(отправка.вызовы).toEqual([]);
    expect(await наСервере(место)).toBe(место.основа);
    expect(очередь(место)).toEqual([]);
    expect((await ссылки(место)).trim()).toBe('');
    // Новый план доступен и берёт картинку с собой.
    const снова = await состав(место);
    expect(снова.status).toBe(200);
    expect(снова.payload.файлы.map((файл) => файл.путь)).toContain(`${ПАПКА}/late.png`);
  });

  it('late.png во время update-ref, затем показ окна — показ честно снимает запись, отправка не проходит', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.
`);
    await собрать(место);
    const запись = дверь(место, {когда: закрепление, правка: () => место.положить(`${ПАПКА}/late.png`, 'поздняя картинка')});
    const создание = await запрос(publishRoute, {...место, git: запись.git}, '/api/publish/commit', {path: RU, подтверждено: true});
    expect(создание.status).toBe(200);

    const показ = await показать(место);
    const отправка = дверь(место);
    const итог = await запрос(pushRoute, {...место, git: отправка.git}, '/api/publish/push', {
      path: RU, sha: создание.payload.sha, подтверждено: true,
    });

    expect(показ.status).toBe(409);
    expect(показ.payload.код).toBe('статьяИзменилась');
    expect(итог.status).toBe(409);
    expect(итог.payload.код).toBe('показУстарел');
    expect(отправка.вызовы).toEqual([]);
    expect(await наСервере(место)).toBe(место.основа);
    expect(очередь(место)).toEqual([]);
    expect((await ссылки(место)).trim()).toBe('');
  });

  it('файл появился во время построения плана — записи нет: коммит описывал бы не сегодняшний диск', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    // Правка во время вопроса к сайту внутри построения плана (перечень файлов каталога на основе).
    const запись = дверь(место, {
      когда: (аргументы) => аргументы.includes('ls-tree') && аргументы.includes('-r'),
      правка: () => место.положить(`${ПАПКА}/late.png`, 'поздняя картинка'),
    });

    const создание = await запрос(publishRoute, {...место, git: запись.git}, '/api/publish/commit', {path: RU, подтверждено: true});

    expect(запись.сделано()).toBe(true);
    expect(создание.status).toBe(409);
    expect(создание.payload.код).toBe('статьяИзменилась');
    expect(очередь(место)).toEqual([]);
    expect((await ссылки(место)).trim()).toBe('');
  });

  it('без правок тот же ход доезжает до сайта: заслон не ложный', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    const запись = дверь(место);
    const создание = await запрос(publishRoute, {...место, git: запись.git}, '/api/publish/commit', {path: RU, подтверждено: true});
    expect(создание.status).toBe(200);
    expect(очередь(место)[0].источники).toBe(отпечатокИсточников(место.repo, RU, настройкиСервера()));
    await показать(место);
    const отправка = дверь(место);

    const итог = await запрос(pushRoute, {...место, git: отправка.git}, '/api/publish/push', {
      path: RU, sha: создание.payload.sha, подтверждено: true,
    });

    expect(итог.payload.отправлено).toBe(true);
    expect(отправка.вызовы).toHaveLength(1);
    expect(await наСервере(место)).toBe(создание.payload.sha);
  });
});
