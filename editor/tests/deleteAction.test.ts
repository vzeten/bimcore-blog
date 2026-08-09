// Имя каждого теста повторяет формулировку правила.
// Действие удаления в окне: успех, отказ и перечень уже стёртого при сбое посреди удаления.
// Отдельно от actions.test.ts, чтобы файл держался в пределе размера (SPEC 4.9).
import {describe, expect, it, vi} from 'vitest';
import {deleteArticle} from '../src/ui/actions';

const ПУТЬ = 'editor/sandbox/proba/index.mdx';

describe('удаление статьи из окна', () => {
  it('успех сервера доносит список удалённого', async () => {
    const request = vi.fn().mockResolvedValue({удалено: [ПУТЬ]});
    const ok = vi.fn();

    await deleteArticle(ПУТЬ, {ok, fail: vi.fn()}, request as never);

    expect(ok).toHaveBeenCalledWith({удалено: [ПУТЬ]});
    expect(request.mock.calls[0][0]).toBe('/api/article/delete');
  });

  it('предупреждения сервера доходят вместе с успехом', async () => {
    // Статья удалена, но её черновик или картинки могли остаться. Промолчать значит оставить
    // человеку мусор, о котором он не узнает.
    const request = vi.fn().mockResolvedValue({удалено: [ПУТЬ], предупреждения: ['остались черновики']});
    const ok = vi.fn();

    await deleteArticle(ПУТЬ, {ok, fail: vi.fn()}, request as never);

    expect(ok.mock.calls[0][0].предупреждения).toEqual(['остались черновики']);
  });

  it('отказ сервера не выдаётся за успех', async () => {
    // Статью, уже вышедшую на сайт, программа не удаляет — и делать вид, что удалила, нельзя.
    const request = vi.fn().mockRejectedValue(new Error('статья уже на сайте'));
    const ok = vi.fn();
    const fail = vi.fn();

    await deleteArticle(ПУТЬ, {ok, fail}, request as never);

    expect(ok).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith('статья уже на сайте', []);
  });

  it('сбой посреди удаления доносит перечень того, что уже исчезло', async () => {
    // В списке статей видно только статьи: про стёртые картинки человек иначе не узнает вовсе.
    const ошибка = Object.assign(new Error('удалилось не всё'), {
      ответ: {причина: 'удалилосьНеВсё', стёрто: [ПУТЬ, 'editor/sandbox/proba/img-01.png']},
    });
    const fail = vi.fn();

    await deleteArticle(ПУТЬ, {ok: vi.fn(), fail}, vi.fn().mockRejectedValue(ошибка) as never);

    expect(fail).toHaveBeenCalledWith('удалилось не всё', [ПУТЬ, 'editor/sandbox/proba/img-01.png']);
  });

  it('ответа с перечнем нет — вместо него пустой список, а не поломка', async () => {
    const fail = vi.fn();

    await deleteArticle(ПУТЬ, {ok: vi.fn(), fail}, vi.fn().mockRejectedValue('сервер не отвечает') as never);

    expect(fail.mock.calls[0][1]).toEqual([]);
  });
});
