// Имя каждого теста повторяет формулировку правила.
// Что происходит после обрыва: запись и отправка состоят из шагов, и на любом из них может погаснуть
// компьютер. Разбор очереди против свежей основы сервера различает три исхода — коммит уже на
// сервере, сервер не изменился, сервер ушёл вперёд — и ни разу не смотрит ни на HEAD, ни на ветку.
// Проверяется на НАСТОЯЩЕМ git: восстановление целиком построено на вопросах к нему.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {simpleGit} from 'simple-git';

import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {запомнитьСборку} from '../src/adapters/buildMemory.mjs';
import {прочитатьОчередь, записатьОчередь} from '../src/adapters/commitQueue.mjs';
import {разобратьОчередь} from '../src/adapters/publishRepair.mjs';
import {взятьЗамок, замокВзят, отпустить} from '../src/adapters/publishLock.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {
  EN, ES, RU, СТАТЬЯ, запрос, наСервере, сборщик, снимокРепозитория, среда, убратьПесочницы, настройкиСервера,
} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

afterEach(() => {
  запомнитьСборку(null);
  отпустить();
  убратьПесочницы();
});

const собрать = (место) => запрос(releaseRoute, место, '/api/release/build', {path: RU}, {запуск: сборщик()});
const записать = (место) => запрос(publishRoute, место, '/api/publish/commit', {path: RU, подтверждено: true});
const очередь = (место) => прочитатьОчередь(место.editorDir, настройкиСервера());
/** Разбор очереди так, как его зовут ручки: под замком публикации. */
async function разобрать(место, основа = место.основа, git = место.git) {
  expect(взятьЗамок()).toBe(true);
  try {
    return await разобратьОчередь({git, repo: место.repo, editorDir: место.editorDir, settings: настройкиСервера(), основа});
  } finally {
    отпустить();
  }
}

/** Запись очереди о коммите с названным SHA и основой — как её оставила бы запись статьи. */
const запись = (sha, основа, состояние = 'сделан') => ({
  sha, пути: [RU], созданные: [], удалённые: [], основа, путь: RU, отпечаток: 'x', когда: new Date().toISOString(), состояние,
});

/** Кто-то другой толкнул в ветку сайта. Возвращает SHA чужого коммита. */
async function чужаяРаботаНаСервере(место) {
  const чужой = path.join(место.корень, 'чужой');
  await simpleGit(место.корень).raw(['clone', место.сервер, чужой]);
  const другой = simpleGit(чужой);
  await другой.addConfig('user.name', 'Другой');
  await другой.addConfig('user.email', 'drugoy@example.com');
  await другой.addConfig('commit.gpgsign', 'false');
  fs.writeFileSync(path.join(чужой, 'ЧУЖОЕ.md'), 'чужое\n', 'utf8');
  await другой.raw(['add', '--', 'ЧУЖОЕ.md']);
  await другой.raw(['commit', '-m', 'чужое']);
  await другой.raw(['push', 'origin', 'main']);

  return (await другой.raw(['rev-parse', 'HEAD'])).trim();
}

describe('замок публикации', () => {
  it('пока идёт запись, вторая не начинается', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    // Замок держит кто-то другой — ровно так это выглядит для второго запроса.
    expect(взятьЗамок()).toBe(true);

    const {status, payload} = await записать(место);

    expect(status).toBe(409);
    expect(payload.код).toBe('идётЗапись');
    expect(очередь(место).записи).toEqual([]);
  });

  it('после захода замок отпускается, даже когда заход кончился отказом', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);

    await записать(место);

    expect(замокВзят()).toBe(false);
  });
});

describe('пустая запись', () => {
  it('дерево совпало с сайтом — записи нет, а не пустой коммит', async () => {
    const место = await среда();
    await собрать(место);

    const {payload} = await записать(место);

    expect(payload.код).toBe('нечегоФиксировать');
    expect(очередь(место).записи).toEqual([]);
  });
});

