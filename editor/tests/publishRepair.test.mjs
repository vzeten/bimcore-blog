// Имя каждого теста повторяет формулировку правила.
// Что происходит после обрыва: запись состоит из нескольких шагов, и на любом из них может погаснуть
// компьютер. Проверяется на НАСТОЯЩЕМ git: восстановление целиком построено на вопросах к нему.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {запомнитьСборку} from '../src/adapters/buildMemory.mjs';
import {прочитатьОчередь, записатьОчередь} from '../src/adapters/commitQueue.mjs';
import {времянкаВосстановления, довестиНезаконченное, положитьЕслиНет} from '../src/adapters/publishRepair.mjs';
import {взятьЗамок, замокВзят, отпустить} from '../src/adapters/publishLock.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {EN, ES, RU, СТАТЬЯ, запрос, сборщик, среда, убратьПесочницы, настройкиСервера} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

afterEach(() => {
  запомнитьСборку(null);
  отпустить();
  убратьПесочницы();
});

const собрать = (место) => запрос(releaseRoute, место, '/api/release/build', {path: RU}, {запуск: сборщик()});
const записать = (место) => запрос(publishRoute, место, '/api/publish/commit', {path: RU, подтверждено: true});
const очередь = (место) => прочитатьОчередь(место.editorDir, настройкиСервера());

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
    expect((await место.git.raw(['rev-parse', 'HEAD'])).trim()).toBe(место.основа);
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
    expect((await место.git.raw(['rev-parse', 'HEAD'])).trim()).toBe(место.основа);
    expect((await место.git.raw(['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only'])).trim()).toBe('');
  });
});

describe('обрыв между коммитом и сдвигом ветки', () => {
  it('намерение без коммита в истории снимается: коммит не состоялся', async () => {
    const место = await среда();
    записатьОчередь(место.editorDir, настройкиСервера(), [{
      sha: 'a'.repeat(40),
      пути: [RU],
      созданные: [],
      удалённые: [],
      основа: место.основа,
      когда: new Date().toISOString(),
      состояние: 'намерение',
    }]);

    await довестиНезаконченное({git: место.git, repo: место.repo, editorDir: место.editorDir, settings: настройкиСервера()});

    expect(очередь(место).записи).toEqual([]);
  });

  it('оставленное намерение не даёт следующей записи упереться в непустой индекс', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    записатьОчередь(место.editorDir, настройкиСервера(), [{
      sha: 'b'.repeat(40),
      пути: [RU],
      созданные: [],
      удалённые: [],
      основа: место.основа,
      когда: new Date().toISOString(),
      состояние: 'намерение',
    }]);
    await собрать(место);

    expect((await записать(место)).status).toBe(200);
  });
});

describe('обрыв между сдвигом ветки и записью заглушки на диск', () => {
  it('созданная заглушка восстанавливается из самого коммита', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    await собрать(место);
    await записать(место);

    // Так выглядит обрыв: коммит есть, а файла на диске нет.
    fs.rmSync(path.join(место.repo, ES));
    expect((await место.git.raw(['status', '--porcelain', '--', ES])).trim()).not.toBe('');

    await довестиНезаконченное({git: место.git, repo: место.repo, editorDir: место.editorDir, settings: настройкиСервера()});

    expect(fs.existsSync(path.join(место.repo, ES))).toBe(true);
    // Восстановлено ровно опубликованное: дерево снова чистое.
    expect((await место.git.raw(['status', '--porcelain', '--', ES])).trim()).toBe('');
  });

  it('восстановление не трогает файл, который человек успел написать сам', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    await собрать(место);
    await записать(место);
    const своё = '---\ntitle: "Prueba"\n---\n\nМой текст.\n';
    fs.writeFileSync(path.join(место.repo, ES), своё, 'utf8');

    await довестиНезаконченное({git: место.git, repo: место.repo, editorDir: место.editorDir, settings: настройкиСервера()});

    expect(fs.readFileSync(path.join(место.repo, ES), 'utf8')).toBe(своё);
  });

  it('запись очереди не снимается, пока заглушка не восстановлена', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    await собрать(место);
    await записать(место);
    fs.rmSync(path.join(место.repo, ES));

    const итог = await довестиНезаконченное({
      git: место.git, repo: место.repo, editorDir: место.editorDir, settings: настройкиСервера(),
    });

    // Коммит ещё не уехал на сайт: запись о нём остаётся, и именно по ней файл и восстановили.
    expect(итог.записи).toHaveLength(1);
    expect(итог.записи[0].состояние).toBe('сделан');
  });
});

