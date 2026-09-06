// Имя каждого теста повторяет формулировку правила.
// Ручка записи статьи проверяется на НАСТОЯЩЕМ git с настоящим удалённым: это единственное место
// программы, которое создаёт публикационный коммит, и подставной git тут не доказал бы ничего.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {запомнитьСборку, зелёнаяСборка} from '../src/adapters/buildMemory.mjs';
import {прочитатьОчередь} from '../src/adapters/commitQueue.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {
  EN, ES, RU, СТАТЬЯ, запрос, наСервере, сборщик, снимокРепозитория, среда, убратьПесочницы, файлыКоммита,
} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

afterEach(() => {
  запомнитьСборку(null);
  убратьПесочницы();
});

/** Пройти сборку так же, как её проходит человек: через ручку, с подставным сборщиком. */
const собрать = (место, rel = RU) => запрос(releaseRoute, место, '/api/release/build', {path: rel}, {запуск: сборщик()});
const записать = (место, тело) => запрос(publishRoute, место, '/api/publish/commit', тело);
const голова = async ({git}) => (await git.raw(['rev-parse', 'HEAD'])).trim();

describe('ручка записи статьи', () => {
  it('после зелёной сборки в коммит уезжает ровно открытая версия, а родитель коммита — сайт', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);

    const {status, payload} = await записать(место, {path: RU, подтверждено: true});

    expect(status).toBe(200);
    expect(payload.коммит).toMatch(/^[0-9a-f]{7}$/);
    expect(await файлыКоммита(место, payload.sha)).toEqual([RU]);
    expect((await место.git.raw(['rev-parse', `${payload.sha}^`])).trim()).toBe(место.основа);
    expect(await наСервере(место)).toBe(место.основа);
  });

  it('запись не меняет ни ветку, ни HEAD, ни индекс, ни рабочие файлы, ни местную main', async () => {
    const место = await среда(undefined, {ветка: 'feature/proba'});
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    место.положить('editor/src/что-то.mjs', 'код редактора\n');
    место.положить('ЧУЖОЕ.md', 'чужая работа\n');
    await место.git.raw(['add', '--', 'ЧУЖОЕ.md']);
    await собрать(место);
    const было = await снимокРепозитория(место);

    const {status, payload} = await записать(место, {path: RU, подтверждено: true});

    expect(status).toBe(200);
    expect(await снимокРепозитория(место)).toEqual(было);
    expect(было.ветка).toBe('feature/proba');
    expect(await файлыКоммита(место, payload.sha)).toEqual([RU]);
  });

  it('коммит помечается своим вместе с основой: без этой записи отправлять его было бы нечем', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);

    const {payload} = await записать(место, {path: RU, подтверждено: true});
    const очередь = прочитатьОчередь(место.editorDir, {хранение: {папкаПубликаций: '.publish'}});

    expect(очередь.записи.map((запись) => запись.sha)).toEqual([payload.sha]);
    expect(очередь.записи[0].состояние).toBe('сделан');
    expect(очередь.записи[0].пути).toEqual([RU]);
    expect(очередь.записи[0].основа).toBe(место.основа);
  });

  it('начатый человеком перевод соседа не уезжает и на диске не меняется', async () => {
    const начатый = '---\ntitle: "Prueba"\ndescription: "Mi"\n---\n\nMi trabajo a la mitad.\n';
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: начатый}, {вКоммите: [RU, EN]});
    await собрать(место);

    const {status, payload} = await записать(место, {path: RU, подтверждено: true});
    const уехало = await файлыКоммита(место, payload.sha);

    expect(status).toBe(200);
    // Испанский файл в коммите есть — но это ЗАГЛУШКА, а не работа человека.
    expect(уехало).toContain(ES);
    expect(await место.git.raw(['show', `${payload.sha}:${ES}`])).not.toContain('Mi trabajo');
    // А на диске у человека его текст цел до байта.
    expect(fs.readFileSync(path.join(место.repo, ES), 'utf8')).toBe(начатый);
  });

  it('языка не было ни на сайте, ни на диске — заглушка ложится в коммит, а на диск человека нет', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    await собрать(место);
    const было = await снимокРепозитория(место);

    const {payload} = await записать(место, {path: RU, подтверждено: true});

    expect(await файлыКоммита(место, payload.sha)).toContain(ES);
    // Диск принадлежит ветке человека, а не сайту: рабочее дерево осталось прежним.
    expect(fs.existsSync(path.join(место.repo, ES))).toBe(false);
    expect(await снимокРепозитория(место)).toEqual(было);
  });

  it('без подтверждения человека записи не бывает', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);

    const {status} = await записать(место, {path: RU});

    expect(status).toBe(400);
    expect(прочитатьОчередь(место.editorDir, {хранение: {папкаПубликаций: '.publish'}}).записи).toEqual([]);
  });

  it('без зелёной сборки записи не бывает', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);

    const {status, payload} = await записать(место, {path: RU, подтверждено: true});

    expect(status).toBe(409);
    expect(payload.код).toBe('нетЗелёнойСборки');
  });

  it('статья изменилась после сборки — записи нет: сборка отвечала за прежний текст', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    место.положить(RU, `${СТАТЬЯ}Совсем другая строка.\n`);

    const {payload} = await записать(место, {path: RU, подтверждено: true});

    expect(payload.код).toBe('статьяИзменилась');
    expect(прочитатьОчередь(место.editorDir, {хранение: {папкаПубликаций: '.publish'}}).записи).toEqual([]);
  });

  it('репозиторий на другой ветке — запись идёт так же: ветку программа не спрашивает', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    await место.git.raw(['checkout', '-b', 'другая']);

    const {status, payload} = await записать(место, {path: RU, подтверждено: true});

    expect(status).toBe(200);
    expect(await файлыКоммита(место, payload.sha)).toEqual([RU]);
    expect((await место.git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()).toBe('другая');
  });

  it('чужая работа в индексе записи не мешает, в коммит не попадает и не трогается', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    место.положить('ЧУЖОЕ.md', 'чужая работа\n');
    await место.git.raw(['add', '--', 'ЧУЖОЕ.md']);

    const {status, payload} = await записать(место, {path: RU, подтверждено: true});

    expect(status).toBe(200);
    expect(await файлыКоммита(место, payload.sha)).toEqual([RU]);
    expect((await место.git.raw(['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only'])).trim()).toBe('ЧУЖОЕ.md');
    expect(fs.readFileSync(path.join(место.repo, 'ЧУЖОЕ.md'), 'utf8')).toBe('чужая работа\n');
  });

  it('план не доказан — записи нет', async () => {
    const место = await среда({
      [RU]: СТАТЬЯ,
      [EN]: СТАТЬЯ,
      [ES]: СТАТЬЯ,
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/сосед.mdx': СТАТЬЯ,
    });
    запомнитьСборку({путь: RU, отпечаток: 'что угодно', основа: место.основа, дерево: 'x'});

    const {payload} = await записать(место, {path: RU, подтверждено: true});

    expect(payload.код).toBe('составНеДоказан');
    expect(await голова(место)).toBe(место.основа);
  });

  it('картинки статьи, включая вложенную папку, уезжают вместе с ней', async () => {
    const папка = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba';
    const место = await среда(
      {[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ, [`${папка}/cover.png`]: 'обложка', [`${папка}/img/один.jpg`]: 'картинка'},
      {вКоммите: [RU, EN, ES]},
    );
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);

    const {payload} = await записать(место, {path: RU, подтверждено: true});

    expect(await файлыКоммита(место, payload.sha)).toEqual([`${папка}/cover.png`, `${папка}/img/один.jpg`, RU].sort());
  });

  it('рабочие файлы при отказе не трогаются', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    const было = await снимокРепозитория(место);

    await записать(место, {path: RU, подтверждено: true});

    expect(fs.readFileSync(path.join(место.repo, RU), 'utf8')).toBe(`${СТАТЬЯ}Новая строка.\n`);
    expect(await снимокРепозитория(место)).toEqual(было);
  });

  it('после записи зелёная сборка израсходована: вторая запись требует новой', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    await записать(место, {path: RU, подтверждено: true});

    expect(зелёнаяСборка()).toBe(null);
    место.положить(RU, `${СТАТЬЯ}Ещё строка.\n`);
    expect((await записать(место, {path: RU, подтверждено: true})).payload.код).toBe('естьНеотправленное');
  });
});

