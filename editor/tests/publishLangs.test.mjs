// Имя каждого теста повторяет формулировку правила.
//
// Несколько языков одной публикацией (этап 3, решение владельца 2026-09-18, п.2): отмеченные галочками
// версии уезжают одним коммитом, неотмеченные — как прежде (на сайте — не трогаются, нет — заглушка).
// Доступность одна на всю публикацию; дату и доступность неоткрытых языков пишет сервер. Ход окна
// разговаривает с настоящими ручками, те — с настоящим git и учебным «сервером сайта» (голый репозиторий).
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {опубликовать} from '../src/ui/publishRun';
import {запомнитьКоммит, запомнитьПоказ} from '../src/adapters/pushMemory.mjs';
import {fingerprint, listSnapshots, saveDraft} from '../src/adapters/draftStore.mjs';
import {записатьСпор} from '../src/adapters/conflictStore.mjs';
import {прочитатьВыкладку} from '../src/adapters/deployWatch.mjs';
import {loadState, saveState} from '../src/adapters/library.mjs';
import {newDraft} from '../src/core/drafts.mjs';
import {splitArticle} from '../src/core/articleFile.mjs';
import {заменитьШапку} from '../src/core/refineHead.mjs';
import {шапкаДоступности} from '../src/core/siteAccess.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {EN, ES, RU, НАСТРОЙКИ, СТАТЬЯ, дверь, наСервере, поставитьДатуВФайл, среда, убратьПесочницы, ход} from './runHarness.mjs';

beforeEach(() => {
  запомнитьКоммит(null);
  запомнитьПоказ(null);
});

afterEach(() => {
  запомнитьКоммит(null);
  запомнитьПоказ(null);
  убратьПесочницы();
});

const читать = (с, rel) => fs.readFileSync(path.join(с.repo, rel), 'utf8');
const дописать = (с, rel, строка) => fs.appendFileSync(path.join(с.repo, rel), `${строка}\n`, 'utf8');
const наСайте = async (с, rel) => с.git.raw(['show', `${await наСервере(с.сервер)}:${rel}`]);
const файлыКоммита = async (с, sha) => (await с.git.raw(['-c', 'core.quotepath=false', 'show', '--name-only', '--format=', sha]))
  .split(/\r?\n/).map((строка) => строка.trim()).filter(Boolean).sort();
const записей = (записка) => записка.filter((шаг) => шаг.адрес === '/api/publish/commit').length;

/** Как окно ставит доступность открытому языку: поля шапки правилом ядра, запись — сохранением. */
const доступностьВФайл = (с, rel) => async (режим) => {
  const текст = читать(с, rel);
  const шапка = шапкаДоступности(splitArticle(текст).frontmatterRaw, режим, НАСТРОЙКИ['поляСоздания']['docs']['порядок']);
  fs.writeFileSync(path.join(с.repo, rel), заменитьШапку(текст, шапка), 'utf8');
  return true;
};

