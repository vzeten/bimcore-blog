// Имя каждого теста повторяет формулировку правила.
//
// Сквозная проверка публикации: ход окна разговаривает с НАСТОЯЩИМИ ручками сервера, а те — с
// настоящим git во временном репозитории и настоящим «сервером сайта» рядом. Подставлены только
// две вещи, к делу не относящиеся: полная сборка сайта (иначе проверка шла бы минуты) и правила
// подготовки (у них свои проверки). Всё остальное — тот самый код, который работает в окне.
//
// Ради чего эта проверка заведена: согласие человека терялось между кнопкой «Да, опубликовать» и
// ручкой коммита, потому что окно не клало его в тело запроса. Машина этого не видела вовсе.
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

import {зафиксироватьИОтправить, проверитьИСобрать} from '../src/ui/publishRun';
import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {pushRoute} from '../src/adapters/pushRoute.mjs';
import {запомнитьКоммит, запомнитьПоказ} from '../src/adapters/pushMemory.mjs';
import {запомнитьСборку} from '../src/adapters/buildMemory.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
const EN = 'docs/lessons/proba/index.mdx';
const СТАТЬЯ = '---\ntitle: "Проба"\nslug: /lessons/proba\n---\n\nТекст статьи.\n';

const песочницы = [];

/** Местный репозиторий со статьёй на сайте и «сервер сайта» рядом. */
async function среда() {
  const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-run-'));
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

  for (const rel of [RU, EN]) {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), СТАТЬЯ, 'utf8');
  }
  await git.raw(['add', '--', RU]);
  await git.raw(['add', '--', EN]);
  await git.raw(['commit', '-m', 'статья уже на сайте']);
  await git.raw(['push', 'origin', 'main']);

  return {repo, сервер, git};
}

/** Что лежит на «сервере сайта» сейчас. */
async function наСервере(сервер) {
  try {
    return (await simpleGit(сервер).raw(['rev-parse', 'refs/heads/main'])).trim();
  } catch {
    return null;
  }
}

/**
 * Дверь окна к серверу, как её видит ход публикации: тот же адрес, то же тело — но вместо сети
 * прямо вызываются настоящие ручки. Отказ приходит ошибкой с текстом, как из `requestJson`.
 */
function дверь({repo, git, сервер}, записка) {
  return async (адрес, тело) => {
    записка.push({адрес, тело});

    // Правила подготовки не проверяются этим тестом — у них свои. Ответ здесь чистый.
    if (адрес === '/api/prepare') return {path: тело.path, находки: [], прошла: true, невыполненные: []};

    const ответы = [];
    const общее = {
      req: {method: 'POST'},
      res: {},
      url: {pathname: адрес},
      repo,
      settings: НАСТРОЙКИ,
      git,
      тело: async () => тело,
      insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
      send: (res, status, payload) => ответы.push({status, payload}),
      // Полная сборка сайта подставлена: она идёт минуты и здесь ничего не доказывает. Подмена —
      // тем же способом, каким её ждёт сам сборщик: вызовом ответа без ошибки.
      запуск: (_путь, _ключи, _настройки, ответ) => {
        ответ(null, 'сборка подставлена', '');

        return {on: () => undefined};
      },
      publishedRef: 'origin/main',
    };

    const взято = await releaseRoute(общее) || await publishRoute(общее) || await pushRoute(общее);
    if (!взято) throw new Error(`ручки нет: ${адрес}`);

    const {status, payload} = ответы[0];
    if (status >= 200 && status < 300) return payload;

    throw Object.assign(new Error(payload.error), {статус: status, ответ: payload});
  };
}

/** Ход окна: пишущих действий, кроме самих ручек, нет — сохранять здесь нечего. */
function ход(дверьСервера, шаги) {
  return {
    запрос: дверьСервера,
    сохранить: async () => true,
    шаг: (шаг) => шаги.push(шаг),
    жива: () => true,
  };
}

beforeEach(() => {
  запомнитьСборку(null);
  запомнитьКоммит(null);
  запомнитьПоказ(null);
});