// Публикация умеет не только добавлять. Без этого удалённая человеком картинка осталась бы на сайте
// навсегда, а переименованная лежала бы там дважды — под старым именем и под новым.
describe('пропавшие файлы уходят и с сайта', () => {
  const ПАПКА = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba';
  const ОБЛОЖКА = `${ПАПКА}/cover.png`;
  const НОВАЯ = `${ПАПКА}/обложка.png`;

  const сОбложкой = () => среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ, [ОБЛОЖКА]: 'картинка'});
  /** Что лежит по пути в названном коммите: так будет выглядеть сайт после отправки. */
  const вКоммите = async ({git}, sha, rel) => (await git.raw([
    '-c', 'core.quotepath=false', '--literal-pathspecs', 'ls-tree', '--name-only', sha, '--', rel,
  ])).trim();

  it('картинку удалили у себя — коммит убирает её и с сайта', async () => {
    const место = await сОбложкой();
    fs.rmSync(path.join(место.repo, ОБЛОЖКА));
    await собрать(место);

    const {status, payload} = await записать(место, {path: RU, подтверждено: true});

    expect(status).toBe(200);
    expect(await файлыКоммита(место, payload.sha)).toEqual([ОБЛОЖКА]);
    expect(await вКоммите(место, payload.sha, ОБЛОЖКА)).toBe('');
  });

  it('убранное записывается своим: иначе отправить такой коммит было бы нечем', async () => {
    const место = await сОбложкой();
    fs.rmSync(path.join(место.repo, ОБЛОЖКА));
    await собрать(место);

    await записать(место, {path: RU, подтверждено: true});
    const очередь = прочитатьОчередь(место.editorDir, {хранение: {папкаПубликаций: '.publish'}});

    expect(очередь.записи[0].удалённые).toEqual([ОБЛОЖКА]);
    expect(очередь.записи[0].созданные).toEqual([]);
  });

  it('картинку переименовали — на сайте остаётся только новое имя', async () => {
    const место = await сОбложкой();
    fs.rmSync(path.join(место.repo, ОБЛОЖКА));
    место.положить(НОВАЯ, 'картинка');
    await собрать(место);

    const {status, payload} = await записать(место, {path: RU, подтверждено: true});

    expect(status).toBe(200);
    expect(await вКоммите(место, payload.sha, ОБЛОЖКА)).toBe('');
    expect(await вКоммите(место, payload.sha, НОВАЯ)).toContain(НОВАЯ);
  });

  it('чужая статья в той же папке сайта — публикация останавливается, и ничего не трогается', async () => {
    const чужая = `${ПАПКА}/вторая.mdx`;
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ, [ОБЛОЖКА]: 'картинка', [чужая]: СТАТЬЯ});
    // Чужая статья и общая картинка есть на сайте, у человека их нет: чьи это файлы — по путям не
    // видно. Промолчи программа — она выпустила бы статью, оставив на сайте чужое, и не сказала бы.
    fs.rmSync(path.join(место.repo, чужая));
    fs.rmSync(path.join(место.repo, ОБЛОЖКА));
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);

    const {status, payload} = await записать(место, {path: RU, подтверждено: true});

    expect(status).toBe(409);
    expect(payload.код).toBe('составНеДоказан');
    expect(payload.разрывы.map((разрыв) => разрыв.причина)).toEqual(['папкаНеОдна']);
    expect(прочитатьОчередь(место.editorDir, {хранение: {папкаПубликаций: '.publish'}}).записи).toEqual([]);
    expect(await вКоммите(место, место.основа, ОБЛОЖКА)).toContain(ОБЛОЖКА);
  });

  it('на диске всё на месте — с сайта не уходит ничего', async () => {
    const место = await сОбложкой();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);

    const {payload} = await записать(место, {path: RU, подтверждено: true});

    expect(await файлыКоммита(место, payload.sha)).toEqual([RU]);
    expect(await вКоммите(место, payload.sha, ОБЛОЖКА)).toContain(ОБЛОЖКА);
  });
});
