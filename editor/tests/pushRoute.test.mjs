// Имя каждого теста повторяет формулировку правила.
// Ручка отправки проверяется на НАСТОЯЩЕМ git: местный репозиторий и отдельный «сервер сайта»
// (голый репозиторий рядом). Подставной git тут ничего не доказал бы — проверяется именно то,
// что уезжает на сервер и чего на нём после отказа не появилось.
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

import {pushRoute} from '../src/adapters/pushRoute.mjs';
import {запомнитьКоммит, запомнитьПоказ} from '../src/adapters/pushMemory.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
const EN = 'docs/lessons/proba/index.mdx';
const СТАТЬЯ = '---\ntitle: "Проба"\nslug: /lessons/proba\n---\n\nТекст статьи.\n';

const песочницы = [];

/**
 * Местный репозиторий с одной статьёй в двух версиях и «сервер сайта» рядом. Статья лежит на диске,
 * но ещё не зафиксирована: её коммит делает сам тест — так же, как это делает ручка коммита.
 */
async function среда() {
  const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-push-'));
  песочницы.push(корень);
  const repo = path.join(корень, 'работа');
  const сервер = path.join(корень, 'сайт.git');

  await simpleGit(корень).raw(['init', '--bare', '--initial-branch=main', сервер]);
  fs.mkdirSync(repo, {recursive: true});
  const git = simpleGit(repo);
  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Проверка');
  await git.addConfig('user.email', 'proverka@example.com');
  await git.addConfig('commit.gpgsign', 'false');
  await git.raw(['remote', 'add', 'origin', сервер]);

  fs.writeFileSync(path.join(repo, 'README.md'), 'начало\n', 'utf8');
  await git.raw(['add', '--', 'README.md']);
  await git.raw(['commit', '-m', 'начало']);
  await git.raw(['push', 'origin', 'main']);

  for (const rel of [RU, EN]) {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), СТАТЬЯ, 'utf8');
  }

  return {repo, сервер, git};
}

/** Зафиксировать статью так же, как это делает ручка коммита, и запомнить коммит своим. */
async function зафиксироватьСтатью({repo, git}, пути = [RU, EN]) {
  for (const rel of пути) await git.raw(['add', '--', rel]);
  await git.raw(['commit', '-m', 'статья: проба']);
  const sha = (await git.raw(['rev-parse', 'HEAD'])).trim();
  запомнитьКоммит(sha);

  return sha;
}

/** Что сейчас лежит на «сервере сайта». Ветки там может не быть вовсе. */
async function наСервере(сервер) {
  try {
    return (await simpleGit(сервер).raw(['rev-parse', 'refs/heads/main'])).trim();
  } catch {
    return null;
  }
}

