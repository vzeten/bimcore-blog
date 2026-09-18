// Имя каждого теста повторяет формулировку правила.
//
// Ход удаления статьи насквозь: ход окна разговаривает с НАСТОЯЩИМИ ручками сервера, те — с
// настоящим git во временном репозитории и учебным «сервером сайта» (голый репозиторий) рядом.
// Настоящий origin владельца здесь не участвует ничем.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {провестиУдаление, спроситьУдаление} from '../src/ui/retireRun';
import {deleteRoute} from '../src/adapters/deleteRoute.mjs';
import {retireRoute} from '../src/adapters/retireRoute.mjs';
import {linkSweepRoute} from '../src/adapters/linkSweep.mjs';
import {listArticles} from '../src/adapters/library.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {EN, ES, RU, НАСТРОЙКИ, СТАТЬЯ, дверь, наСервере, среда, убратьПесочницы} from './runHarness.mjs';
import {снимокРепозитория} from './publishHarness.mjs';

afterEach(() => убратьПесочницы());

const СОСЕД_EN = 'docs/lessons/other/index.mdx';
const СОСЕД_RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/other/index.mdx';
const КАРТИНКА = 'docs/lessons/proba/img-01.png';
const сосед = (ссылка) => `---\ntitle: "Другая"\nslug: /lessons/other\ndescription: "Другая."\n---\n\nСм. [пробу](${ссылка}) рядом.\n`;
const ФАЙЛЫ = {[EN]: СТАТЬЯ, [RU]: СТАТЬЯ, [ES]: СТАТЬЯ, [КАРТИНКА]: 'картинка', [СОСЕД_EN]: сосед('/lessons/proba/'), [СОСЕД_RU]: сосед('../proba/')};
const НАСТРОЙКИ_СЕРВЕРА = {...НАСТРОЙКИ, отправка: {...НАСТРОЙКИ['отправка'], удалённый: 'origin'}};
const СВОИ = ['/api/article/delete', '/api/retire', '/api/retire/commit', '/api/links/sweep'];

/**
 * Дверь окна: ручки удаления и снятия зовутся здесь, публикация и отправка — общей дверью обвязки.
 * `сбой(адрес, тело)` — отказ сети до сервера: запрос не доходит, ответа нет.
 */
function дверьУдаления(с, записка, сбой = () => false) {
  const публикация = дверь(с, записка);
  return async (адрес, тело) => {
    if (сбой(адрес, тело)) {
      записка.push({адрес, тело, сбой: true});
      throw new Error('сеть недоступна');
    }
    if (!СВОИ.includes(адрес)) return публикация(адрес, тело);

    записка.push({адрес, тело});
    const ответы = [];
    const общее = {
      req: {method: 'POST'}, res: {}, url: {pathname: адрес}, repo: с.repo, editorDir: с.editorDir,
      settings: НАСТРОЙКИ_СЕРВЕРА, git: с.git, тело: async () => тело,
      insideRepo: (target) => path.resolve(target).startsWith(path.resolve(с.repo) + path.sep),
      send: (_res, status, payload) => ответы.push({status, payload}),
      articles: async () => listArticles(с.repo, НАСТРОЙКИ_СЕРВЕРА, new Map(), new Set()),
      последняяПравка: new Map(),
    };
    const взято = await deleteRoute(общее) || await retireRoute(общее) || await linkSweepRoute(общее);
    if (!взято) throw new Error(`ручки нет: ${адрес}`);
    const {status, payload} = ответы[0];
    if (status >= 200 && status < 300) return payload;
    throw Object.assign(new Error(payload.error), {статус: status, ответ: payload});
  };
}

const ход = (запрос) => ({запрос, дописать: async () => true, жива: () => true, слово: (ключ) => ключ});
const есть = (с, rel) => fs.existsSync(path.join(с.repo, rel));
const сайт = async (с, rel) => {
  try {
    return await с.git.raw(['show', `${await наСервере(с.сервер)}:${rel}`]);
  } catch {
    return null;
  }
};
const адреса = (записка) => записка.map((шаг) => шаг.адрес);

