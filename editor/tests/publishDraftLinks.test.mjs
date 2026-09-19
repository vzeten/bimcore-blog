// Имя каждого теста повторяет формулировку правила.
//
// «Недоступно» у опубликованной версии убирает её страницу, поэтому ссылки на неё в этом языке
// убираются той же публикацией (правило ВК, решение владельца 2026-09-18, п.7), а после отправки — и
// на компьютере: в файлах и в подтверждённых черновиках соседей (добавка ВК к этапу 2). Ход окна
// разговаривает с настоящими ручками, те — с настоящим git и учебным «сервером сайта».
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {опубликовать} from '../src/ui/publishRun';
import {fingerprint, loadDraft, saveDraft} from '../src/adapters/draftStore.mjs';
import {newDraft} from '../src/core/drafts.mjs';
import {splitArticle} from '../src/core/articleFile.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {EN, ES, RU, НАСТРОЙКИ, СТАТЬЯ, дверь, наСервере, среда, убратьПесочницы, ход} from './runHarness.mjs';

afterEach(() => убратьПесочницы());

const СОСЕД_RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/other/index.mdx';
const СОСЕД_EN = 'docs/lessons/other/index.mdx';
const сосед = (текст) => `---\ntitle: "Другая"\nslug: /lessons/other\ndescription: "Другая."\n---\n\n${текст}\n`;
const ФАЙЛЫ = {
  [RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ,
  [СОСЕД_RU]: сосед('См. [пробу](/lessons/proba/) рядом.'),
  [СОСЕД_EN]: сосед('See [proba](/lessons/proba/) nearby.'),
};
const сайт = async (с, rel) => с.git.raw(['show', `${await наСервере(с.сервер)}:${rel}`]);
/** Как окно ставит «Недоступно»: поле `draft` ложится в шапку и уходит обычным сохранением. */
const недоступно = (с) => async () => {
  const полный = path.join(с.repo, RU);
  fs.writeFileSync(полный, fs.readFileSync(полный, 'utf8').replace('---\n\n', 'draft: true\n---\n\n'), 'utf8');
  return true;
};

describe('«Недоступно» у опубликованной версии', () => {
  it('ссылки на неё уходят той же публикацией, на сайте и на компьютере; другие языки не тронуты', async () => {
    const с = await среда({файлы: ФАЙЛЫ});
    // Подтверждённый черновик соседа: работа человека, принятая сервером, но не записанная в файл.
    const файлСоседа = fs.readFileSync(path.join(с.repo, СОСЕД_RU), 'utf8');
    const {frontmatterRaw, body} = splitArticle(файлСоседа);
    saveDraft(с.repo, НАСТРОЙКИ, newDraft({
      path: СОСЕД_RU, frontmatterRaw, body: `${body}Своя новая строка.\n`, отпечатокБазы: fingerprint(файлСоседа),
      когда: new Date().toISOString(), база: {frontmatterRaw, body},
    }));
    const записка = [];

    const исход = await опубликовать(RU, false, ход(дверь(с, записка), [], undefined, undefined, недоступно(с)), 'недоступно');

    expect(исход.вид).toBe('готово');
    expect(исход.ссылкиНеУбраны).toEqual([]);
    expect(await сайт(с, RU)).toContain('draft: true');
    expect(await сайт(с, СОСЕД_RU)).toBe(сосед('См. пробу рядом.'));
    // Английская страница жива: ссылка на неё из английского соседа остаётся.
    expect(await сайт(с, СОСЕД_EN)).toBe(ФАЙЛЫ[СОСЕД_EN]);
    // На компьютере — то же, и черновик соседа не вернёт ссылку при следующем сохранении.
    expect(fs.readFileSync(path.join(с.repo, СОСЕД_RU), 'utf8')).toBe(сосед('См. пробу рядом.'));
    const черновик = loadDraft(с.repo, НАСТРОЙКИ, СОСЕД_RU);
    expect(черновик.body).toBe('\nСм. пробу рядом.\nСвоя новая строка.\n');
    expect(черновик['отпечатокБазы']).toBe(fingerprint(сосед('См. пробу рядом.')));
    expect(записка.map((шаг) => шаг.адрес).at(-1)).toBe('/api/links/sweep');
  }, ЖДАТЬ_GIT * 2);

  it('своего файла на сайте нет, но язык показывал текст обязательного — его страница уходит, ссылки тоже', async () => {
    const с = await среда({файлы: ФАЙЛЫ, вКоммите: [EN, ES, СОСЕД_RU, СОСЕД_EN]});

    const исход = await опубликовать(RU, false, ход(дверь(с, []), [], undefined, undefined, недоступно(с)), 'недоступно');

    expect(исход.вид).toBe('готово');
    expect(await сайт(с, СОСЕД_RU)).toBe(сосед('См. пробу рядом.'));
    expect(await сайт(с, СОСЕД_EN)).toBe(ФАЙЛЫ[СОСЕД_EN]);
  }, ЖДАТЬ_GIT * 2);

  it('страницы на сайте не было вовсе — «Недоступно» ссылок не трогает и уборки не просит', async () => {
    const с = await среда({файлы: ФАЙЛЫ, вКоммите: [СОСЕД_RU, СОСЕД_EN]});
    const записка = [];

    const исход = await опубликовать(RU, false, ход(дверь(с, записка), [], undefined, undefined, недоступно(с)), 'недоступно');

    expect(исход.вид).toBe('готово');
    expect(await сайт(с, СОСЕД_RU)).toBe(ФАЙЛЫ[СОСЕД_RU]);
    expect(записка.map((шаг) => шаг.адрес)).not.toContain('/api/links/sweep');
    expect(fs.readFileSync(path.join(с.repo, СОСЕД_RU), 'utf8')).toBe(ФАЙЛЫ[СОСЕД_RU]);
  }, ЖДАТЬ_GIT * 2);

  it('«Недоступно» вместе со сменой адреса: ссылки на живой прежний адрес убраны в коммите и на диске', async () => {
    const с = await среда({файлы: ФАЙЛЫ});
    // Человек сменил адрес русской версии и сделал её недоступной одной публикацией.
    const полный = path.join(с.repo, RU);
    fs.writeFileSync(полный, СТАТЬЯ.replace('slug: /lessons/proba', 'slug: /lessons/proba-new'), 'utf8');

    const исход = await опубликовать(RU, false, ход(дверь(с, []), [], undefined, undefined, недоступно(с)), 'недоступно');

    expect(исход.вид).toBe('готово');
    expect(await сайт(с, RU)).toContain('draft: true');
    expect(await сайт(с, СОСЕД_RU)).toBe(сосед('См. пробу рядом.'));
    expect(fs.readFileSync(path.join(с.repo, СОСЕД_RU), 'utf8')).toBe(сосед('См. пробу рядом.'));
    expect(await сайт(с, СОСЕД_EN)).toBe(ФАЙЛЫ[СОСЕД_EN]);
  }, ЖДАТЬ_GIT * 2);

  it('адрес сменён без «Недоступно», а на прежний ссылается другая статья — быстрая проверка останавливает публикацию', async () => {
    const с = await среда({файлы: ФАЙЛЫ});
    for (const rel of [EN, RU, ES]) {
      fs.writeFileSync(path.join(с.repo, rel), СТАТЬЯ.replace('slug: /lessons/proba', 'slug: /lessons/proba-new'), 'utf8');
    }
    const было = await наСервере(с.сервер);

    const исход = await опубликовать(EN, false, ход(дверь(с, []), []), 'всем', [EN, RU, ES]);

    expect(исход.вид).toBe('остановка');
    expect(исход.находки.map((н) => [н.код, н.путь].join(':')).sort()).toEqual([`ссылкаНаУшедшуюСтраницу:${СОСЕД_EN}`, `ссылкаНаУшедшуюСтраницу:${СОСЕД_RU}`]);
    expect(await наСервере(с.сервер)).toBe(было);
  }, ЖДАТЬ_GIT * 2);

  it('уборка на диске — тем же правилом, что план: английская ушла, у русского своего файла нет ни до, ни после — ссылки на русский адрес убираются и на диске', async () => {
    // Русского файла нет ни на сайте, ни у человека: под русским адресом сайт показывал английский текст.
    const с = await среда({файлы: {[EN]: СТАТЬЯ, [ES]: СТАТЬЯ, [СОСЕД_RU]: ФАЙЛЫ[СОСЕД_RU], [СОСЕД_EN]: ФАЙЛЫ[СОСЕД_EN]}});
    // Английская версия стала недоступной записью, сделанной мимо программы (без заглушки русского).
    fs.writeFileSync(path.join(с.repo, EN), СТАТЬЯ.replace('---\n\n', 'draft: true\n---\n\n'), 'utf8');
    await с.git.raw(['commit', '-am', 'английская недоступна']);
    await с.git.raw(['push', 'origin', 'main']);

    await дверь(с, [])('/api/links/sweep', {path: EN, толькоВерсия: true, версии: [EN]});

    expect(fs.readFileSync(path.join(с.repo, СОСЕД_RU), 'utf8')).toBe(сосед('См. пробу рядом.'));
    expect(fs.readFileSync(path.join(с.repo, СОСЕД_EN), 'utf8')).toBe(сосед('See proba nearby.'));
  }, ЖДАТЬ_GIT * 2);

  it('«Доступно всем» — обычная публикация: ни правки соседей, ни уборки', async () => {
    const с = await среда({файлы: ФАЙЛЫ});
    fs.appendFileSync(path.join(с.repo, RU), 'Новая строка.\n', 'utf8');
    const записка = [];

    const исход = await опубликовать(RU, false, ход(дверь(с, записка), []), 'всем');

    expect(исход.вид).toBe('готово');
    expect(await сайт(с, СОСЕД_RU)).toBe(ФАЙЛЫ[СОСЕД_RU]);
    expect(записка.map((шаг) => шаг.адрес)).not.toContain('/api/links/sweep');
  }, ЖДАТЬ_GIT * 2);
});