afterEach(() => {
  запомнитьКоммит(null);
  запомнитьПоказ(null);
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

beforeEach(() => {
  запомнитьКоммит(null);
  запомнитьПоказ(null);
});

/** Один запрос к ручке. */
async function запрос({repo, git}, pathname, тело) {
  const ответы = [];
  const взято = await pushRoute({
    req: {method: 'POST'},
    res: {},
    url: {pathname},
    repo,
    settings: {...НАСТРОЙКИ, отправка: {...НАСТРОЙКИ['отправка'], удалённый: 'origin'}},
    git,
    тело: async () => тело,
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, status, payload) => ответы.push({status, payload}),
  });

  return {взято, ...(ответы[0] ?? {})};
}

const показ = (с, тело = {path: RU}) => запрос(с, '/api/publish/plan', тело);
const отправка = (с, тело) => запрос(с, '/api/publish/push', тело);

describe('ручка показа: что уедет на сайт', () => {
  it('показывает уезжающие коммиты и их файлы, ничего не отправляя', async () => {
    const с = await среда();
    const sha = await зафиксироватьСтатью(с);
    const былоНаСервере = await наСервере(с.сервер);

    const {status, payload} = await показ(с);

    expect(status).toBe(200);
    expect(payload.sha).toBe(sha);
    expect(payload.коммиты.map((к) => к.sha)).toEqual([sha]);
    expect(payload.файлы.sort()).toEqual([EN, RU]);
    // Сервер сайта не тронут: показ ничего не отправляет.
    expect(await наСервере(с.сервер)).toBe(былоНаСервере);
  }, ЖДАТЬ_GIT);

  it('вместе со статьёй уехал бы файл чужой статьи — показ отказывает и называет файл', async () => {
    const с = await среда();
    const чужая = 'docs/lessons/чужая/index.mdx';
    fs.mkdirSync(path.join(с.repo, path.dirname(чужая)), {recursive: true});
    fs.writeFileSync(path.join(с.repo, чужая), СТАТЬЯ, 'utf8');
    await зафиксироватьСтатью(с, [RU, EN, чужая]);

    const {status, payload} = await показ(с);

    expect(status).toBe(409);
    expect(payload.код).toBe('чужиеФайлы');
    expect(payload.чужие).toEqual([чужая]);
  }, ЖДАТЬ_GIT);

  it('на сервере есть изменения, которых нет здесь, — отправки нет', async () => {
    const с = await среда();
    await зафиксироватьСтатью(с);
    // Кто-то толкнул на сайт со стороны: делаем это отдельным клоном того же сервера.
    const чужой = path.join(path.dirname(с.repo), 'другой');
    await simpleGit(path.dirname(с.repo)).raw(['clone', с.сервер, чужой]);
    const чужойGit = simpleGit(чужой);
    await чужойGit.addConfig('user.name', 'Другой');
    await чужойGit.addConfig('user.email', 'drugoi@example.com');
    fs.writeFileSync(path.join(чужой, 'чужое.md'), 'со стороны\n', 'utf8');
    await чужойGit.raw(['add', '--', 'чужое.md']);
    await чужойGit.raw(['commit', '-m', 'со стороны']);
    await чужойGit.raw(['push', 'origin', 'main']);

    const {status, payload} = await показ(с);

    expect(status).toBe(409);
    expect(payload.код).toBe('ветвиРазошлись');
  }, ЖДАТЬ_GIT);
});

describe('ручка отправки на сайт', () => {
  it('после показа и согласия коммит появляется на сервере сайта', async () => {
    const с = await среда();
    const sha = await зафиксироватьСтатью(с);
    await показ(с);

    const {status, payload} = await отправка(с, {path: RU, sha, подтверждено: true});

    expect(status).toBe(200);
    expect(payload.отправлено).toBe(true);
    expect(await наСервере(с.сервер)).toBe(sha);
  }, ЖДАТЬ_GIT);

  it('без показа отправки не бывает: согласие относилось бы неизвестно к чему', async () => {
    const с = await среда();
    const sha = await зафиксироватьСтатью(с);
    const было = await наСервере(с.сервер);

    const {status, payload} = await отправка(с, {path: RU, sha, подтверждено: true});

    expect(status).toBe(409);
    expect(payload.код).toBe('показаНеБыло');
    expect(await наСервере(с.сервер)).toBe(было);
  }, ЖДАТЬ_GIT);

  it('без подтверждения человека отправки не бывает', async () => {
    const с = await среда();
    const sha = await зафиксироватьСтатью(с);
    await показ(с);
    const было = await наСервере(с.сервер);

    const {status} = await отправка(с, {path: RU, sha});

    expect(status).toBe(400);
    expect(await наСервере(с.сервер)).toBe(было);
  }, ЖДАТЬ_GIT);

  it('коммит сделан не программой — отправки нет', async () => {
    const с = await среда();
    const sha = await зафиксироватьСтатью(с);
    await показ(с);
    // Сервер редактора перезапустили: память о своём коммите пропала.
    запомнитьКоммит(null);
    const было = await наСервере(с.сервер);

    const {status, payload} = await отправка(с, {path: RU, sha, подтверждено: true});

    expect(status).toBe(409);
    expect(payload.код).toBe('неНашКоммит');
    expect(await наСервере(с.сервер)).toBe(было);
  }, ЖДАТЬ_GIT);

  it('после показа набор уезжающего изменился — отправки нет, согласие спрашивается заново', async () => {
    const с = await среда();
    const sha = await зафиксироватьСтатью(с);
    await показ(с);
    // Набор мог измениться и без нового коммита здесь: например, ветку на сервере откатили назад,
    // и впереди неё оказалось больше коммитов, чем человеку показывали.
    запомнитьПоказ({sha, набор: 'то, что показывали раньше'});
    const было = await наСервере(с.сервер);

    const {status, payload} = await отправка(с, {path: RU, sha, подтверждено: true});

    expect(status).toBe(409);
    expect(payload.код).toBe('показУстарел');
    expect(await наСервере(с.сервер)).toBe(было);
  }, ЖДАТЬ_GIT);

  it('после показа появился новый коммит — согласие относится к прежнему, отправки нет', async () => {
    const с = await среда();
    const sha = await зафиксироватьСтатью(с);
    await показ(с);

    fs.writeFileSync(path.join(с.repo, 'ещё.md'), 'после показа\n', 'utf8');
    await с.git.raw(['add', '--', 'ещё.md']);
    await с.git.raw(['commit', '-m', 'после показа']);
    // Так это выглядит из программы: новый коммит стирает прежний показ, потому что человеку
    // показывали другое.
    запомнитьКоммит((await с.git.raw(['rev-parse', 'HEAD'])).trim());
    const было = await наСервере(с.сервер);

    // Согласие человека называет тот коммит, который ему показывали, — а в репозитории уже другой.
    const {status, payload} = await отправка(с, {path: RU, sha, подтверждено: true});

    expect(status).toBe(409);
    expect(payload.код).toBe('головаСместилась');
    expect(await наСервере(с.сервер)).toBe(было);
  }, ЖДАТЬ_GIT);

  it('повтор после успешной отправки говорит «уже на сайте» и второй раз не везёт', async () => {
    const с = await среда();
    const sha = await зафиксироватьСтатью(с);
    await показ(с);
    await отправка(с, {path: RU, sha, подтверждено: true});

    await показ(с);
    const {status, payload} = await отправка(с, {path: RU, sha, подтверждено: true});

    expect(status).toBe(200);
    expect(payload.уже).toBe(true);
    expect(payload.отправлено).toBe(false);
    expect(await наСервере(с.сервер)).toBe(sha);
  }, ЖДАТЬ_GIT);

  it('впереди лежит работа над самой программой — публикация статьи её не увозит', async () => {
    const с = await среда();
    fs.mkdirSync(path.join(с.repo, 'editor'), {recursive: true});
    fs.writeFileSync(path.join(с.repo, 'editor/SPEC.md'), 'правила\n', 'utf8');
    await с.git.raw(['add', '--', 'editor/SPEC.md']);
    await с.git.raw(['commit', '-m', 'editor: правила']);
    const sha = await зафиксироватьСтатью(с);
    const было = await наСервере(с.сервер);

    const {status, payload} = await показ(с);

    expect(status).toBe(409);
    expect(payload.код).toBe('чужиеФайлы');
    expect(payload.чужие).toEqual(['editor/SPEC.md']);

    const отказ = await отправка(с, {path: RU, sha, подтверждено: true});
    expect(отказ.status).toBe(409);
    expect(await наСервере(с.сервер)).toBe(было);
  }, ЖДАТЬ_GIT);

  it('путь не статьи отправку не запускает вовсе', async () => {
    const с = await среда();
    await зафиксироватьСтатью(с);

    const {status} = await показ(с, {path: 'README.md'});

    expect(status).toBe(400);
  }, ЖДАТЬ_GIT);
});