describe('удаление статьи, бывшей на сайте', () => {
  it('один вопрос, дальше само: снято с сайта, ссылки стали текстом, все языки в корзине', async () => {
    const с = await среда({файлы: ФАЙЛЫ});
    // Удалённый без обычного следа веток: реестр всё равно обязан сразу увидеть снятие (проба 2026-09-19).
    await с.git.raw(['config', '--unset-all', 'remote.origin.fetch']);
    // Неопубликованная работа человека над соседом: на сайт она уехать не должна.
    fs.appendFileSync(path.join(с.repo, СОСЕД_EN), '\nЧерновая строка.\n', 'utf8');
    const было = await снимокРепозитория(с);
    const записка = [];
    const х = ход(дверьУдаления(с, записка));

    const вопрос = await спроситьУдаление(RU, х);
    expect(вопрос).toMatchObject({вид: 'спрашиваю', снятие: {наСайте: true, статей: 1}});
    // До ответа человека ничего не записано и не отправлено.
    expect(адреса(записка)).toEqual(['/api/article/delete', '/api/retire']);

    const исход = await провестиУдаление(RU, вопрос.снятие, х);
    expect(исход).toEqual({вид: 'удалено'});
    // След сайта уже на снятии: реестр, перечитанный после удаления, показывает новое состояние сразу.
    expect((await с.git.raw(['rev-parse', 'origin/main'])).trim()).toBe(await наСервере(с.сервер));
    expect(адреса(записка).slice(2)).toEqual([
      '/api/retire/commit', '/api/publish/plan', '/api/publish/push', '/api/links/sweep', '/api/article/delete',
    ]);

    for (const rel of [EN, RU, ES, КАРТИНКА]) {
      expect(await сайт(с, rel)).toBeNull();
      expect(есть(с, rel)).toBe(false);
    }
    expect(await сайт(с, СОСЕД_EN)).toBe(сосед('/lessons/proba/').replace('[пробу](/lessons/proba/)', 'пробу'));
    expect(await сайт(с, СОСЕД_RU)).toBe(сосед('../proba/').replace('[пробу](../proba/)', 'пробу'));
    const наДиске = fs.readFileSync(path.join(с.repo, СОСЕД_EN), 'utf8');
    expect(наДиске).toContain('См. пробу рядом.');
    expect(наДиске).toContain('Черновая строка.');
    // Ветка, HEAD, индекс и местная main человека не двигались: коммит снятия уехал только на сайт.
    const стало = await снимокРепозитория(с);
    expect({...стало, дерево: ''}).toEqual({...было, дерево: ''});
  }, ЖДАТЬ_GIT * 2);

  it('обрыв отправки: статья на месте, повтор досылает ту же запись и второй не делает', async () => {
    const с = await среда({файлы: ФАЙЛЫ});
    const сайтДо = await наСервере(с.сервер);
    const записка = [];
    let сетьЕсть = false;
    const х = ход(дверьУдаления(с, записка, (адрес) => адрес === '/api/publish/push' && !сетьЕсть));

    const вопрос = await спроситьУдаление(RU, х);
    expect((await провестиУдаление(RU, вопрос.снятие, х)).вид).toBe('остановка');
    expect(await наСервере(с.сервер)).toBe(сайтДо);
    expect(есть(с, RU)).toBe(true);

    сетьЕсть = true;
    const снова = await спроситьУдаление(RU, х);
    // Досланное снятие уже на сайте: второй вопрос — только про корзину.
    expect(снова).toMatchObject({вид: 'спрашиваю', снятие: {наСайте: false}});
    expect(await сайт(с, EN)).toBeNull();
    expect((await провестиУдаление(RU, снова.снятие, х)).вид).toBe('удалено');
    expect(адреса(записка).filter((адрес) => адрес === '/api/retire/commit')).toHaveLength(1);
    expect(fs.readFileSync(path.join(с.repo, СОСЕД_EN), 'utf8')).toContain('См. пробу рядом.');
    expect(есть(с, RU)).toBe(false);
  }, ЖДАТЬ_GIT * 2);

  it('отправка прошла, а корзина сорвалась: повтор видит «на сайте нет» и доводит до корзины', async () => {
    const с = await среда({файлы: ФАЙЛЫ});
    const записка = [];
    let сорвать = true;
    const х = ход(дверьУдаления(с, записка, (адрес, тело) => адрес === '/api/article/delete' && тело.подтверждено !== undefined && сорвать));

    const вопрос = await спроситьУдаление(RU, х);
    expect((await провестиУдаление(RU, вопрос.снятие, х)).вид).toBe('остановка');
    expect(await сайт(с, RU)).toBeNull();
    expect(есть(с, RU)).toBe(true);

    сорвать = false;
    const снова = await спроситьУдаление(RU, х);
    expect(снова).toMatchObject({вид: 'спрашиваю', снятие: {наСайте: false}});
    expect((await провестиУдаление(RU, снова.снятие, х)).вид).toBe('удалено');
    expect(есть(с, EN)).toBe(false);
  }, ЖДАТЬ_GIT * 2);

  it('чужая неотправленная запись — остановка до вопроса: сначала её досылает «Опубликовать»', async () => {
    const с = await среда({файлы: ФАЙЛЫ});
    const записка = [];
    const х = ход(дверьУдаления(с, записка));
    fs.appendFileSync(path.join(с.repo, СОСЕД_EN), '\nНовое.\n', 'utf8');
    const {проверить} = await import('../src/ui/publishRun');
    const показ = await проверить(СОСЕД_EN, false, {...х, сохранить: async () => true, поставитьДату: async () => true, поставитьОбложку: async () => true, шаг: () => {}});
    await х.запрос('/api/publish/commit', {path: СОСЕД_EN, подтверждено: true, отпечаток: показ.отпечаток, отпечатокПодготовки: показ.отпечатокПодготовки});

    const вопрос = await спроситьУдаление(RU, х);
    expect(вопрос).toEqual({вид: 'остановка', текст: НАСТРОЙКИ['отказыОтправки']['естьНеотправленное']});
    expect(есть(с, RU)).toBe(true);
  }, ЖДАТЬ_GIT * 2);
});