afterEach(() => {
  запомнитьСборку(null);
  запомнитьКоммит(null);
  запомнитьПоказ(null);
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

describe('публикация от нажатия до сайта', () => {
  it('правка статьи доходит от кнопки до сервера сайта одним ходом', async () => {
    const с = await среда();
    fs.writeFileSync(path.join(с.repo, RU), `${СТАТЬЯ}\nНовая строка.\n`, 'utf8');
    const записка = [];
    const шаги = [];
    const х = ход(дверь(с, записка), шаги);
    const былоНаСервере = await наСервере(с.сервер);

    // Нажали «Опубликовать».
    const вопрос = await проверитьИСобрать(RU, false, х);

    expect(вопрос.вид).toBe('спрашиваю');
    expect(вопрос.итог.версии.find((версия) => версия.локаль === 'ru').состояние).toBe('изменилась');
    expect(вопрос.итог.версии.find((версия) => версия.локаль === 'en').состояние).toBe('неМенялась');
    // До согласия человека репозиторий не тронут ничем.
    expect(await наСервере(с.сервер)).toBe(былоНаСервере);
    expect((await с.git.raw(['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only'])).trim()).toBe('');

    // Нажали «Да, опубликовать».
    const итог = await зафиксироватьИОтправить(RU, х);

    expect(итог.вид).toBe('готово');
    expect(итог.коммит).toMatch(/^[0-9a-f]{7,}$/);
    // Работа на сервере сайта, и в ней ровно файл статьи.
    const наСайте = await наСервере(с.сервер);
    expect(наСайте).not.toBe(былоНаСервере);
    expect(наСайте).toBe((await с.git.raw(['rev-parse', 'HEAD'])).trim());
    const вКоммите = (await с.git.raw(['show', '--name-only', '--format=', 'HEAD']))
      .split(/\r?\n/).map((строка) => строка.trim()).filter(Boolean);
    expect(вКоммите).toEqual([RU]);
  }, ЖДАТЬ_GIT);

  it('согласие человека едет и в коммит, и в отправку: без него сервер отказывает', async () => {
    const с = await среда();
    fs.writeFileSync(path.join(с.repo, RU), `${СТАТЬЯ}\nНовая строка.\n`, 'utf8');
    const записка = [];
    const х = ход(дверь(с, записка), []);

    await проверитьИСобрать(RU, false, х);
    await зафиксироватьИОтправить(RU, х);

    const меняющие = записка.filter((шаг) => ['/api/publish/commit', '/api/publish/push'].includes(шаг.адрес));
    expect(меняющие).toHaveLength(2);
    for (const шаг of меняющие) expect(шаг.тело['подтверждено']).toBe(true);
  }, ЖДАТЬ_GIT);

  it('порядок шагов тот же, что человек видит на экране', async () => {
    const с = await среда();
    fs.writeFileSync(path.join(с.repo, RU), `${СТАТЬЯ}\nНовая строка.\n`, 'utf8');
    const записка = [];
    const шаги = [];
    const х = ход(дверь(с, записка), шаги);

    await проверитьИСобрать(RU, true, х);
    await зафиксироватьИОтправить(RU, х);

    expect(шаги).toEqual(['сохраняю', 'проверяю', 'сверяю', 'собираю', 'публикую']);
    expect(записка.map((шаг) => шаг.адрес)).toEqual([
      '/api/prepare',
      '/api/release',
      '/api/publish/plan',
      '/api/release/build',
      '/api/publish/commit',
      '/api/publish/plan',
      '/api/publish/push',
    ]);
  }, ЖДАТЬ_GIT);

  it('на сайте уже ровно это — публикация останавливается, репозиторий не тронут', async () => {
    const с = await среда();
    const записка = [];
    const х = ход(дверь(с, записка), []);
    const былоНаСервере = await наСервере(с.сервер);

    const исход = await проверитьИСобрать(RU, false, х);

    expect(исход.вид).toBe('остановка');
    expect(исход.ключ).toBe('нечегоПубликовать');
    // До сборки дело не дошло: собирать сайт ради ничего незачем.
    expect(записка.map((шаг) => шаг.адрес)).not.toContain('/api/release/build');
    expect(await наСервере(с.сервер)).toBe(былоНаСервере);
  }, ЖДАТЬ_GIT);

  it('впереди чужая работа — публикация статьи останавливается до всякой записи', async () => {
    const с = await среда();
    fs.mkdirSync(path.join(с.repo, 'editor'), {recursive: true});
    fs.writeFileSync(path.join(с.repo, 'editor/SPEC.md'), 'правила\n', 'utf8');
    await с.git.raw(['add', '--', 'editor/SPEC.md']);
    await с.git.raw(['commit', '-m', 'editor: правила']);
    fs.writeFileSync(path.join(с.repo, RU), `${СТАТЬЯ}\nНовая строка.\n`, 'utf8');
    const записка = [];
    const х = ход(дверь(с, записка), []);
    const былоНаСервере = await наСервере(с.сервер);

    await expect(проверитьИСобрать(RU, false, х)).rejects.toThrow();

    expect(записка.map((шаг) => шаг.адрес)).not.toContain('/api/release/build');
    expect(await наСервере(с.сервер)).toBe(былоНаСервере);
  }, ЖДАТЬ_GIT);

  it('правка во время проверок отменяет попытку: до сборки дело не доходит', async () => {
    const с = await среда();
    fs.writeFileSync(path.join(с.repo, RU), `${СТАТЬЯ}\nНовая строка.\n`, 'utf8');
    const записка = [];
    let живо = true;
    const х = {...ход(дверь(с, записка), []), жива: () => живо};

    // Человек тронул текст сразу после первой проверки.
    const исход = await проверитьИСобрать(RU, true, {...х, сохранить: async () => {
      живо = false;
      return true;
    }});

    expect(исход.вид).toBe('прервано');
    expect(записка).toHaveLength(0);
  }, ЖДАТЬ_GIT);
});
