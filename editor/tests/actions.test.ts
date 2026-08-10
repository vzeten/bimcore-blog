// Имя каждого теста повторяет формулировку правила.
// Проверяем поведение действий сохранения без React: успех зовёт ok, ошибка зовёт fail.
import {describe, expect, it, vi} from 'vitest';
import {autosaveDraft, saveArticle} from '../src/ui/actions';

const тело = {path: 'docs/a/index.mdx', body: 'x', frontmatterRaw: 'title: A'};

describe('сохранение статьи', () => {
  it('при ошибке сервера не подтверждает успех: ok не вызывается, dirty снимать нечем', async () => {
    const request = vi.fn().mockRejectedValue(new Error('нет такой статьи'));
    const ok = vi.fn();
    const fail = vi.fn();

    await saveArticle(тело, {ok, fail}, request as never);

    expect(ok).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith('нет такой статьи');
  });

  it('сохранение доносит до сервера метку времени правки', async () => {
    // По ней сервер отличает запоздавшее сохранение от свежего и не убирает черновик новее себя.
    const request = vi.fn().mockResolvedValue({saved: true});

    await saveArticle({...тело, правкаОт: '2026-08-05T12:00:00.000Z'}, {ok: vi.fn(), fail: vi.fn()}, request as never);

    const посланное = JSON.parse((request.mock.calls[0][1] as {body: string}).body);
    expect(посланное.правкаОт).toBe('2026-08-05T12:00:00.000Z');
  });

  it('при успехе сервера вызывает ok, чтобы снять признак несохранённого', async () => {
    const request = vi.fn().mockResolvedValue({saved: true});
    const ok = vi.fn();
    const fail = vi.fn();

    await saveArticle(тело, {ok, fail}, request as never);

    expect(ok).toHaveBeenCalledTimes(1);
    expect(fail).not.toHaveBeenCalled();
  });

  it('новая готовность версии доносится до окна вместе с ответом', async () => {
    // Правка после подготовки возвращает версию в черновик. Без ответа сервера окно показывало бы
    // «Опубликована» у статьи, которую само же вернуло в черновики, до повторного открытия.
    const request = vi.fn().mockResolvedValue({saved: true, state: {готовность: 'Черновик'}});
    const ok = vi.fn();

    await saveArticle(тело, {ok, fail: vi.fn()}, request as never);

    expect(ok.mock.calls[0][0].state).toEqual({готовность: 'Черновик'});
  });
});


describe('видимость едет обычным сохранением и только в открытой версии', () => {
  it('отдельной ручки видимости у окна нет: видимость уходит в шапке на сохранение статьи', async () => {
    // Второй двери к `unlisted` быть не должно: она писала файл мимо «Сохранить», и статус
    // после нажатия было нечем выразить.
    const request = vi.fn().mockResolvedValue({saved: true});

    await saveArticle({...тело, frontmatterRaw: 'title: A\nunlisted: true'}, {ok: vi.fn(), fail: vi.fn()}, request as never);

    expect(request).toHaveBeenCalledWith('/api/article/save', expect.anything());
    expect(request).not.toHaveBeenCalledWith('/api/visibility', expect.anything());
    const посланное = JSON.parse((request.mock.calls[0][1] as {body: string}).body);
    expect(посланное.frontmatterRaw).toContain('unlisted: true');
  });

  it('сохранение обращается ровно к одному пути — открытой языковой версии', async () => {
    // Видимость принадлежит версии (SPEC 2.8): рассказ про соседние версии из ответа убран
    // вместе с механизмом, а окно посылает один путь и ждёт запись одного файла.
    const request = vi.fn().mockResolvedValue({saved: true});

    await saveArticle({...тело, frontmatterRaw: 'title: A\nunlisted: true'}, {ok: vi.fn(), fail: vi.fn()}, request as never);

    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse((request.mock.calls[0][1] as {body: string}).body).path).toBe(тело.path);
  });

  it('при ошибке сохранения состояние не меняется: ok не вызывается, видимость остаётся прежней', async () => {
    const request = vi.fn().mockRejectedValue(new Error('нет такой статьи'));
    const ok = vi.fn();
    const fail = vi.fn();

    await saveArticle({...тело, frontmatterRaw: 'title: A\nunlisted: true'}, {ok, fail}, request as never);

    expect(ok).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith('нет такой статьи');
  });
});

