// Имя каждого теста повторяет формулировку правила.
// Действия удаления и корзины в окне: два захода одним адресом, отказ не выдаётся за успех,
// перечень уже стёртого и конфликтов доходит вместе с причиной.
import {describe, expect, it, vi} from 'vitest';
import {deleteArticle} from '../src/ui/actions';
import {trashRestore} from '../src/ui/trashActions';

const ПУТЬ = 'editor/sandbox/proba/index.mdx';

describe('удаление статьи из окна', () => {
  it('без подтверждения уходит только путь: сервер называет режим и ничего не трогает', async () => {
    const request = vi.fn().mockResolvedValue({режим: 'корзина', пути: [ПУТЬ], языки: ['ru'], дней: 30});
    const ok = vi.fn();

    await deleteArticle(ПУТЬ, null, {ok, fail: vi.fn()}, request as never);

    expect(ok).toHaveBeenCalledWith({режим: 'корзина', пути: [ПУТЬ], языки: ['ru'], дней: 30});
    expect(request.mock.calls[0][0]).toBe('/api/article/delete');
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({path: ПУТЬ});
  });

  it('с подтверждением уходит именно названный режим, успех доносит список удалённого', async () => {
    const request = vi.fn().mockResolvedValue({удалено: [ПУТЬ], режим: 'навсегда'});
    const ok = vi.fn();

    await deleteArticle(ПУТЬ, 'навсегда', {ok, fail: vi.fn()}, request as never);

    expect(ok).toHaveBeenCalledWith({удалено: [ПУТЬ], режим: 'навсегда'});
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({path: ПУТЬ, подтверждено: 'навсегда'});
  });

  it('предупреждения сервера доходят вместе с успехом', async () => {
    const request = vi.fn().mockResolvedValue({удалено: [ПУТЬ], режим: 'навсегда', предупреждения: ['остались черновики']});
    const ok = vi.fn();

    await deleteArticle(ПУТЬ, 'навсегда', {ok, fail: vi.fn()}, request as never);

    expect(ok.mock.calls[0][0].предупреждения).toEqual(['остались черновики']);
  });

  it('отказ сервера не выдаётся за успех', async () => {
    const request = vi.fn().mockRejectedValue(new Error('режим сменился'));
    const ok = vi.fn();
    const fail = vi.fn();

    await deleteArticle(ПУТЬ, 'навсегда', {ok, fail}, request as never);

    expect(ok).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith('режим сменился', []);
  });

  it('сбой посреди удаления доносит перечень того, что уже исчезло', async () => {
    const ошибка = Object.assign(new Error('удалилось не всё'), {
      ответ: {причина: 'удалилосьНеВсё', стёрто: [ПУТЬ, 'editor/sandbox/proba/img-01.png']},
    });
    const fail = vi.fn();

    await deleteArticle(ПУТЬ, 'навсегда', {ok: vi.fn(), fail}, vi.fn().mockRejectedValue(ошибка) as never);

    expect(fail).toHaveBeenCalledWith('удалилось не всё', [ПУТЬ, 'editor/sandbox/proba/img-01.png']);
  });

  it('ответа с перечнем нет — вместо него пустой список, а не поломка', async () => {
    const fail = vi.fn();

    await deleteArticle(ПУТЬ, 'навсегда', {ok: vi.fn(), fail}, vi.fn().mockRejectedValue('сервер не отвечает') as never);

    expect(fail.mock.calls[0][1]).toEqual([]);
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
