// Имя каждого теста повторяет формулировку правила.
// Ручка «человек увидел итог» значка «Сайт»: плохой запрос — 400 с текстом из настроек, а не 500
// (замечание контролёра этапа 2). Ответ собирается так же, как его собирает сервер (`errorResponse`).
import {describe, expect, it} from 'vitest';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {siteStateRoute} from '../src/adapters/siteStateRoute.mjs';
import {errorResponse, readBody} from '../src/adapters/httpBody.mjs';
import {НАСТРОЙКИ} from './runHarness.mjs';

/** Поддельный запрос: шлёт тело и завершение, как настоящий поток. */
function запросСТелом(текст) {
  const req = new EventEmitter();
  req.method = 'POST';
  req.destroy = () => {};
  queueMicrotask(() => {
    if (текст !== '') req.emit('data', Buffer.from(текст));
    req.emit('end');
  });
  return req;
}

/** Ручка и сервер вместе: исключение ручки превращается в ответ тем же правилом, что у сервера. */
async function ответ(текст) {
  const editorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-seen-'));
  const ответы = [];
  try {
    await siteStateRoute({
      req: запросСТелом(текст), res: {}, url: {pathname: '/api/site/seen'}, editorDir, settings: НАСТРОЙКИ,
      тело: (req) => readBody(req, 1024 * 1024, НАСТРОЙКИ['ошибкиСервера']),
      send: (res, status, payload) => ответы.push({status, payload}),
    });
  } catch (ошибка) {
    ответы.push(errorResponse(ошибка, НАСТРОЙКИ['ошибкиСервера']['внутренняя']));
  } finally {
    fs.rmSync(editorDir, {recursive: true, force: true});
  }
  return ответы[0];
}

describe('«человек увидел итог»', () => {
  it('битый JSON — 400 с текстом из настроек', async () => {
    expect(await ответ('{не json')).toEqual({status: 400, payload: {error: НАСТРОЙКИ['ошибкиСервера']['битыйJson']}});
  });

  it('JSON не объектом или без SHA — 400, а не падение', async () => {
    for (const тело of ['null', '[]', '"abc"', '{}', '{"sha": 5}']) {
      expect((await ответ(тело)).status).toBe(400);
    }
  });

  it('годный SHA — 200', async () => {
    expect(await ответ('{"sha": "abc"}')).toEqual({status: 200, payload: {показано: false}});
  });
});