// Настоящий обрыв — это не исключение в коде, а выключенный компьютер: `finally` при нём не
// выполняется вовсе. Значит нельзя полагаться на уборку за собой — надо не пачкать.
describe('настоящий обрыв процесса', () => {
  it('индекс человека не трогается ни на миг: план складывается в свой', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);

    const доЗаписи = await место.git.raw(['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only']);
    await записать(место);
    const послеЗаписи = await место.git.raw(['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only']);

    expect(доЗаписи.trim()).toBe('');
    // После записи индекс снова чист: он идёт вровень с новой головой, а не отстаёт от неё.
    expect(послеЗаписи.trim()).toBe('');
    expect((await место.git.raw(['status', '--porcelain'])).trim()).toBe('');
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

describe('восстановление на другой ветке', () => {
  it('человек ушёл на другую ветку — её рабочее дерево не трогается ничем', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    await собрать(место);
    await записать(место);
    // Другая ветка заведена от основы: опубликованной заглушки на ней нет и быть не должно.
    await место.git.raw(['checkout', '-b', 'другая', место.основа]);
    const былоЛи = fs.existsSync(path.join(место.repo, ES));

    const итог = await довестиНезаконченное({
      git: место.git, repo: место.repo, editorDir: место.editorDir, settings: настройкиСервера(),
    });

    expect(итог.ошибка).toBe('неТаВетка');
    // Ни файла в чужом дереве, ни потерянной записи: программа не тронула ничего и ничего не забыла.
    expect(fs.existsSync(path.join(место.repo, ES))).toBe(былоЛи);
    expect(очередь(место).записи).toHaveLength(1);
  });
});

describe('невосстановленная заглушка', () => {
  it('на месте заглушки оказалась папка — путь назван невосстановленным', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    await собрать(место);
    await записать(место);
    fs.rmSync(path.join(место.repo, ES));
    fs.mkdirSync(path.join(место.repo, ES));

    const итог = await довестиНезаконченное({
      git: место.git, repo: место.repo, editorDir: место.editorDir, settings: настройкиСервера(),
    });

    expect(итог.невосстановленные).toEqual([ES]);
    // Запись очереди при этом на месте: по ней и найдут, что дописать.
    expect(итог.записи).toHaveLength(1);
  });

  it('пока путь не восстановлен, публиковать эту статью нельзя', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    await собрать(место);
    await записать(место);
    fs.rmSync(path.join(место.repo, ES));
    fs.mkdirSync(path.join(место.repo, ES));

    const {status, payload} = await записать(место);

    expect(status).toBe(409);
    expect(payload.код).toBe('невосстановлено');
    expect(payload.чужие).toEqual([ES]);
  });
});

// Две границы, на которых неудача прежде выглядела успехом. Обе тихие, и обе стоят статьи на сайте.
/** Где программа пишет байты до их появления по настоящему адресу: вне содержимого сайта. */
const времянка = (место) => времянкаВосстановления(место.editorDir, настройкиСервера());

describe('неудача не выдаётся за успех', () => {
  it('между проверкой и записью на месте заглушки появилась папка — это не восстановление', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    fs.mkdirSync(path.join(место.repo, ES), {recursive: true});

    // Так выглядит гонка: путь занят, но занят не файлом.
    expect(положитьЕслиНет(место.repo, ES, Buffer.from('текст\n', 'utf8'), времянка(место))).toBe(false);
  });

  it('свободный путь записывается и признаётся восстановленным', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    fs.rmSync(path.join(место.repo, ES), {force: true});

    expect(положитьЕслиНет(место.repo, ES, Buffer.from('текст\n', 'utf8'), времянка(место))).toBe(true);
    expect(fs.readFileSync(path.join(место.repo, ES), 'utf8')).toBe('текст\n');
  });

  it('состояние ветки выпуска не прочиталось — отказ, а не разрешение продолжать', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    await записать(место);
    // Ветки выпуска не стало: спросить, где коммит, нечем.
    await место.git.raw(['checkout', '--detach', 'HEAD']);
    await место.git.raw(['branch', '-D', 'main']);

    const итог = await довестиНезаконченное({
      git: место.git, repo: место.repo, editorDir: место.editorDir, settings: настройкиСервера(),
    });

    expect(итог.ошибка).toBeTruthy();
    expect(очередь(место).записи).toHaveLength(1);
  });
});