describe('несколько языков одной публикацией', () => {
  it('отмечены русский и английский — оба уезжают одним коммитом, неотмеченный испанский не тронут', async () => {
    const с = await среда();
    дописать(с, RU, 'Русская правка.');
    дописать(с, EN, 'English edit.');
    // Начатая, но не отмеченная работа над испанским: на сайт она не уезжает.
    дописать(с, ES, 'Cambio sin marcar.');
    const было = await наСервере(с.сервер);
    const записка = [];

    const исход = await опубликовать(RU, false, ход(дверь(с, записка), []), 'всем', [RU, EN]);

    expect(исход.вид).toBe('готово');
    const стало = await наСервере(с.сервер);
    expect((await с.git.raw(['rev-parse', `${стало}^`])).trim()).toBe(было);
    expect(await файлыКоммита(с, стало)).toEqual([EN, RU].sort());
    expect(await наСайте(с, RU)).toBe(читать(с, RU));
    expect(await наСайте(с, EN)).toBe(читать(с, EN));
    expect(await наСайте(с, ES)).toBe(СТАТЬЯ);
    expect(читать(с, ES)).toContain('Cambio sin marcar.');
    expect(записей(записка)).toBe(1);
    // Проверки подготовки прошли у каждой отмеченной версии, у неотмеченной — нет.
    const проверены = записка.filter((шаг) => шаг.адрес === '/api/prepare').map((шаг) => шаг.тело.path);
    expect(проверены.sort()).toEqual([EN, RU].sort());
    // Слежение за выкладкой и значок «Сайт» знают оба языка этой публикации.
    expect([...прочитатьВыкладку(с.editorDir, НАСТРОЙКИ).локали].sort()).toEqual(['en', 'ru']);
  }, ЖДАТЬ_GIT * 2);

  it('у неоткрытого отмеченного языка подтверждённый черновик, отличный от файла, — отказ с понятной причиной, ничего не записано', async () => {
    const с = await среда();
    дописать(с, RU, 'Русская правка.');
    const файл = читать(с, EN);
    const {frontmatterRaw, body} = splitArticle(файл);
    saveDraft(с.repo, НАСТРОЙКИ, newDraft({
      path: EN, frontmatterRaw, body: `${body}Unsaved line.\n`, отпечатокБазы: fingerprint(файл),
      когда: new Date().toISOString(), база: {frontmatterRaw, body},
    }));
    const было = await наСервере(с.сервер);

    const беда = await опубликовать(RU, false, ход(дверь(с, []), []), 'поСсылке', [RU, EN]).catch((ошибка) => ошибка);

    expect(беда.message).toBe('English: есть несохранённая правка — откройте этот язык и сохраните');
    expect(беда.ответ.код).toBe('правкаЯзыкаЖдёт');
    expect(await наСервере(с.сервер)).toBe(было);
    expect(читать(с, EN)).toBe(файл);
  }, ЖДАТЬ_GIT);

  it('у неоткрытого отмеченного языка нерешённый спор — тот же отказ', async () => {
    const с = await среда();
    записатьСпор(с.repo, НАСТРОЙКИ, {path: ES, вид: 'спор', части: []});

    const беда = await опубликовать(RU, false, ход(дверь(с, []), []), 'всем', [RU, ES]).catch((ошибка) => ошибка);

    expect(беда.message).toBe('Español: есть несохранённая правка — откройте этот язык и сохраните');
  }, ЖДАТЬ_GIT);

  it('галочкой нельзя увезти чужой файл: версия другой статьи в перечне — отказ показа и записи', async () => {
    const ЧУЖАЯ = 'docs/lessons/other/index.mdx';
    const с = await среда({файлы: {[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ, [ЧУЖАЯ]: СТАТЬЯ}});
    const запрос = дверь(с, []);

    for (const адрес of ['/api/release', '/api/publish/commit', '/api/publish/versions']) {
      const беда = await запрос(адрес, {path: RU, версии: [RU, ЧУЖАЯ], подтверждено: true}).catch((ошибка) => ошибка);
      expect(беда.статус).toBe(400);
    }
  }, ЖДАТЬ_GIT);

  it('«По ссылке» на двух языках — доступность одна на всю публикацию: у обоих на сайте unlisted, у неоткрытого запись в истории', async () => {
    const с = await среда();

    const исход = await опубликовать(RU, false, ход(дверь(с, []), [], undefined, undefined, доступностьВФайл(с, RU)), 'поСсылке', [RU, EN]);

    expect(исход.вид).toBe('готово');
    expect(await наСайте(с, RU)).toMatch(/^unlisted: true$/m);
    expect(await наСайте(с, EN)).toMatch(/^unlisted: true$/m);
    expect(await наСайте(с, ES)).toBe(СТАТЬЯ);
    // Файл неоткрытого языка записал сервер, и прежний текст вместе с новым лёг снимками в историю.
    expect(читать(с, EN)).toMatch(/^unlisted: true$/m);
    expect(listSnapshots(с.repo, НАСТРОЙКИ, EN).length).toBe(2);
  }, ЖДАТЬ_GIT * 2);

  it('два неоткрытых языка, запись второго не легла — первый возвращён к прежнему тексту, ничего не переписано', async () => {
    const с = await среда();
    const былоEN = читать(с, EN);
    // Испанский меняют снаружи ровно между чтением и записью: сверка второго языка обязана отказать.
    const git = new Proxy(с.git, {get(цель, ключ) {
      if (ключ !== 'raw') return typeof цель[ключ] === 'function' ? цель[ключ].bind(цель) : цель[ключ];
      return async (аргументы) => {
        if (аргументы[0] === 'config' && аргументы[1] === 'user.name') дописать(с, ES, 'Правка снаружи.');
        return цель.raw(аргументы);
      };
    }});
    const запрос = дверь({...с, git}, []);

    const беда = await запрос('/api/publish/versions', {path: RU, версии: [RU, EN, ES], доступность: 'поСсылке'}).catch((ошибка) => ошибка);

    expect(беда.ответ).toMatchObject({код: 'статьяИзменилась', путь: ES, изменены: []});
    expect(читать(с, EN)).toBe(былоEN);
    expect(читать(с, ES)).toContain('Правка снаружи.');
    expect(читать(с, ES)).not.toMatch(/^unlisted: true$/m);
  }, ЖДАТЬ_GIT);

  it('шапку неоткрытого языка переписал сервер — его готовность возвращается в черновик, как после сохранения окна', async () => {
    const с = await среда();
    saveState(с.repo, EN, НАСТРОЙКИ, {...loadState(с.repo, EN, НАСТРОЙКИ), готовность: НАСТРОЙКИ['статусы'][1]});

    await дверь(с, [])('/api/publish/versions', {path: RU, версии: [RU, EN], доступность: 'поСсылке'});

    expect(loadState(с.repo, EN, НАСТРОЙКИ)['готовность']).toBe(НАСТРОЙКИ['статусы'][0]);
  }, ЖДАТЬ_GIT);

  it('«Недоступно» на двух опубликованных — ссылки на обе версии убраны на сайте и на компьютере, живой испанский не тронут', async () => {
    const СОСЕД = (корень) => `${корень}/lessons/other/index.mdx`;
    const соседи = {
      ru: СОСЕД('i18n/ru/docusaurus-plugin-content-docs/current'), en: СОСЕД('docs'), es: СОСЕД('i18n/es/docusaurus-plugin-content-docs/current'),
    };
    const сосед = (текст) => `---\ntitle: "Другая"\nslug: /lessons/other\ndescription: "Другая."\n---\n\n${текст}\n`;
    const с = await среда({файлы: {
      [RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ,
      [соседи.ru]: сосед('См. [пробу](/lessons/proba/) рядом.'),
      [соседи.en]: сосед('See [proba](/lessons/proba/) nearby.'),
      [соседи.es]: сосед('Ver [proba](/lessons/proba/) cerca.'),
    }});
    const записка = [];

    const исход = await опубликовать(RU, false, ход(дверь(с, записка), [], undefined, undefined, доступностьВФайл(с, RU)), 'недоступно', [RU, EN]);

    expect(исход.вид).toBe('готово');
    expect(исход.ссылкиНеУбраны).toEqual([]);
    expect(await наСайте(с, RU)).toMatch(/^draft: true$/m);
    expect(await наСайте(с, EN)).toMatch(/^draft: true$/m);
    expect(await наСайте(с, соседи.ru)).toBe(сосед('См. пробу рядом.'));
    expect(await наСайте(с, соседи.en)).toBe(сосед('See proba nearby.'));
    expect(await наСайте(с, соседи.es)).toBe(сосед('Ver [proba](/lessons/proba/) cerca.'));
    expect(читать(с, соседи.ru)).toBe(сосед('См. пробу рядом.'));
    expect(читать(с, соседи.en)).toBe(сосед('See proba nearby.'));
    expect(читать(с, соседи.es)).toBe(сосед('Ver [proba](/lessons/proba/) cerca.'));
    const уборка = записка.find((шаг) => шаг.адрес === '/api/links/sweep');
    expect([...уборка.тело.версии].sort()).toEqual([EN, RU].sort());
  }, ЖДАТЬ_GIT * 2);

  it('обрыв отправки — повтор досылает тот же коммит с обоими языками, второй записи нет', async () => {
    const с = await среда();
    дописать(с, RU, 'Русская правка.');
    дописать(с, EN, 'English edit.');
    const было = await наСервере(с.сервер);
    const записка = [];
    const основная = дверь(с, записка);
    let оборвать = true;
    const сОбрывом = async (адрес, тело) => {
      if (адрес === '/api/publish/push' && оборвать) {
        оборвать = false;
        throw new Error('сеть оборвалась');
      }
      return основная(адрес, тело);
    };

    await expect(опубликовать(RU, false, ход(сОбрывом, []), 'всем', [RU, EN])).rejects.toThrow('сеть оборвалась');
    expect(await наСервере(с.сервер)).toBe(было);

    const исход = await опубликовать(RU, false, ход(сОбрывом, []), 'всем', [RU, EN]);

    expect(исход.вид).toBe('готово');
    expect(await файлыКоммита(с, await наСервере(с.сервер))).toEqual([EN, RU].sort());
    expect(записей(записка)).toBe(1);
  }, ЖДАТЬ_GIT * 2);

  it('после обрыва изменился неоткрытый отмеченный язык — прежняя запись снимается, уезжает новый текст', async () => {
    const с = await среда();
    дописать(с, RU, 'Русская правка.');
    дописать(с, EN, 'English edit.');
    const записка = [];
    const основная = дверь(с, записка);
    let оборвать = true;
    const сОбрывом = async (адрес, тело) => {
      if (адрес === '/api/publish/push' && оборвать) {
        оборвать = false;
        throw new Error('сеть оборвалась');
      }
      return основная(адрес, тело);
    };
    await опубликовать(RU, false, ход(сОбрывом, []), 'всем', [RU, EN]).catch(() => null);
    // Источники записи — по ВСЕМ отмеченным версиям: правка английского меняет то, что уедет.
    дописать(с, EN, 'Second English edit.');

    const исход = await опубликовать(RU, false, ход(сОбрывом, []), 'всем', [RU, EN]);

    expect(исход.вид).toBe('готово');
    expect(await наСайте(с, EN)).toContain('Second English edit.');
    expect(записей(записка)).toBe(2);
  }, ЖДАТЬ_GIT * 2);

  it('запись блога: дату неоткрытому отмеченному языку ставит сервер — у обоих сегодняшний день', async () => {
    const БЛОГ_EN = 'blog/proba/index.mdx';
    const БЛОГ_RU = 'i18n/ru/docusaurus-plugin-content-blog/proba/index.mdx';
    const ЗАПИСЬ = '---\ntitle: "Проба"\nslug: proba\ndescription: "Про пробу."\nauthors: [ivan]\n---\n\nТекст записи.\n';
    const с = await среда({файлы: {[EN]: СТАТЬЯ, [БЛОГ_EN]: ЗАПИСЬ, [БЛОГ_RU]: ЗАПИСЬ}, вКоммите: [EN]});
    const сейчас = new Date();
    const два = (число) => String(число).padStart(2, '0');
    const сегодня = `${сейчас.getFullYear()}-${два(сейчас.getMonth() + 1)}-${два(сейчас.getDate())}`;

    const исход = await опубликовать(БЛОГ_RU, false, ход(дверь(с, []), [], поставитьДатуВФайл(с.repo, БЛОГ_RU)), 'всем', [БЛОГ_RU, БЛОГ_EN]);

    expect(исход.вид).toBe('готово');
    expect(await наСайте(с, БЛОГ_RU)).toMatch(new RegExp(`^date: ${сегодня}$`, 'm'));
    expect(await наСайте(с, БЛОГ_EN)).toMatch(new RegExp(`^date: ${сегодня}$`, 'm'));
  }, ЖДАТЬ_GIT * 2);
});
