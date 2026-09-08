// Имя каждого теста повторяет формулировку правила.
// Признаки ВЫПУСКА отвечают про опубликованную версию, а не про файл на диске: красные буквы —
// про `draft` в `origin/main`, и они молчат, когда этой ветки прочитать нельзя. Местную работу
// показывает красная точка. Проверяется на настоящем временном git.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {detectPublishedRef, расхождениеССайтом} from '../src/adapters/gitFile.mjs';
import {опубликованные} from '../src/adapters/library.mjs';
import {articleFacts} from '../src/adapters/articleFacts.mjs';
import {ЖДАТЬ_GIT, НАСТРОЙКИ, ПУТИ, положить, признакиРеестра, свод, среда, статья} from './localeSignsHarness.mjs';

/**
 * Четыре состояния красных букв на настоящем временном git — теми же парами, что и у значка
 * ссылки. Цвет обещает поведение ЖИВОЙ страницы: сборка сайта её не выпускает. Будущая правка
 * доступности до публикации цвета не касается, её показывает красная точка.
 */
describe('красные буквы означают draft: true в опубликованной версии', () => {
  const переписатьRu = (repo, шапка) => положить(repo, ПУТИ.ru, статья(шапка, 'Русский текст.'));

  it('опубликована с draft: true и не менялась — буквы красные', async () => {
    const {repo, git} = await среда({шапкаRu: 'draft: true\n'});
    const признаки = признакиРеестра(await свод(repo, git));

    expect(признаки.ru.черновик).toBe(true);
    expect(признаки.ru.изменена).toBe(false);
  }, ЖДАТЬ_GIT);

  it('опубликована обычной и не менялась — буквы не красные', async () => {
    const {repo, git} = await среда();
    const признаки = признакиРеестра(await свод(repo, git));

    expect(признаки.ru.черновик).toBe(false);
    expect(признаки.ru.изменена).toBe(false);
  }, ЖДАТЬ_GIT);

  it('опубликована черновиком, а локально снят — буквы остаются красными до публикации', async () => {
    const {repo, git} = await среда({шапкаRu: 'draft: true\n'});
    переписатьRu(repo, '');

    const статьи = await свод(repo, git);
    const признаки = признакиРеестра(статьи);

    // Сайт по-прежнему не выпускает страницу: снятого поля там ещё не было.
    expect(признаки.ru.черновик).toBe(true);
    // Саму неуехавшую правку показывает красная точка — тот признак, который для неё и заведён.
    expect(признаки.ru.изменена).toBe(true);
    expect(articleFacts(статьи, ПУТИ.ru, НАСТРОЙКИ).признакиЛокалей).toEqual(признаки);
  }, ЖДАТЬ_GIT);

  it('опубликована обычной, а локально поставлен — красноты до публикации нет', async () => {
    const {repo, git} = await среда();
    переписатьRu(repo, 'draft: true\n');

    const статьи = await свод(repo, git);
    const признаки = признакиРеестра(статьи);

    expect(признаки.ru.черновик).toBe(false);
    expect(признаки.ru.изменена).toBe(true);
    // Соседние языки чужая правка не задела.
    expect(признаки.en.черновик).toBe(false);
    expect(признаки.es.черновик).toBe(false);
    expect(признаки.en.изменена).toBe(false);
    expect(articleFacts(статьи, ПУТИ.ru, НАСТРОЙКИ).признакиЛокалей).toEqual(признаки);
  }, ЖДАТЬ_GIT);

  it('опубликованный draft: false равнозначен отсутствию поля', async () => {
    const {repo, git} = await среда({шапкаRu: 'draft: false\n'});

    expect(признакиРеестра(await свод(repo, git)).ru.черновик).toBe(false);
  }, ЖДАТЬ_GIT);

  it('локальная смена доступности не трогает ни цвет, ни значок соседних локалей', async () => {
    // Опубликовано так: RU черновиком, ES по ссылке. Локально у RU снимают черновик.
    const {repo, git} = await среда({шапкаRu: 'draft: true\n', шапкаEs: 'unlisted: true\n'});
    переписатьRu(repo, 'unlisted: true\n');

    const признаки = признакиРеестра(await свод(repo, git));

    // У RU обещание сайта не изменилось ни в цвете, ни в значке — изменилась только точка.
    expect(признаки.ru.черновик).toBe(true);
    expect(признаки.ru.поСсылке).toBe(false);
    expect(признаки.ru.изменена).toBe(true);
    // ES осталась при своём значке, EN — при своём отсутствии признаков.
    expect(признаки.es.поСсылке).toBe(true);
    expect(признаки.es.черновик).toBe(false);
    expect(признаки.en.черновик).toBe(false);
    expect(признаки.en.поСсылке).toBe(false);
    expect(признаки.en.изменена).toBe(false);
  }, ЖДАТЬ_GIT);

  it('git недоступен — красных букв нет, даже когда draft стоит в файле', async () => {
    const {repo, git} = await среда({шапкаRu: 'draft: true\n'});
    fs.rmSync(path.join(repo, '.git'), {recursive: true, force: true, maxRetries: 10, retryDelay: 100});

    const признаки = признакиРеестра(await свод(repo, git));

    for (const код of Object.keys(НАСТРОЙКИ['локали'])) expect(признаки[код].черновик).toBe(false);
  }, ЖДАТЬ_GIT);
});

