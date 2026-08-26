// Имя каждого теста повторяет формулировку правила.
// Ручки отправки на сайт проверяются на НАСТОЯЩЕМ git с настоящим удалённым репозиторием: отправка
// в рабочую ветку и есть публикация, и подставной git тут не доказал бы ничего.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {simpleGit} from 'simple-git';

import {pushRoute} from '../src/adapters/pushRoute.mjs';
import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {запомнитьСборку} from '../src/adapters/buildMemory.mjs';
import {запомнитьПоказ} from '../src/adapters/pushMemory.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {EN, ES, RU, СТАТЬЯ, запрос, сборщик, среда, убратьПесочницы} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

afterEach(() => {
  запомнитьСборку(null);
  запомнитьПоказ(null);
  убратьПесочницы();
});

const собрать = (место) => запрос(releaseRoute, место, '/api/release/build', {path: RU}, {запуск: сборщик()});
const записать = (место) => запрос(publishRoute, место, '/api/publish/commit', {path: RU, подтверждено: true});
const показать = (место, тело = {path: RU}) => запрос(pushRoute, место, '/api/publish/plan', тело);
const отправить = (место, тело) => запрос(pushRoute, место, '/api/publish/push', тело);

/** Пройти путь человека до готового к отправке коммита. Возвращает его полный SHA. */
async function довестиДоКоммита(место) {
  место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
  await собрать(место);

  return (await записать(место)).payload.sha;
}

/** SHA ветки на сервере сайта. */
const наСервере = async (место) => (await simpleGit(место.сервер).raw(['rev-parse', 'main'])).trim();

describe('показ того, что уедет на сайт', () => {
  it('показывает уезжающие коммиты и их файлы, ничего не отправляя', async () => {
    const место = await среда();
    const sha = await довестиДоКоммита(место);

    const {status, payload} = await показать(место);

    expect(status).toBe(200);
    expect(payload.sha).toBe(sha);
    expect(payload.коммиты).toHaveLength(1);
    expect(payload.файлы).toEqual([RU]);
    // Показ ничего не отправил: на сервере всё как было.
    expect(await наСервере(место)).toBe(место.основа);
  });

  it('коммит сделан не программой — показ отказывает и называет его', async () => {
    const место = await среда();
    место.положить('ЧУЖОЕ.md', 'работа руками\n');
    await место.git.raw(['add', '--', 'ЧУЖОЕ.md']);
    await место.git.raw(['commit', '-m', 'руками']);

    const {status, payload} = await показать(место);

    expect(status).toBe(409);
    expect(payload.код).toBe('неНашиКоммиты');
    expect(payload.неНаши).toHaveLength(1);
  });

  it('на сервере есть изменения, которых нет здесь, — отправки нет', async () => {
    const место = await среда();
    await довестиДоКоммита(место);

    const чужой = path.join(место.корень, 'чужой');
    await место.git.raw(['clone', место.сервер, чужой]);
    const другой = simpleGit(чужой);
    await другой.addConfig('user.name', 'Другой');
    await другой.addConfig('user.email', 'drugoy@example.com');
    await другой.addConfig('commit.gpgsign', 'false');
    fs.writeFileSync(path.join(чужой, 'ЧУЖОЕ.md'), 'чужое\n', 'utf8');
    await другой.raw(['add', '--', 'ЧУЖОЕ.md']);
    await другой.raw(['commit', '-m', 'чужое']);
    await другой.raw(['push', 'origin', 'main']);

    expect((await показать(место)).payload.код).toBe('ветвиРазошлись');
  });

  it('путь не статьи отправку не запускает вовсе', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ, 'static/img/logo.png': 'картинка'});

    expect((await показать(место, {path: 'static/img/logo.png'})).status).toBe(400);
  });
});

