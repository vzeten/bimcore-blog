// Имя каждого теста повторяет формулировку правила.
//
// Публикация открытой локали из любой рабочей ветки: в `origin/main` уходит только подтверждённый
// состав этой локали, а ветка, `HEAD`, индекс, рабочие файлы и местная `main` человека остаются
// такими, какими были. Сквозной ход — теми же ручками, что зовёт окно, на НАСТОЯЩЕМ git с
// настоящим удалённым репозиторием.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {simpleGit} from 'simple-git';

import {pushRoute} from '../src/adapters/pushRoute.mjs';
import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {запомнитьПоказ} from '../src/adapters/pushMemory.mjs';
import {прочитатьОчередь} from '../src/adapters/commitQueue.mjs';
import {срезОднойВерсии} from '../src/adapters/prepareStamp.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {
  RU, СТАТЬЯ, запрос, наСервере, настройкиСервера, снимокРепозитория, среда, убратьПесочницы, файлыКоммита,
} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

afterEach(() => {
  запомнитьПоказ(null);
  убратьПесочницы();
});

const ВЕТКА = 'feature/editor-proba';
const состав = (место) => запрос(releaseRoute, место, '/api/release', {path: RU});
const записать = (место, ещё = {}) => запрос(publishRoute, место, '/api/publish/commit', {path: RU, подтверждено: true, ...ещё});
/** Что окно запомнило после проверок: отпечаток показанного плана и снимок проверок. */
const показанное = async (место) => ({
  отпечаток: (await состав(место)).payload.отпечаток,
  отпечатокПодготовки: срезОднойВерсии(место.repo, RU, настройкиСервера()).отпечаток,
});
const показать = (место) => запрос(pushRoute, место, '/api/publish/plan', {path: RU});
const отправить = (место, sha) => запрос(pushRoute, место, '/api/publish/push', {path: RU, sha, подтверждено: true});
const очередь = (место) => прочитатьОчередь(место.editorDir, настройкиСервера()).записи;

/** Рабочая ветка человека с его незакоммиченной, закоммиченной и проиндексированной работой. */
async function рабочаяВетка() {
  const место = await среда(undefined, {ветка: ВЕТКА});
  // Свой коммит в ветке: работа над программой, которой на сайте быть не должно.
  место.положить('editor/src/новое.mjs', 'код редактора\n');
  await место.git.raw(['add', '--', 'editor/src/новое.mjs']);
  await место.git.raw(['commit', '-m', 'работа над редактором']);
  // Незакоммиченная правка чужой статьи и проиндексированный чужой файл.
  место.положить('docs/lessons/other/index.mdx', СТАТЬЯ);
  место.положить('ЧУЖОЕ.md', 'чужая работа\n');
  await место.git.raw(['add', '--', 'ЧУЖОЕ.md']);
  // И сама статья, ради которой всё затеяно.
  место.положить(RU, `${СТАТЬЯ}Новая строка из ветки.\n`);

  return место;
}

/** Весь ход человека: состав с проверками → запись → показ → отправка. Возвращает SHA коммита. */
async function опубликовать(место) {
  expect((await состав(место)).payload.можно).toBe(true);
  const {status, payload} = await записать(место);
  expect(status).toBe(200);
  await показать(место);
  const отправка = await отправить(место, payload.sha);
  expect(отправка.payload.отправлено).toBe(true);

  return payload.sha;
}

/** Кто-то другой толкнул в ветку сайта. Возвращает SHA чужого коммита. */
async function чужаяРаботаНаСервере(место) {
  const чужой = path.join(место.корень, 'чужой');
  await simpleGit(место.корень).raw(['clone', место.сервер, чужой]);
  const другой = simpleGit(чужой);
  await другой.addConfig('user.name', 'Другой');
  await другой.addConfig('user.email', 'drugoy@example.com');
  await другой.addConfig('commit.gpgsign', 'false');
  fs.writeFileSync(path.join(чужой, 'ЧУЖОЕ-НА-САЙТЕ.md'), 'чужое\n', 'utf8');
  await другой.raw(['add', '--', 'ЧУЖОЕ-НА-САЙТЕ.md']);
  await другой.raw(['commit', '-m', 'чужое']);
  await другой.raw(['push', 'origin', 'main']);

  return (await другой.raw(['rev-parse', 'HEAD'])).trim();
}