/**
 * Опубликованной ветки нет вовсе. Раньше её молча подменял `HEAD`, и любой местный `draft` или
 * `unlisted`, попавший в коммит, объявлялся выпущенным: карточки и шапка загорались красным и
 * получали значок ссылки, которых сайт никогда не видел (находка контролёра 2026-09-08).
 */
describe('без читаемой origin/main признаки выпуска молчат', () => {
  /** Закоммитить местную правку так, как это делает работа в ветке, и убрать связь с сайтом. */
  const безСайта = async ({repo, git}, строка) => {
    положить(repo, ПУТИ.ru, статья(строка, 'Русский текст.'));
    await git.raw(['add', '--', ПУТИ.ru]);
    await git.raw(['commit', '-m', 'местная правка доступности']);
    await git.raw(['remote', 'remove', 'origin']);
  };

  it('местный draft в коммите не красит буквы: локальная ветка сайта не доказывает', async () => {
    const с = await среда();
    await безСайта(с, 'draft: true' + String.fromCharCode(10));

    const признаки = признакиРеестра(await свод(с.repo, с.git));

    for (const код of Object.keys(НАСТРОЙКИ['локали'])) {
      expect(признаки[код].черновик, код).toBe(false);
      expect(признаки[код].поСсылке, код).toBe(false);
    }
  }, ЖДАТЬ_GIT);

  it('местный unlisted в коммите не заводит значка ссылки', async () => {
    const с = await среда();
    await безСайта(с, 'unlisted: true' + String.fromCharCode(10));

    const признаки = признакиРеестра(await свод(с.repo, с.git));

    for (const код of Object.keys(НАСТРОЙКИ['локали'])) expect(признаки[код].поСсылке, код).toBe(false);
  }, ЖДАТЬ_GIT);

  it('неизвестное состояние не выдаётся ни за «публиковалась», ни за «изменена»', async () => {
    // «Не знаю» — не «нет»: ни синего цвета новой версии, ни красной точки правки.
    const с = await среда();
    await безСайта(с, 'draft: true' + String.fromCharCode(10));

    const статьи = await свод(с.repo, с.git);
    const признаки = признакиРеестра(статьи);

    for (const код of Object.keys(НАСТРОЙКИ['локали'])) {
      expect(признаки[код].неПубликовалась, код).toBe(false);
      expect(признаки[код].изменена, код).toBe(false);
    }
    // Реестр и шапка берут один и тот же результат.
    expect(articleFacts(статьи, ПУТИ.ru, НАСТРОЙКИ).признакиЛокалей).toEqual(признаки);
  }, ЖДАТЬ_GIT);

  it('опубликованной веткой считается только origin/main, а её отсутствие — «не знаю»', async () => {
    const с = await среда();

    expect(await detectPublishedRef(с.git)).toBe('origin/main');
    await с.git.raw(['remote', 'remove', 'origin']);
    expect(await detectPublishedRef(с.git)).toBe(null);
    // Ветка не прочитана — перечень опубликованного пуст И назван неизвестным, а сравнение молчит.
    expect(await опубликованные(с.git, null)).toEqual({известна: false, файлы: new Set()});
    expect(await расхождениеССайтом(с.git, null, ['blog'])).toBe(null);
  }, ЖДАТЬ_GIT);
});