describe('отправка на сайт', () => {
  it('после показа и согласия коммит появляется на сервере сайта', async () => {
    const место = await среда();
    const sha = await довестиДоКоммита(место);
    await показать(место);

    const {status, payload} = await отправить(место, {path: RU, sha, подтверждено: true});

    expect(status).toBe(200);
    expect(payload.отправлено).toBe(true);
    expect(await наСервере(место)).toBe(sha);
  });

  it('вместе со статьёй уезжает заглушка языка, которого на сайте не было', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    await собрать(место);
    const sha = (await записать(место)).payload.sha;
    await показать(место);

    const {payload} = await отправить(место, {path: RU, sha, подтверждено: true});

    expect(payload.отправлено).toBe(true);
    expect(payload.файлы).toContain(ES);
  });

  it('без показа отправки не бывает: согласие относилось бы неизвестно к чему', async () => {
    const место = await среда();
    const sha = await довестиДоКоммита(место);

    const {payload} = await отправить(место, {path: RU, sha, подтверждено: true});

    expect(payload.код).toBe('показаНеБыло');
    expect(await наСервере(место)).toBe(место.основа);
  });

  it('без подтверждения человека отправки не бывает', async () => {
    const место = await среда();
    const sha = await довестиДоКоммита(место);
    await показать(место);

    expect((await отправить(место, {path: RU, sha})).status).toBe(400);
    expect(await наСервере(место)).toBe(место.основа);
  });

  it('согласие пришло на другой коммит, чем лежит сейчас, — отправки нет', async () => {
    const место = await среда();
    await довестиДоКоммита(место);
    await показать(место);

    const {payload} = await отправить(место, {path: RU, sha: 'f'.repeat(40), подтверждено: true});

    expect(payload.код).toBe('головаСместилась');
    expect(await наСервере(место)).toBe(место.основа);
  });

  it('повтор после успешной отправки говорит «уже на сайте» и второй раз не везёт', async () => {
    const место = await среда();
    const sha = await довестиДоКоммита(место);
    await показать(место);
    await отправить(место, {path: RU, sha, подтверждено: true});

    await показать(место);
    const {status, payload} = await отправить(место, {path: RU, sha, подтверждено: true});

    expect(status).toBe(200);
    expect(payload.уже).toBe(true);
    expect(payload.отправлено).toBe(false);
  });

  it('впереди лежит работа над самой программой — публикация статьи её не увозит', async () => {
    const место = await среда();
    const sha = await довестиДоКоммита(место);
    // Коммит нашей записи есть, а поверх него человек положил руками свою работу.
    место.положить('ЧУЖОЕ.md', 'работа над программой\n');
    await место.git.raw(['add', '--', 'ЧУЖОЕ.md']);
    await место.git.raw(['commit', '-m', 'руками']);

    const {payload} = await показать(место);

    expect(payload.код).toBe('неНашиКоммиты');
    expect(await наСервере(место)).toBe(место.основа);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('после удачной отправки запись о коммите из очереди снимается', async () => {
    const место = await среда();
    const sha = await довестиДоКоммита(место);
    await показать(место);
    await отправить(место, {path: RU, sha, подтверждено: true});

    const очередь = JSON.parse(fs.readFileSync(path.join(место.editorDir, '.publish', 'commits.json'), 'utf8'));

    expect(очередь.записи).toEqual([]);
  });

  it('запись о своём коммите испорчена — отправки нет: чей это коммит, доказать нечем', async () => {
    const место = await среда();
    await довестиДоКоммита(место);
    fs.writeFileSync(path.join(место.editorDir, '.publish', 'commits.json'), 'не json', 'utf8');

    const {payload} = await показать(место);

    expect(payload.код).toBe('очередьБитая');
    expect(await наСервере(место)).toBe(место.основа);
  });
});

// Правило владельца запрещает читать локальный соседний перевод на всём пути решения о публикации,
// а не только при сборке плана. Отправка прежде спрашивала состав по ВСЕМ версиям статьи — то есть
// открывала и разбирала соседние файлы человека.
describe('соседний перевод на пути отправки не читается', () => {
  it('ни один файл соседнего языка не открывается ни на показе, ни при отправке', async () => {
    const место = await среда();
    await довестиДоКоммита(место);
    const соседи = [path.join(место.repo, EN), path.join(место.repo, ES)];
    const прочитанные = [];
    const оригинал = fs.readFileSync;
    const читатель = vi.spyOn(fs, 'readFileSync').mockImplementation((файл, ...ещё) => {
      if (соседи.includes(String(файл))) прочитанные.push(String(файл));

      return оригинал(файл, ...ещё);
    });

    try {
      await показать(место);
      await отправить(место, {path: RU, sha: (await место.git.raw(['rev-parse', 'HEAD'])).trim(), подтверждено: true});
    } finally {
      читатель.mockRestore();
    }

    expect(прочитанные).toEqual([]);
  });

  it('состав отправки берётся по одной открытой версии: путь соседа в него не входит', async () => {
    const место = await среда();
    await довестиДоКоммита(место);
    // Чужой коммит трогает файл соседнего языка. Прежде он проходил бы по составу как «свой путь».
    место.положить(ES, `${СТАТЬЯ}Работа руками.\n`);
    await место.git.raw(['add', '--', ES]);
    await место.git.raw(['commit', '-m', 'руками']);

    const {status, payload} = await показать(место);

    expect(status).toBe(409);
    expect(payload.код).toBe('неНашиКоммиты');
  });
});

// Коммит, который убирает файл с сайта, отправляется наравне с обычным: пути в нём нет на диске ни
// до, ни после, и доказать его принадлежность статье может только запись программы о своей работе.
describe('отправка коммита, убирающего файл с сайта', () => {
  const ОБЛОЖКА = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/cover.png';

  it('убранный путь не считается чужим и уезжает на сайт', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ, [ОБЛОЖКА]: 'картинка'});
    fs.rmSync(path.join(место.repo, ОБЛОЖКА));
    await собрать(место);
    const sha = (await записать(место)).payload.sha;

    const показ = await показать(место);
    expect(показ.status).toBe(200);
    expect(показ.payload.файлы).toEqual([ОБЛОЖКА]);

    const {status} = await отправить(место, {path: RU, sha, подтверждено: true});

    expect(status).toBe(200);
    expect(await наСервере(место)).toBe(sha);
  });
});
