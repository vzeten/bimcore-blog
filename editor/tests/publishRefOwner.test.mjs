// Имя каждого теста повторяет формулировку правила.
//
// Хранилище git одно на все рабочие копии, а очередь публикации у каждой рабочей папки программы
// своя. Служебные ссылки на ожидающие коммиты поэтому живут в пространстве владельца —
// `refs/editor/publish/<id рабочей папки>/<sha>`, — и разбор одной копии не видит и не снимает
// ссылки другой. Проверяется на двух НАСТОЯЩИХ рабочих копиях одного хранилища.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {simpleGit} from 'simple-git';

import {pushRoute} from '../src/adapters/pushRoute.mjs';
import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {запомнитьПоказ} from '../src/adapters/pushMemory.mjs';
import {прочитатьОчередь} from '../src/adapters/commitQueue.mjs';
import {владелецСсылок} from '../src/adapters/gitCommit.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {RU, СТАТЬЯ, запрос, наСервере, настройкиСервера, среда, убратьПесочницы} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

afterEach(() => {
  запомнитьПоказ(null);
  убратьПесочницы();
});

const состав = (место) => запрос(releaseRoute, место, '/api/release', {path: RU});
const записать = (место) => запрос(publishRoute, место, '/api/publish/commit', {path: RU, подтверждено: true});
const показать = (место) => запрос(pushRoute, место, '/api/publish/plan', {path: RU});
const отправить = (место, sha) => запрос(pushRoute, место, '/api/publish/push', {path: RU, sha, подтверждено: true});
const очередь = (место) => прочитатьОчередь(место.editorDir, настройкиСервера()).записи;
const своиСсылки = (место) => место.git.raw([
  'for-each-ref', '--format=%(objectname)', `refs/editor/publish/${владелецСсылок(место.editorDir)}`,
]);

/**
 * Вторая рабочая копия того же хранилища: своя папка, своя папка программы, своя очередь.
 * Заводится как рабочее дерево git от той же основы — объекты и ссылки общие с первой.
 */
async function втораяКопия(место) {
  const repo = path.join(место.корень, 'работаB');
  const editorDir = path.join(место.корень, 'редакторB');
  fs.mkdirSync(editorDir, {recursive: true});
  await место.git.raw(['worktree', 'add', '--detach', repo, место.основа]);

  return {...место, repo, editorDir, git: simpleGit(repo)};
}

describe('служебные ссылки принадлежат рабочей папке', () => {
  it('разбор второй копии с пустой очередью не снимает ссылку первой: коммит переживает gc и досылается', async () => {
    const A = await среда();
    const B = await втораяКопия(A);
    A.положить(RU, `${СТАТЬЯ}Новая строка из A.\n`);
    const {status, payload} = await записать(A);
    expect(status).toBe(200);
    expect((await своиСсылки(A)).trim()).toBe(payload.sha);
    expect(очередь(B)).toEqual([]);

    // Обычный ход второй копии: состав с пустой очередью — то есть разбор и уборка сирот.
    const составB = await состав(B);
    await A.git.raw(['gc', '--prune=now', '--quiet']);

    expect(составB.status).toBe(200);
    expect((await своиСсылки(A)).trim()).toBe(payload.sha);
    expect((await своиСсылки(B)).trim()).toBe('');
    expect((await A.git.raw(['rev-parse', '--quiet', '--verify', `${payload.sha}^{commit}`])).trim()).toBe(payload.sha);
    // Первая копия досылает тот же коммит.
    await показать(A);
    const отправка = await отправить(A, payload.sha);
    expect(отправка.payload.отправлено).toBe(true);
    expect(await наСервере(A)).toBe(payload.sha);
    expect((await своиСсылки(A)).trim()).toBe('');
  });

  it('id владельца выводится из настоящего пути папки детерминированно и годен для имени ссылки', async () => {
    const место = await среда();
    const прямой = владелецСсылок(место.editorDir);
    const кривой = владелецСсылок(path.join(место.editorDir, '..', path.basename(место.editorDir)));

    expect(прямой).toMatch(/^[0-9a-f]{40}$/);
    expect(кривой).toBe(прямой);
    expect(владелецСсылок(path.join(место.корень, 'редакторB'))).not.toBe(прямой);
  });

  it('уборка сирот снимает только свою ссылку: чужая остаётся, ветки и индекс не тронуты', async () => {
    const A = await среда();
    const B = await втораяКопия(A);
    A.положить(RU, `${СТАТЬЯ}Новая строка из A.\n`);
    const {payload} = await записать(A);
    // У второй копии — своя ссылка-сирота без записи очереди.
    await B.git.raw(['update-ref', `refs/editor/publish/${владелецСсылок(B.editorDir)}/${payload.sha}`, payload.sha]);
    const былаГолова = (await B.git.raw(['rev-parse', 'HEAD'])).trim();

    await состав(B);

    expect((await своиСсылки(B)).trim()).toBe('');
    expect((await своиСсылки(A)).trim()).toBe(payload.sha);
    expect((await B.git.raw(['rev-parse', 'HEAD'])).trim()).toBe(былаГолова);
    expect((await B.git.raw(['diff', '--cached', '--name-only'])).trim()).toBe('');
  });
});
