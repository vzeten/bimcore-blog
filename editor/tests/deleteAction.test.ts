// Имя каждого теста повторяет формулировку правила.
// Ход удаления в окне и действия корзины: один вопрос до всякой записи, порядок шагов после него,
// отказ не выдаётся за успех, перечень конфликтов доходит вместе с причиной.
import {describe, expect, it, vi} from 'vitest';
import {trashDrop, trashRestore} from '../src/ui/trashActions';
import {провестиУдаление, спроситьУдаление, type ХодУдаления} from '../src/ui/retireRun';

const ПУТЬ = 'editor/sandbox/proba/index.mdx';

describe('ход удаления: один вопрос, дальше само', () => {
  /** Ход с подставным сервером: ответы по адресу, записка — что спрошено и с каким телом. */
  const ход = (ответы: Record<string, unknown>, правки: Partial<ХодУдаления> = {}) => {
    const записка: {адрес: string; тело: Record<string, unknown>}[] = [];
    const х: ХодУдаления = {
      запрос: async <T>(адрес: string, тело: Record<string, unknown>) => {
        записка.push({адрес, тело});
        const ответ = ответы[адрес];
        if (ответ instanceof Error) throw ответ;
        return (typeof ответ === 'function' ? ответ(тело) : ответ) as T;
      },
      дописать: async () => true,
      жива: () => true,
      слово: (ключ) => ключ,
      ...правки,
    };
    return {х, записка, адреса: () => записка.map((шаг) => шаг.адрес)};
  };
  const НА_САЙТЕ = {наСайте: true, статей: 2, отпечаток: 'п1'};

  it('черновик не записался — вопроса нет, сервер не спрошен', async () => {
    const {х, записка} = ход({}, {дописать: async () => false});
    expect(await спроситьУдаление(ПУТЬ, х)).toEqual({вид: 'остановка', текст: 'удалениеБезЧерновика'});
    expect(записка).toEqual([]);
  });

  it('пока дописывался черновик, окно сменилось — вопрос не задаётся', async () => {
    const {х, записка} = ход({}, {жива: () => false});
    expect(await спроситьУдаление(ПУТЬ, х)).toEqual({вид: 'прервано'});
    expect(записка).toEqual([]);
  });

  it('до вопроса только чтение: можно ли удалить и что снимется с сайта', async () => {
    const {х, адреса} = ход({'/api/article/delete': {}, '/api/retire': НА_САЙТЕ});
    expect(await спроситьУдаление(ПУТЬ, х)).toEqual({вид: 'спрашиваю', снятие: НА_САЙТЕ});
    expect(адреса()).toEqual(['/api/article/delete', '/api/retire']);
  });

  it('после «Удалить» статья с сайта: запись с согласием и отпечатком, отправка, уборка ссылок, корзина', async () => {
    const {х, записка, адреса} = ход({
      '/api/retire/commit': {sha: 'abc'}, '/api/publish/plan': {sha: 'abc'}, '/api/publish/push': {отправлено: true},
      '/api/links/sweep': {изменены: [], невосстановленные: []}, '/api/article/delete': {удалено: [ПУТЬ]},
    });
    expect(await провестиУдаление(ПУТЬ, НА_САЙТЕ, х)).toEqual({вид: 'удалено'});
    expect(адреса()).toEqual(['/api/retire/commit', '/api/publish/plan', '/api/publish/push', '/api/links/sweep', '/api/article/delete']);
    expect(записка[0].тело).toEqual({path: ПУТЬ, подтверждено: true, отпечаток: 'п1'});
    expect(записка[2].тело).toEqual({path: ПУТЬ, sha: 'abc', подтверждено: true});
    expect(записка[4].тело).toEqual({path: ПУТЬ, подтверждено: 'корзина'});
  });

  it('статьи на сайте не было — ни записи, ни отправки: уборка ссылок и корзина', async () => {
    const {х, адреса} = ход({'/api/links/sweep': {изменены: [], невосстановленные: []}, '/api/article/delete': {}});
    expect(await провестиУдаление(ПУТЬ, {наСайте: false, статей: 0, отпечаток: null}, х)).toEqual({вид: 'удалено'});
    expect(адреса()).toEqual(['/api/links/sweep', '/api/article/delete']);
  });

  it('отправка не прошла — остановка, ссылки и корзина не трогаются', async () => {
    const {х, адреса} = ход({'/api/retire/commit': {}, '/api/publish/plan': {sha: 'abc'}, '/api/publish/push': new Error('сервер ушёл вперёд')});
    expect(await провестиУдаление(ПУТЬ, НА_САЙТЕ, х)).toEqual({вид: 'остановка', текст: 'сервер ушёл вперёд'});
    expect(адреса()).not.toContain('/api/links/sweep');
    expect(адреса()).not.toContain('/api/article/delete');
  });

  it('ссылки на диске убрать не вышло — статья остаётся на месте, файлы названы', async () => {
    const {х, адреса} = ход({'/api/links/sweep': {изменены: [], невосстановленные: ['docs/a/index.mdx']}});
    expect(await провестиУдаление(ПУТЬ, {наСайте: false, статей: 0, отпечаток: null}, х))
      .toEqual({вид: 'остановка', текст: 'удалениеСсылкиНеУбраны docs/a/index.mdx'});
    expect(адреса()).not.toContain('/api/article/delete');
  });

  it('своё недосланное снятие досылается один раз, затем вопрос задаётся заново', async () => {
    let снятий = 0;
    const недослано = Object.assign(new Error('не дослано'), {ответ: {код: 'снятиеНеДослано'}});
    const {х, адреса} = ход({
      '/api/article/delete': {},
      '/api/retire': () => {
        снятий += 1;
        if (снятий === 1) throw недослано;
        return {наСайте: false, статей: 0, отпечаток: null};
      },
      '/api/publish/plan': {sha: 'abc'}, '/api/publish/push': {отправлено: true},
    });
    expect(await спроситьУдаление(ПУТЬ, х)).toMatchObject({вид: 'спрашиваю', снятие: {наСайте: false}});
    expect(адреса()).toEqual(['/api/article/delete', '/api/retire', '/api/publish/plan', '/api/publish/push', '/api/article/delete', '/api/retire']);
  });

  it('отказ сервера до вопроса доходит словами вместе с названными путями', async () => {
    const отказ = Object.assign(new Error('ссылка не разобрана:'), {ответ: {код: 'ссылкаНеРазобрана', разрывы: [{путь: 'docs/x/index.mdx'}]}});
    const {х} = ход({'/api/article/delete': {}, '/api/retire': отказ});
    expect(await спроситьУдаление(ПУТЬ, х)).toEqual({вид: 'остановка', текст: 'ссылка не разобрана: docs/x/index.mdx'});
  });
});