describe('разбор очереди против свежей основы', () => {
  it('коммит уже на сервере — запись снимается и называется доехавшей', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    const {payload} = await записать(место);
    await место.git.raw(['push', 'origin', `${payload.sha}:refs/heads/main`]);

    const итог = await разобрать(место, await наСервере(место));

    expect(итог.доехавшие).toEqual([payload.sha]);
    expect(итог.ожидающие).toEqual([]);
    expect(очередь(место).записи).toEqual([]);
  });

  it('сервер не изменился — коммит ждёт повтора отправки, запись остаётся', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    const {payload} = await записать(место);

    const итог = await разобрать(место);

    expect(итог.ожидающие.map((своя) => своя.sha)).toEqual([payload.sha]);
    expect(очередь(место).записи).toHaveLength(1);
  });

  it('сервер ушёл вперёд — коммит устарел, запись снимается, нужен новый план', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    const {payload} = await записать(место);
    const чужой = await чужаяРаботаНаСервере(место);
    // Закрепление основы читает ветку с сервера — вместе с самим чужим коммитом.
    await место.git.raw(['fetch', '--no-tags', 'origin', 'main']);

    const итог = await разобрать(место, чужой);

    expect(итог.устаревшие).toEqual([payload.sha]);
    expect(итог.ожидающие).toEqual([]);
    expect(очередь(место).записи).toEqual([]);
    // Чужой коммит на сервере цел: разбор ничего не отправляет и не перезаписывает.
    expect(await наСервере(место)).toBe(чужой);
  });

  it('намерение без подтверждения снимается: коммит не признан своим до конца', async () => {
    const место = await среда();
    записатьОчередь(место.editorDir, настройкиСервера(), [запись('a'.repeat(40), место.основа, 'намерение')]);

    const итог = await разобрать(место);

    expect(итог.недоказанные).toEqual(['a'.repeat(40)]);
    expect(итог.устаревшие).toEqual([]);
    expect(очередь(место).записи).toEqual([]);
  });

  it('оставленное намерение не мешает следующей записи', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    записатьОчередь(место.editorDir, настройкиСервера(), [запись('b'.repeat(40), место.основа, 'намерение')]);
    await собрать(место);

    expect((await записать(место)).status).toBe(200);
  });

  it('git не смог ответить, где коммит, — отказ, и очередь не трогается вовсе', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    await записать(место);
    const было = очередь(место).записи;

    // Дверь к git, которая отвечает на всё, кроме вопроса о положении коммита.
    const немой = {
      raw: async (аргументы) => {
        if (аргументы.includes('merge-base')) throw new Error('git молчит');
        return место.git.raw(аргументы);
      },
    };

    const итог = await разобрать(место, место.основа, немой);

    expect(итог.ошибка).toBe('состояниеНеизвестно');
    expect(очередь(место).записи).toEqual(было);
  });

  it('разбор не зависит от ветки и HEAD: на другой ветке ожидающий коммит по-прежнему ждёт', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    await собрать(место);
    const {payload} = await записать(место);
    await место.git.raw(['checkout', '-b', 'другая']);
    const было = await снимокРепозитория(место);

    const итог = await разобрать(место);

    expect(итог.ожидающие.map((своя) => своя.sha)).toEqual([payload.sha]);
    // Ни файла в чужом дереве, ни потерянной записи: программа не тронула ничего и ничего не забыла.
    expect(await снимокРепозитория(место)).toEqual(было);
    expect(fs.existsSync(path.join(место.repo, ES))).toBe(false);
  });

  it('местной ветки main нет вовсе — разбор идёт по серверу, а не по местной копии', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    const {payload} = await записать(место);
    await место.git.raw(['checkout', '--detach', 'HEAD']);
    await место.git.raw(['branch', '-D', 'main']);

    const итог = await разобрать(место);

    expect(итог.ошибка).toBeUndefined();
    expect(итог.ожидающие.map((своя) => своя.sha)).toEqual([payload.sha]);
  });
});

// Настоящий обрыв — это не исключение в коде, а выключенный компьютер: `finally` при нём не
// выполняется вовсе. Значит нельзя полагаться на уборку за собой — надо не пачкать.
describe('настоящий обрыв процесса', () => {
  it('индекс человека не трогается ни на миг: план складывается в свой', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    const было = await снимокРепозитория(место);

    await записать(место);

    expect(было.индекс).toBe('');
    expect(await снимокРепозитория(место)).toEqual(было);
  });

  it('свой индекс не остаётся мусором на диске', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);

    await записать(место);

    expect(fs.existsSync(path.join(место.editorDir, '.publish', 'индекс'))).toBe(false);
    expect(fs.existsSync(path.join(место.editorDir, '.publish', 'укладка'))).toBe(false);
  });
});

describe('диск человека сайту не принадлежит', () => {
  it('на месте соседнего языка лежит папка — публикации это не мешает: диск не трогается', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    fs.mkdirSync(path.join(место.repo, ES), {recursive: true});
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);

    const {status, payload} = await записать(место);

    expect(status).toBe(200);
    expect(payload.невосстановленные).toBeUndefined();
    expect(fs.statSync(path.join(место.repo, ES)).isDirectory()).toBe(true);
    expect(await место.git.raw(['show', `${payload.sha}:${ES}`])).toContain('---');
  });
});