describe('автосохранение черновика', () => {
  const черновик = {
    path: 'docs/a/index.mdx',
    body: 'правка',
    frontmatterRaw: 'title: A',
    отпечатокБазы: 'ОТП1',
  };

  it('сбой автосохранения не подтверждает успех: ok не вызывается, признак несохранённого остаётся', async () => {
    const request = vi.fn().mockRejectedValue(new Error('нет такой статьи'));
    const ok = vi.fn();
    const fail = vi.fn();

    await autosaveDraft(черновик, {ok, fail}, request as never);

    expect(ok).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith('нет такой статьи');
  });

  it('отклонённая как устаревшая запись не выдаётся за спасённую работу', async () => {
    // Сервер отвечает 200 с пометкой «устарел»: на диск ничего не легло, и вызывающий обязан
    // это увидеть, иначе человеку скажут «правка в черновике», а её там нет.
    const request = vi.fn().mockResolvedValue({автосохранено: null, устарел: true});
    const ok = vi.fn();

    await autosaveDraft(черновик, {ok, fail: vi.fn()}, request as never);

    expect(ok).toHaveBeenCalledWith(expect.objectContaining({устарел: true}));
  });

  it('автосохранение шлёт черновик и не трогает настоящий файл статьи', async () => {
    const request = vi.fn().mockResolvedValue({автосохранено: '2026-08-04T10:00:00.000Z'});
    const ok = vi.fn();
    const fail = vi.fn();

    await autosaveDraft(черновик, {ok, fail}, request as never);

    expect(ok).toHaveBeenCalledTimes(1);
    // Черновик уходит на свою ручку, а не на сохранение статьи.
    expect(request).toHaveBeenCalledWith('/api/draft', expect.objectContaining({method: 'POST'}));
    expect(request).not.toHaveBeenCalledWith('/api/article/save', expect.anything());
  });
});

describe('сохранение поверх внешней правки', () => {
  it('файл изменён снаружи — сохранение не подтверждается, человеку предлагается выбор', async () => {
    const конфликт = Object.assign(new Error('файл изменён снаружи'), {конфликт: true});
    const request = vi.fn().mockRejectedValue(конфликт);
    const ok = vi.fn();
    const fail = vi.fn();
    const conflict = vi.fn();

    await saveArticle(тело, {ok, fail, conflict}, request as never);

    expect(ok).not.toHaveBeenCalled();
    // Конфликт — не обычная ошибка: показываем выбор, а не только сообщение.
    expect(conflict).toHaveBeenCalledWith('файл изменён снаружи');
    expect(fail).not.toHaveBeenCalled();
  });

  it('отпечаток базы уходит на сервер вместе с текстом', async () => {
    const request = vi.fn().mockResolvedValue({saved: true});

    await saveArticle({...тело, отпечатокБазы: 'ОТП1'}, {ok: vi.fn(), fail: vi.fn()}, request as never);

    const посланное = JSON.parse((request.mock.calls[0][1] as {body: string}).body);
    expect(посланное.отпечатокБазы).toBe('ОТП1');
  });

  it('обычная ошибка остаётся обычной, а не превращается в конфликт', async () => {
    const request = vi.fn().mockRejectedValue(new Error('нет такой статьи'));
    const conflict = vi.fn();
    const fail = vi.fn();

    await saveArticle(тело, {ok: vi.fn(), fail, conflict}, request as never);

    expect(conflict).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith('нет такой статьи');
  });
});

describe('отпечаток базы после сохранения', () => {
  it('новый отпечаток от сервера доходит до окна, иначе следующая правка даст ложный конфликт', async () => {
    const request = vi.fn().mockResolvedValue({saved: true, отпечаток: 'НОВЫЙ'});
    const ok = vi.fn();

    await saveArticle({...тело, отпечатокБазы: 'СТАРЫЙ'}, {ok, fail: vi.fn()}, request as never);

    expect(ok).toHaveBeenCalledWith(expect.objectContaining({отпечаток: 'НОВЫЙ'}));
  });

  it('сохранение поверх помечается явным решением человека', async () => {
    const request = vi.fn().mockResolvedValue({saved: true});

    await saveArticle({...тело, отпечатокБазы: 'СТАРЫЙ', перезаписать: true}, {ok: vi.fn(), fail: vi.fn()}, request as never);

    const посланное = JSON.parse((request.mock.calls[0][1] as {body: string}).body);
    expect(посланное.перезаписать).toBe(true);
  });
});