describe('возврат из корзины', () => {
  it('успех доносит, что вернулось; конфликт доходит с перечнем мешающих файлов', async () => {
    const ok = vi.fn();
    await trashRestore('запись', {ok, fail: vi.fn()}, vi.fn().mockResolvedValue({возвращено: [ПУТЬ]}) as never);
    expect(ok).toHaveBeenCalledWith({возвращено: [ПУТЬ]});

    const fail = vi.fn();
    const ошибка = Object.assign(new Error('конфликт'), {ответ: {причина: 'возвратКонфликт', конфликты: [ПУТЬ]}});
    await trashRestore('запись', {ok: vi.fn(), fail}, vi.fn().mockRejectedValue(ошибка) as never);
    expect(fail).toHaveBeenCalledWith('конфликт', [ПУТЬ]);
  });
});

describe('стирание записи корзины', () => {
  it('без подтверждения в запросе нет согласия, с подтверждением — есть', async () => {
    const request = vi.fn().mockResolvedValue({спрашиваю: true});

    await trashDrop('x-1', false, {ok: vi.fn(), fail: vi.fn()}, request as never);
    await trashDrop('x-1', true, {ok: vi.fn(), fail: vi.fn()}, request as never);

    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({id: 'x-1'});
    expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({id: 'x-1', подтверждено: true});
  });

  it('отказ сервера доходит словами, а не выдаётся за успех', async () => {
    const ok = vi.fn();
    const fail = vi.fn();

    await trashDrop('x-1', true, {ok, fail}, vi.fn().mockRejectedValue(new Error('запись не доведена')) as never);

    expect(ok).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith('запись не доведена');
  });
});
