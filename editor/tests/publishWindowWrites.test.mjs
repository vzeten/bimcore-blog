// Имя каждого теста повторяет формулировку правила.
//
// Несколько записей окна подряд в одном ходе публикации: доступность, дата блога, обложка. Ход
// держит обработчики окна с того мгновения, когда человек нажал «Опубликовать» (`usePublish`), и
// вторая запись шла с отпечатком файла ДО первой: сервер видел «файл изменён снаружи», а публикация
// кончалась «Не удалось сохранить изменения» (проба владельца 2026-09-21, editor@8af639e2).
//
// Проверяется сквозь настоящее: ход публикации (`publishRun`) → настоящее сохранение окна
// (`useSaving`), созданное ОДИН раз, как его и держит ход, → настоящая ручка записи на диске.
// Подставлены только ответы публикации про дату и обложку: какая запись нужна, решает не этот
// набор. После записей ход останавливается подставной находкой — дальше диска он не идёт.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {useSaving} from '../src/ui/useSaving';
import {проверить} from '../src/ui/publishRun';
import {saveRoute} from '../src/adapters/saveRoute.mjs';
import {fingerprint} from '../src/adapters/draftStore.mjs';
import {splitArticle} from '../src/core/articleFile.mjs';
import {ЖДАТЬ_GIT, НАСТРОЙКИ, RU, подготовить, прочитать, статья, убратьПесочницы} from './saveHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT});

afterEach(() => {
  vi.unstubAllGlobals();
  убратьПесочницы();
});

/** Статья пробы: скрыта, с одной картинкой в теле и пустой обложкой — как у владельца. */
const ШАПКА = 'title: "Проба"\nslug: /lessons/a\ndescription: "Про пробу."\nunlisted: true';
const ТЕЛО = '\n![Схема](./img-01.png)\n';
const ДАТА = '2026-09-21';
const ОБЛОЖКА = './cover.png';

/**
 * Окно одной статьи: настоящее `useSaving`, созданное один раз. Именно так его видит ход
 * публикации — обработчики с мгновения нажатия, со статьёй того мгновения. Запросы окна к
 * `/api/article/save` уходят в настоящую ручку.
 */
async function окно() {
  // В опубликованной ветке лежит другое: базу по ней сервер не докажет, как у свежей правки.
  const среда = await подготовить({[RU]: статья('title: "Было"', '\nстарый текст\n')});
  const сырой = статья(ШАПКА, ТЕЛО);
  fs.writeFileSync(path.join(среда.repo, RU), сырой, 'utf8');
  const {frontmatterRaw, body} = splitArticle(сырой);

  vi.stubGlobal('fetch', async (адрес, init) => {
    const ответы = [];
    await saveRoute({
      req: {method: 'POST'}, res: {}, url: {pathname: адрес}, repo: среда.repo, settings: НАСТРОЙКИ, git: среда.git,
      тело: async () => JSON.parse(init.body), insideRepo: () => true,
      send: (res, code, data) => ответы.push({code, data}),
      фиксировать: async () => undefined, publishedRef: () => 'HEAD', последняяПравка: new Map(),
    });
    const {code, data} = ответы[0];
    return {ok: code >= 200 && code < 300, status: code, json: async () => data};
  });

  const текстСейчас = {current: body};
  const шапкаСейчас = {current: frontmatterRaw};
  let статьяОкна = {path: RU, frontmatterRaw, body, отпечаток: fingerprint(сырой), published: null};
  const {save} = useSaving({
    article: статьяОкна, settings: НАСТРОЙКИ, fields: [], текстСейчас, шапкаСейчас,
    статьяСейчас: {current: RU}, открытие: {current: 1},
    последняяЗапись: {current: null},
    автосохранение: {запланировать: () => undefined, отменить: () => undefined, метка: () => new Date().toISOString()},
    // Статья в состоянии окна двигается, но обработчик хода этого не видит — как в живом окне.
    setArticle: (дело) => { статьяОкна = typeof дело === 'function' ? дело(статьяОкна) : дело; },
    setDirty: () => undefined, setОшибка: () => undefined, setСпор: () => undefined, setСостояние: () => undefined,
    refresh: async () => undefined, сПричиной: (ключ, причина) => `${ключ}: ${причина}`, вЧерновик: () => undefined,
    положитьЗаписанное: () => undefined, послеЗаписи: () => undefined,
  });

  /** Правка строки шапки окна и запись тем же сохранением — как у App. */
  const записать = (правка) => async () => {
    шапкаСейчас.current = правка(шапкаСейчас.current);
    return save();
  };

  return {среда, save, записать};
}