describe('публикация из рабочей ветки', () => {
  it('из ветки не main на сайт уезжает ровно состав открытой локали поверх свежего origin/main', async () => {
    const место = await рабочаяВетка();
    const было = await снимокРепозитория(место);

    const sha = await опубликовать(место);

    expect(await наСервере(место)).toBe(sha);
    expect(await файлыКоммита(место, sha)).toEqual([RU]);
    expect((await место.git.raw(['rev-parse', `${sha}^`])).trim()).toBe(место.основа);
    // Код редактора, чужая статья и проиндексированный файл на сайт не попали.
    const наСайте = await simpleGit(место.сервер).raw(['ls-tree', '-r', '--name-only', 'refs/heads/main']);
    expect(наСайте).not.toContain('editor/src/новое.mjs');
    expect(наСайте).not.toContain('docs/lessons/other/index.mdx');
    expect(наСайте).not.toContain('ЧУЖОЕ.md');
    // Ветка, HEAD, индекс, рабочие файлы и местная main человека — как были.
    expect(await снимокРепозитория(место)).toEqual(было);
    expect(было.ветка).toBe(ВЕТКА);
    expect(очередь(место)).toEqual([]);
  });

  it('origin/main сдвинулся между проверками и записью — записи нет: проверялся прежний сайт', async () => {
    const место = await рабочаяВетка();
    const показ = await показанное(место);
    const чужой = await чужаяРаботаНаСервере(место);
    const было = await снимокРепозитория(место);

    const {status, payload} = await записать(место, показ);

    expect(status).toBe(409);
    // Основа входит в отпечаток плана: согласие относилось к плану поверх прежнего сайта.
    expect(payload.код).toBe('статьяИзменилась');
    expect(await наСервере(место)).toBe(чужой);
    expect(очередь(место)).toEqual([]);
    expect(await снимокРепозитория(место)).toEqual(было);
  });

  it('origin/main сдвинулся после записи — отправки нет, чужой коммит цел, новый план строится поверх него', async () => {
    const место = await рабочаяВетка();
    await состав(место);
    const {payload: запись} = await записать(место);
    const чужой = await чужаяРаботаНаСервере(место);

    const показ = await показать(место);
    const отправка = await отправить(место, запись.sha);

    expect(показ.payload.код).toBe('основаУстарела');
    expect(отправка.payload.код).toBe('основаУстарела');
    expect(await наСервере(место)).toBe(чужой);
    expect(очередь(место)).toEqual([]);
    // Новый ход строит план уже поверх чужой работы и доезжает до сайта.
    const sha = await опубликовать(место);
    expect((await место.git.raw(['rev-parse', `${sha}^`])).trim()).toBe(чужой);
  });

  it('статья изменилась после проверок — записи нет и на сайт ничего не уезжает', async () => {
    const место = await рабочаяВетка();
    const показ = await показанное(место);
    место.положить(RU, `${СТАТЬЯ}Совсем другая строка.\n`);

    const {payload} = await записать(место, показ);

    expect(payload.код).toBe('статьяИзменилась');
    expect(await наСервере(место)).toBe(место.основа);
    expect(очередь(место)).toEqual([]);
  });
});

describe('обрыв и повтор', () => {
  it('обрыв до отправки: повтор везёт тот же коммит, второй записи нет', async () => {
    const место = await рабочаяВетка();
    await состав(место);
    const {payload: запись} = await записать(место);
    // Так выглядит выключенный компьютер между записью и отправкой: память сервера пуста.
    запомнитьПоказ(null);

    // Новое нажатие: состав говорит «есть неотправленное», окно досылает показом и отправкой.
    expect((await состав(место)).payload.код).toBe('естьНеотправленное');
    const показ = await показать(место);
    const отправка = await отправить(место, показ.payload.sha);

    expect(показ.payload.sha).toBe(запись.sha);
    expect(отправка.payload.отправлено).toBe(true);
    expect(await наСервере(место)).toBe(запись.sha);
    expect(очередь(место)).toEqual([]);
  });

  it('обрыв после фактической отправки: повтор говорит «уже на сайте» и второй раз не везёт', async () => {
    const место = await рабочаяВетка();
    await состав(место);
    const {payload: запись} = await записать(место);
    await показать(место);
    // Отправка дошла, а ответ потерялся: сервер сайта стоит на нашем коммите, очередь — как до отправки.
    await место.git.raw(['push', 'origin', `${запись.sha}:refs/heads/main`]);
    запомнитьПоказ(null);

    const показ = await показать(место);
    const отправка = await отправить(место, запись.sha);

    // Показ честен: досылать нечего. «Уже на сайте» — только про названный коммит, доказанный в ветке.
    expect(показ.payload.код).toBe('нечегоОтправлять');
    expect(отправка.status).toBe(200);
    expect(отправка.payload.уже).toBe(true);
    expect(отправка.payload.отправлено).toBe(false);
    expect(await наСервере(место)).toBe(запись.sha);
    expect(очередь(место)).toEqual([]);
  });

  it('перезапуск с ожидающим коммитом на другой ветке: досылается тот же коммит, ветка не спрашивается', async () => {
    const место = await рабочаяВетка();
    await состав(место);
    const {payload: запись} = await записать(место);
    запомнитьПоказ(null);
    // Человек после перезапуска ушёл ещё на одну ветку.
    await место.git.raw(['checkout', '-b', 'другая']);
    const было = await снимокРепозитория(место);

    const показ = await показать(место);
    const отправка = await отправить(место, показ.payload.sha);

    expect(отправка.payload.отправлено).toBe(true);
    expect(await наСервере(место)).toBe(запись.sha);
    expect(await снимокРепозитория(место)).toEqual(было);
  });

  it('сервер сайта не отвечает — ложного успеха нет, запись о коммите остаётся для повтора', async () => {
    const место = await рабочаяВетка();
    await состав(место);
    const {payload: запись} = await записать(место);
    await показать(место);
    // Сервер сайта пропал ровно на отправке.
    const живой = место.git;
    const безСети = {
      raw: async (аргументы) => {
        if (аргументы.includes('push')) throw new Error('сервер не отвечает');
        return живой.raw(аргументы);
      },
    };

    const {status, payload} = await запрос(pushRoute, {...место, git: безСети}, '/api/publish/push', {
      path: RU, sha: запись.sha, подтверждено: true,
    });

    expect(status).toBe(409);
    expect(payload.код).toBe('отправкаНеУдалась');
    expect(payload.отправлено).toBeUndefined();
    expect(await наСервере(место)).toBe(место.основа);
    expect(очередь(место).map((своя) => своя.sha)).toEqual([запись.sha]);
  });
});