describe('удаление статьи, которой на сайте не было', () => {
  it('вопрос только про корзину, в хранилище ничего не пишется', async () => {
    const с = await среда({файлы: ФАЙЛЫ, вКоммите: [СОСЕД_EN]});
    const сайтДо = await наСервере(с.сервер);
    const записка = [];
    const х = ход(дверьУдаления(с, записка));

    const вопрос = await спроситьУдаление(RU, х);
    expect(вопрос).toMatchObject({вид: 'спрашиваю', снятие: {наСайте: false, статей: 0}});
    expect((await провестиУдаление(RU, вопрос.снятие, х)).вид).toBe('удалено');
    expect(адреса(записка)).not.toContain('/api/retire/commit');
    expect(await наСервере(с.сервер)).toBe(сайтДо);
  }, ЖДАТЬ_GIT * 2);

  it('запись снятия статьи, которой на сайте нет, — отказ «статья изменилась», а не ответ без коммита', async () => {
    const с = await среда({файлы: ФАЙЛЫ, вКоммите: [СОСЕД_EN]});
    const сайтДо = await наСервере(с.сервер);
    const х = ход(дверьУдаления(с, []));

    const беда = await х.запрос('/api/retire/commit', {path: RU, подтверждено: true, отпечаток: 'показанный'})
      .catch((ошибка) => ошибка);

    expect(беда.ответ?.код).toBe('статьяИзменилась');
    expect(await наСервере(с.сервер)).toBe(сайтДо);
    expect(есть(с, RU)).toBe(true);
  }, ЖДАТЬ_GIT * 2);

  it('черновик не дописался — вопроса нет и ничего не тронуто', async () => {
    const с = await среда({файлы: ФАЙЛЫ});
    const записка = [];
    const исход = await спроситьУдаление(RU, {...ход(дверьУдаления(с, записка)), дописать: async () => false});
    expect(исход).toEqual({вид: 'остановка', текст: 'удалениеБезЧерновика'});
    expect(записка).toEqual([]);
  }, ЖДАТЬ_GIT * 2);
});
