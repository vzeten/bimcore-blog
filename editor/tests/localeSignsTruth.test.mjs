// Имя каждого теста повторяет формулировку правила.
// Наблюдение владельца на настоящем временном git: RU опубликована и не изменена, EN опубликована
// и локально изменена, ES — заглушка. Признаки каждой версии считаются по одному своду, реестр и
// шапка берут их оттуда же, а общего слова «Опубликована» о статье больше нет.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {articleFacts} from '../src/adapters/articleFacts.mjs';
import {признакиЛокали} from '../src/core/localeSigns.mjs';
import {ЖДАТЬ_GIT, НАСТРОЙКИ, ПУТИ, положить, признакиРеестра, свод, среда, статья} from './localeSignsHarness.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('состояние каждой локали видно у RU, EN и ES', () => {
  it('RU опубликована и не изменена, EN изменена, ES заглушка — у каждой версии свои признаки', async () => {
    const {repo, git} = await среда();
    fs.appendFileSync(path.join(repo, ПУТИ.en), 'Local edit.\n', 'utf8');

    const признаки = признакиРеестра(await свод(repo, git));

    // RU: обычная опубликованная версия — ни точки, ни цвета, ни значка.
    expect(признаки.ru).toEqual({
      есть: true, черновик: false, неПубликовалась: false, изменена: false, заглушка: false, поСсылке: false,
    });
    // EN: красная точка. Именно её прятало общее слово «Опубликована».
    expect(признаки.en.изменена).toBe(true);
    expect(признаки.en.заглушка).toBe(false);
    // ES: признак заглушки при ней, и правка соседа его не задела.
    expect(признаки.es.заглушка).toBe(true);
    expect(признаки.es.изменена).toBe(false);
  }, ЖДАТЬ_GIT);

  it('признаки не зависят от порядка RU, EN и ES: каждая версия отвечает за себя', async () => {
    const {repo, git} = await среда();
    fs.appendFileSync(path.join(repo, ПУТИ.en), 'Local edit.\n', 'utf8');

    const прямо = признакиРеестра(await свод(repo, git));
    // Тот же свод, собранный из тех же версий в обратном порядке языков.
    const обратно = признакиРеестра((await свод(repo, git)).map((item) => ({
      ...item,
      versions: Object.fromEntries(Object.entries(item.versions).reverse()),
    })));

    expect(обратно).toEqual(прямо);
  }, ЖДАТЬ_GIT);

  it('реестр и шапка показывают одни признаки из общего источника', async () => {
    const {repo, git} = await среда();
    fs.appendFileSync(path.join(repo, ПУТИ.en), 'Local edit.\n', 'utf8');

    const статьи = await свод(repo, git);

    // Шапка спрашивает про открытую RU, а получает признаки всех трёх версий — те же самые.
    expect(articleFacts(статьи, ПУТИ.ru, НАСТРОЙКИ).признакиЛокалей).toEqual(признакиРеестра(статьи));
  }, ЖДАТЬ_GIT);

  it('draft: true окрашивает только свою локаль, а не соседние версии', async () => {
    const {repo, git} = await среда({шапкаRu: 'draft: true\n'});
    const признаки = признакиРеестра(await свод(repo, git));

    expect(признаки.ru.черновик).toBe(true);
    expect(признаки.en.черновик).toBe(false);
    expect(признаки.es.черновик).toBe(false);
  }, ЖДАТЬ_GIT);

  it('draft: false не окрашивает версию так же, как отсутствие поля', async () => {
    const {repo, git} = await среда({шапкаRu: 'draft: false\n'});
    const признаки = признакиРеестра(await свод(repo, git));

    expect(признаки.ru.черновик).toBe(false);
    expect(признаки.en.черновик).toBe(false);
  }, ЖДАТЬ_GIT);

  it('unlisted: true даёт значок ссылки только своей локали и не стирает соседние признаки', async () => {
    const {repo, git} = await среда({шапкаEs: 'unlisted: true\n'});
    fs.appendFileSync(path.join(repo, ПУТИ.en), 'Local edit.\n', 'utf8');

    const признаки = признакиРеестра(await свод(repo, git));

    expect(признаки.es.поСсылке).toBe(true);
    expect(признаки.ru.поСсылке).toBe(false);
    expect(признаки.en.поСсылке).toBe(false);
    // Соседи при этом остались при своём: заглушка и красная точка никуда не делись.
    expect(признаки.es.заглушка).toBe(true);
    expect(признаки.en.изменена).toBe(true);
  }, ЖДАТЬ_GIT);

  it('версии, которой нет в опубликованной ветке, показывается «ещё не публиковалась»', async () => {
    const {repo, git} = await среда();
    const НОВАЯ = 'blog/novaya/index.mdx';
    положить(repo, НОВАЯ, статья('', 'Fresh.'));

    const статьи = await свод(repo, git);
    const новая = статьи.find((item) => Object.values(item.versions).some((v) => v.path === НОВАЯ));

    expect(признакиЛокали(новая.versions.en).неПубликовалась).toBe(true);
    // А у соседней статьи, которая на сайте, синего цвета не появляется.
    expect(признакиРеестра(статьи).en.неПубликовалась).toBe(false);
  }, ЖДАТЬ_GIT);

  it('git недоступен — «ещё не публиковалась» не выдумывается ни одной версии', async () => {
    const {repo, git} = await среда();
    fs.rmSync(path.join(repo, '.git'), {recursive: true, force: true, maxRetries: 10, retryDelay: 100});

    const признаки = признакиРеестра(await свод(repo, git));

    for (const код of Object.keys(НАСТРОЙКИ['локали'])) {
      expect(признаки[код].неПубликовалась).toBe(false);
      expect(признаки[код].изменена).toBe(false);
    }
    // Заглушка от git не зависит и остаётся видна.
    expect(признаки.es.заглушка).toBe(true);
  }, ЖДАТЬ_GIT);
});

