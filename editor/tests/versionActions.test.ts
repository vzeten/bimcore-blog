// Имя каждого теста повторяет формулировку правила.
// Действия ленты версий и просмотра версии — без React: успех зовёт ok, ошибка зовёт fail,
// поздний ответ не применяется. Отделено от actions.test.ts, чтобы файл держался в пределе (SPEC 4.9).
import {describe, expect, it, vi} from 'vitest';
import {loadArticle, loadSessions, openVersion} from '../src/ui/actions';
describe('открытие статьи', () => {
  it('поздний ответ открытия не подменяет уже открытую статью', async () => {
    // Открыли A, следом B: ответ A иначе вернул бы окно к A, и правки ушли бы в её черновик.
    const request = vi.fn().mockResolvedValue({path: 'docs/a/index.mdx', body: 'A'});
    const ok = vi.fn();
    const fail = vi.fn();

    await loadArticle('docs/a/index.mdx', {ok, fail, актуально: () => false}, request as never);

    expect(ok).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });

  it('статья не открылась — причина показывается, окно не подменяется', async () => {
    const request = vi.fn().mockRejectedValue(new Error('нет такой статьи'));
    const ok = vi.fn();
    const fail = vi.fn();

    await loadArticle('docs/нет/index.mdx', {ok, fail}, request as never);

    expect(ok).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith('нет такой статьи');
  });
});

describe('лента версий', () => {
  it('поздний ответ ленты по прошлой статье не подменяет открытую', async () => {
    // Ушли в другую статью, пока лента грузилась: чужие версии показывать нельзя.
    const request = vi.fn().mockResolvedValue({сеансы: [{author: 'я'}]});
    const ok = vi.fn();

    await loadSessions('docs/a/index.mdx', {ok, fail: vi.fn(), актуально: () => false}, request as never);

    expect(ok).not.toHaveBeenCalled();
  });

  it('лента не загрузилась — причина показывается, а не пустая полоса молча', async () => {
    const request = vi.fn().mockRejectedValue(new Error('нет такой статьи'));
    const fail = vi.fn();

    await loadSessions('docs/a/index.mdx', {ok: vi.fn(), fail}, request as never);

    expect(fail).toHaveBeenCalledWith('нет такой статьи');
  });
});

describe('просмотр версии', () => {
  const версия = {path: 'docs/a/index.mdx', имя: '2026-08-04T10-00-00-000Z__я.mdx'};
  const снимок = {frontmatterRaw: 'title: Старое', body: 'старый текст'};

  it('просмотр версии не шлёт пишущих запросов, кроме дописывания уже набранной правки', async () => {
    // Дописывание — завершение действия человека, а не новое действие просмотра: оно уходит
    // до запроса и через свой обработчик. Сам просмотр не сохраняет и не меняет видимость.
    const адреса: string[] = [];
    const request = vi.fn().mockImplementation((адрес: string) => {
      адреса.push(адрес);
      return Promise.resolve(снимок);
    });

    await openVersion(версия, {ok: vi.fn(), fail: vi.fn(), доЗапроса: () => true}, request as never);

    expect(адреса).toHaveLength(1);
    expect(адреса[0].startsWith('/api/version?')).toBe(true);
    for (const пишущий of ['/api/article/save', '/api/visibility', '/api/asset']) {
      expect(адреса.some((адрес) => адрес.includes(пишущий))).toBe(false);
    }
  });

  it('ждущую правку записать не удалось — просмотр не начинается и запроса нет', async () => {
    // Бросать незаписанную работу ради чтения старой версии нельзя: сохранение в просмотре заперто.
    const request = vi.fn();

    const начался = await openVersion(версия, {
      ok: vi.fn(), fail: vi.fn(), доЗапроса: async () => false,
    }, request as never);

    expect(начался).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('ждущая правка дописывается до запроса, а не после ответа', async () => {
    // Иначе таймер, заведённый до просмотра, допишет черновик уже во время чтения старой версии.
    const порядок: string[] = [];
    const request = vi.fn().mockImplementation(() => {
      порядок.push('запрос');
      return Promise.resolve(снимок);
    });

    await openVersion(версия, {
      ok: vi.fn(),
      fail: vi.fn(),
      доЗапроса: () => {
        порядок.push('дописывание черновика');
        return true;
      },
    }, request as never);

    expect(порядок).toEqual(['дописывание черновика', 'запрос']);
  });

  it('поздний ответ по прошлой версии не подменяет открытое сейчас', async () => {
    const request = vi.fn().mockResolvedValue(снимок);
    const ok = vi.fn();

    await openVersion(версия, {ok, fail: vi.fn(), актуально: () => false}, request as never);

    expect(ok).not.toHaveBeenCalled();
  });

  it('версия не открылась — причина показывается, содержимое не подменяется', async () => {
    const request = vi.fn().mockRejectedValue(new Error('нет такой версии статьи'));
    const ok = vi.fn();
    const fail = vi.fn();

    await openVersion(версия, {ok, fail}, request as never);

    expect(ok).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith('нет такой версии статьи');
  });

  it('имя версии уезжает в запрос закодированным, а не как есть', async () => {
    const адреса: string[] = [];
    const request = vi.fn().mockImplementation((адрес: string) => {
      адреса.push(адрес);
      return Promise.resolve(снимок);
    });

    await openVersion({path: 'docs/a/index.mdx', имя: '../секрет.mdx'}, {ok: vi.fn(), fail: vi.fn()}, request as never);

    expect(адреса[0]).not.toContain('../');
  });
});
