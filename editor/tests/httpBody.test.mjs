// Имя каждого теста повторяет формулировку правила.
import {describe, expect, it} from 'vitest';
import {EventEmitter} from 'node:events';
import {ApiError, badFields, badPath, errorResponse, readBody} from '../src/adapters/httpBody.mjs';

// Тексты — как из настроек: в самом модуле пользовательских строк нет.
const ТЕКСТЫ = {
  битыйJson: 'битый json',
  слишкомБольшой: 'слишком большой',
  чтениеТела: 'не прочитать',
  плохойЗапрос: 'плохой запрос',
  неверныйАдрес: 'неверный адрес',
  нетСтатьи: 'нет статьи',
};

/** Поддельный запрос: шлёт куски и завершение, как настоящий поток. */
function fakeReq(chunks) {
  const req = new EventEmitter();
  req.destroy = () => {};
  queueMicrotask(() => {
    for (const chunk of chunks) req.emit('data', Buffer.from(chunk));
    req.emit('end');
  });
  return req;
}

describe('чтение тела запроса', () => {
  it('корректный JSON разбирается в объект', async () => {
    await expect(readBody(fakeReq(['{"a":1}']), 1024, ТЕКСТЫ)).resolves.toEqual({a: 1});
  });

  it('пустое тело даёт пустой объект, а не ошибку', async () => {
    await expect(readBody(fakeReq([]), 1024, ТЕКСТЫ)).resolves.toEqual({});
  });

  it('битый JSON даёт ошибку 400 с текстом из настроек и не роняет сервер', async () => {
    await expect(readBody(fakeReq(['это не json']), 1024, ТЕКСТЫ)).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'битый json',
    });
  });

  it('тело больше предела даёт ошибку 400 плохого запроса', async () => {
    await expect(readBody(fakeReq(['x'.repeat(50)]), 10, ТЕКСТЫ)).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'слишком большой',
    });
  });
});

describe('ответ на пойманную ошибку', () => {
  it('ожидаемая ошибка отдаётся своим кодом и текстом', () => {
    expect(errorResponse(new ApiError(404, 'нет такой статьи'), 'внутренняя'))
      .toEqual({status: 404, payload: {error: 'нет такой статьи'}});
  });

  it('внутренняя ошибка отдаётся как 500 с общим текстом, без технической простыни', () => {
    const ответ = errorResponse(new Error('TypeError: cannot read foo of undefined at line 42'), 'внутренняя ошибка');
    expect(ответ.status).toBe(500);
    expect(ответ.payload.error).toBe('внутренняя ошибка');
    expect(ответ.payload.error).not.toContain('TypeError');
  });
});

// Проверка путей общая для всех пишущих ручек: сегодня ею живут автосохранение и удаление.
describe('проверка путей перед записью на диск', () => {
  const safe = () => true;
  const exists = () => true;

  it('пустой список путей — это плохой запрос 400', () => {
    expect(badPath([], safe, exists, ТЕКСТЫ)).toEqual({status: 400, error: 'плохой запрос'});
  });

  it('небезопасный путь вне репозитория — 400', () => {
    expect(badPath(['../secret'], (rel) => rel !== '../secret', exists, ТЕКСТЫ))
      .toEqual({status: 400, error: 'неверный адрес'});
  });

  it('отсутствующий файл — 404, а не тихий пропуск с 200', () => {
    expect(badPath(['docs/нет/index.mdx'], safe, () => false, ТЕКСТЫ))
      .toEqual({status: 404, error: 'нет статьи'});
  });

  it('путь неправильного типа — плохой запрос 400, а не падение сервера', () => {
    for (const плохой of [null, 123, {}, '']) {
      expect(badPath([плохой], safe, exists, ТЕКСТЫ)).toEqual({status: 400, error: 'плохой запрос'});
    }
  });

  it('все пути безопасны и существуют — ошибки нет', () => {
    expect(badPath(['docs/a/index.mdx'], safe, exists, ТЕКСТЫ)).toBeNull();
  });
});

describe('проверка полей запроса', () => {
  it('отсутствующее поле — плохой запрос 400, а не падение', () => {
    expect(badFields({article: 'docs/a/index.mdx'}, ['article', 'base64'], ТЕКСТЫ))
      .toEqual({status: 400, error: 'плохой запрос'});
  });

  it('поле неправильного типа — плохой запрос 400', () => {
    for (const плохое of [null, 123, {}, [], true]) {
      expect(badFields({article: плохое, base64: 'AA=='}, ['article', 'base64'], ТЕКСТЫ))
        .toEqual({status: 400, error: 'плохой запрос'});
    }
  });

  it('пустая строка не считается заполненным полем', () => {
    expect(badFields({article: '', base64: 'AA=='}, ['article', 'base64'], ТЕКСТЫ))
      .toEqual({status: 400, error: 'плохой запрос'});
  });

  it('тело запроса не объект — плохой запрос 400', () => {
    expect(badFields(null, ['article'], ТЕКСТЫ)).toEqual({status: 400, error: 'плохой запрос'});
    expect(badFields('строка', ['article'], ТЕКСТЫ)).toEqual({status: 400, error: 'плохой запрос'});
  });

  it('все поля на месте — ошибки нет', () => {
    expect(badFields({article: 'docs/a/index.mdx', base64: 'AA=='}, ['article', 'base64'], ТЕКСТЫ)).toBeNull();
  });
});