/**
 * Четыре состояния значка «только по ссылке» на настоящем временном git. Проверяется именно то,
 * что видит владелец: значок обещает поведение ЖИВОЙ страницы, а не будущую настройку в файле.
 * Русская версия переписывается уже ПОСЛЕ выпуска — так и выглядит местная правка до публикации.
 */
describe('значок ссылки означает опубликованную версию, скрытую на сайте', () => {
  const переписатьRu = (repo, шапка) => положить(repo, ПУТИ.ru, статья(шапка, 'Русский текст.'));

  it('опубликована с unlisted: true и не менялась — значок есть', async () => {
    const {repo, git} = await среда({шапкаRu: 'unlisted: true\n'});
    const признаки = признакиРеестра(await свод(repo, git));

    expect(признаки.ru.поСсылке).toBe(true);
    expect(признаки.ru.изменена).toBe(false);
  }, ЖДАТЬ_GIT);

  it('опубликована обычной и не менялась — значка нет', async () => {
    const {repo, git} = await среда();
    const признаки = признакиРеестра(await свод(repo, git));

    expect(признаки.ru.поСсылке).toBe(false);
    expect(признаки.ru.изменена).toBe(false);
  }, ЖДАТЬ_GIT);

  it('опубликована скрытой, а локально флаг снят — значок остаётся до публикации', async () => {
    const {repo, git} = await среда({шапкаRu: 'unlisted: true\n'});
    переписатьRu(repo, '');

    const статьи = await свод(repo, git);
    const признаки = признакиРеестра(статьи);

    // Сайт по-прежнему прячет страницу: снятый флаг там ещё не был.
    expect(признаки.ru.поСсылке).toBe(true);
    // А сама неуехавшая правка видна красной точкой — тем признаком, который для неё и заведён.
    expect(признаки.ru.изменена).toBe(true);
    expect(articleFacts(статьи, ПУТИ.ru, НАСТРОЙКИ).признакиЛокалей).toEqual(признаки);
  }, ЖДАТЬ_GIT);

  it('опубликована обычной, а локально флаг поставлен — значка до публикации нет', async () => {
    const {repo, git} = await среда();
    переписатьRu(repo, 'unlisted: true\n');

    const статьи = await свод(repo, git);
    const признаки = признакиРеестра(статьи);

    // Местная настройка сайту ещё ничего не сказала, поэтому значка нет...
    expect(признаки.ru.поСсылке).toBe(false);
    // ...а показывает её та же красная точка неопубликованной правки.
    expect(признаки.ru.изменена).toBe(true);
    // Соседние версии чужая правка не задела.
    expect(признаки.en.поСсылке).toBe(false);
    expect(признаки.es.поСсылке).toBe(false);
    expect(articleFacts(статьи, ПУТИ.ru, НАСТРОЙКИ).признакиЛокалей).toEqual(признаки);
  }, ЖДАТЬ_GIT);

  it('git недоступен — ни значка, ни точки, даже когда unlisted стоит в файле', async () => {
    // Наблюдалось вживую: сервер, запущенный там, где git не отвечает, отдал все версии с
    // «не знаю» про публикацию. Пустые признаки — это правильный ответ, а не пропавший значок:
    // сказать про сайт нечего, а местное `unlisted` про сайт не отвечает.
    const {repo, git} = await среда({шапкаEs: 'unlisted: true\n'});
    fs.rmSync(path.join(repo, '.git'), {recursive: true, force: true, maxRetries: 10, retryDelay: 100});

    const признаки = признакиРеестра(await свод(repo, git));

    for (const код of Object.keys(НАСТРОЙКИ['локали'])) {
      expect(признаки[код].поСсылке).toBe(false);
      expect(признаки[код].изменена).toBe(false);
    }
  }, ЖДАТЬ_GIT);

  it('сервер собирает свод тем же чтением опубликованной шапки, что и проверка', () => {
    // Предохранитель от расхождения (SPEC 5.2.1): забудь сервер спросить ветку — реестр вернулся
    // бы к местному `unlisted`, а тесты выше остались бы зелёными на своей сборке свода.
    const сервер = fs.readFileSync(path.join(EDITOR, 'server.mjs'), 'utf8');

    expect(сервер).toContain('шапкиВВетке');
    expect(сервер).toContain('путиЗаОпубликованнойШапкой');
  });
});