/** Ход публикации: записи окна настоящие, ответы про дату и обложку — заданные набором. */
function ход({save, записать}, {дата, снаружи = () => undefined}) {
  return {
    запрос: async (адрес) => {
      if (адрес === '/api/publish/date') return {path: RU, нужна: дата, вФайле: null};
      if (адрес === '/api/publish/cover') {
        снаружи();
        return {path: RU, нужна: ОБЛОЖКА, создана: true, предупреждение: null};
      }
      // Записи окна кончились: ход останавливается находкой, до сервера публикации он не идёт.
      if (адрес === '/api/prepare') return {path: RU, находки: [{код: 'стоп', уровень: 'блокер', этап: 'проба'}], прошла: false, невыполненные: [], отпечаток: 'x'};
      throw new Error(`не ждали запроса ${адрес}`);
    },
    сохранить: save,
    поставитьДоступность: записать((шапка) => шапка.replace(/\nunlisted: true/, '')),
    поставитьДату: (значение) => записать((шапка) => `${шапка}\ndate: ${значение}`)(),
    поставитьОбложку: (адрес) => записать((шапка) => `${шапка}\nimage: ${адрес}`)(),
    шаг: () => undefined,
    жива: () => true,
  };
}

/** Что лежит в шапке файла после хода. */
const шапкаФайла = (среда) => splitArticle(прочитать(среда, RU)).frontmatterRaw;

describe('несколько записей окна подряд в одном ходе публикации', () => {
  it('доступность и обложка — обе записи ложатся, ход идёт дальше', async () => {
    const о = await окно();

    const исход = await проверить(RU, false, ход(о, {дата: null}), 'всем');

    expect(исход).toMatchObject({вид: 'остановка', ключ: 'естьПрепятствия'});
    expect(шапкаФайла(о.среда)).not.toContain('unlisted');
    expect(шапкаФайла(о.среда)).toContain(`image: ${ОБЛОЖКА}`);
  });

  it('дата и обложка — обе записи ложатся, ход идёт дальше', async () => {
    const о = await окно();

    const исход = await проверить(RU, false, ход(о, {дата: ДАТА}), null);

    expect(исход).toMatchObject({вид: 'остановка', ключ: 'естьПрепятствия'});
    expect(шапкаФайла(о.среда)).toContain(`date: ${ДАТА}`);
    expect(шапкаФайла(о.среда)).toContain(`image: ${ОБЛОЖКА}`);
  });

  it('доступность, дата и обложка — все три записи ложатся, ход идёт дальше', async () => {
    const о = await окно();

    const исход = await проверить(RU, false, ход(о, {дата: ДАТА}), 'всем');

    expect(исход).toMatchObject({вид: 'остановка', ключ: 'естьПрепятствия'});
    const шапка = шапкаФайла(о.среда);
    expect(шапка).not.toContain('unlisted');
    expect(шапка).toContain(`date: ${ДАТА}`);
    expect(шапка).toContain(`image: ${ОБЛОЖКА}`);
  });
  it('правка снаружи между двумя записями окна не теряется: защита от внешней правки на месте', async () => {
    const о = await окно();
    const чужое = 'Строка, дописанная другим редактором.';
    // Первая запись окна (доступность) уже легла; ровно между ней и обложкой файл правят снаружи.
    const снаружи = () => fs.appendFileSync(path.join(о.среда.repo, RU), `
${чужое}
`, 'utf8');

    await проверить(RU, false, ход(о, {дата: null, снаружи}), 'всем');

    // Сервер обязан был увидеть расхождение: свести стороны или отказать — но не стереть чужое.
    expect(прочитать(о.среда, RU)).toContain(чужое);
  });
});
