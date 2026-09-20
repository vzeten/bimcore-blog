// Имя каждого теста повторяет формулировку правила.
// Уборка лишних файлов в корзину и ручка `/api/publish/tidy`. Отдельным файлом от правила:
// проверки лишнего упёрлись в предел размера (SPEC 4.9).
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {убратьЛишнее} from '../src/adapters/unusedFacts.mjs';
import {unusedRoute} from '../src/adapters/unusedRoute.mjs';
import {ВИД_ЛИШНИХ} from '../src/core/unusedFiles.mjs';
import {ключВозврата} from '../src/ui/trashActions';
import {вКорзину, вернутьИзКорзины, списокКорзины, составАрхива} from '../src/adapters/trashStore.mjs';
import {EN, ПАПКА, RU, НАСТРОЙКИ, песочницы, среда, шапка} from './unusedHarness.mjs';

afterEach(() => {
  vi.restoreAllMocks();
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

describe('уборка лишнего в корзину', () => {
  it('лишний файл уходит в корзину и возвращается оттуда целым', async () => {
    const сирота = `${ПАПКА[RU]}/сирота.png`;
    const {repo, editorDir} = await среда({
      тексты: {[RU]: шапка('Текст.'), [EN]: шапка('Текст.')},
      файлы: {[сирота]: 'старое'},
    });
    const итог = убратьЛишнее({repo, editorDir, settings: НАСТРОЙКИ, версии: [RU]});

    expect(итог.убрано).toEqual([сирота]);
    expect(fs.existsSync(path.join(repo, сирота))).toBe(false);
    const записи = списокКорзины({repo, settings: НАСТРОЙКИ});
    expect(записи).toHaveLength(1);
    expect(записи[0].название).toContain('Проба');

    expect(вернутьИзКорзины({repo, editorDir, settings: НАСТРОЙКИ, id: итог.корзина}).возвращено).toEqual([сирота]);
    expect(fs.readFileSync(path.join(repo, сирота), 'utf8')).toBe('старое');
  });

  it('нужный файл и служебные записи остаются на диске нетронутыми', async () => {
    const своя = `${ПАПКА[RU]}/img-01.png`;
    const состояние = `${ПАПКА[RU]}/_state.json`;
    const {repo, editorDir} = await среда({
      тексты: {[RU]: шапка('![](./img-01.png)'), [EN]: шапка('Текст.')},
      файлы: {[своя]: 'нужное', [состояние]: '{}'},
    });
    const итог = убратьЛишнее({repo, editorDir, settings: НАСТРОЙКИ, версии: [RU]});

    expect(итог).toEqual({убрано: [], корзина: null});
    expect(fs.existsSync(path.join(repo, своя))).toBe(true);
    expect(fs.existsSync(path.join(repo, состояние))).toBe(true);
  });

  it('сбой чтения соседней локали не уносит в корзину ничего', async () => {
    const сирота = `${ПАПКА[RU]}/сирота.png`;
    const {repo, editorDir} = await среда({
      тексты: {[RU]: шапка('Текст.'), [EN]: шапка('Текст.')},
      файлы: {[сирота]: 'старое'},
    });
    const настоящий = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((цель, ...прочее) => {
      if (String(цель).replace(/\\/g, '/').endsWith(EN)) throw new Error('диск не отвечает');
      return настоящий(цель, ...прочее);
    });

    expect(убратьЛишнее({repo, editorDir, settings: НАСТРОЙКИ, версии: [RU]})).toEqual({убрано: [], корзина: null});
    expect(fs.existsSync(path.join(repo, сирота))).toBe(true);
  });
});

describe('ручка уборки', () => {
  /** Один запрос к ручке — так, как его делает ход публикации. */
  async function запрос({repo, editorDir}, тело) {
    const ответы = [];
    await unusedRoute({
      req: {method: 'POST'},
      res: {},
      url: {pathname: '/api/publish/tidy'},
      repo,
      editorDir,
      settings: НАСТРОЙКИ,
      тело: async () => тело,
      insideRepo: (цель) => path.resolve(цель).startsWith(path.resolve(repo) + path.sep),
      send: (res, status, payload) => ответы.push({status, payload}),
    });
    return ответы[0] ?? {status: 0, payload: {}};
  }

  it('согласие человека обязательно: без него не убирается ничего', async () => {
    const сирота = `${ПАПКА[RU]}/сирота.png`;
    const место = await среда({тексты: {[RU]: шапка('Текст.'), [EN]: шапка('Текст.')}, файлы: {[сирота]: 'старое'}});

    const ответ = await запрос(место, {path: RU});

    expect(ответ.status).toBe(400);
    expect(fs.existsSync(path.join(место.repo, сирота))).toBe(true);
  });

  it('с согласием лишнее уходит в корзину, а ответ называет убранное', async () => {
    const сирота = `${ПАПКА[RU]}/сирота.png`;
    const место = await среда({тексты: {[RU]: шапка('Текст.'), [EN]: шапка('Текст.')}, файлы: {[сирота]: 'старое'}});

    const ответ = await запрос(место, {path: RU, подтверждено: true});

    expect(ответ.status).toBe(200);
    expect(ответ.payload.убрано).toEqual([сирота]);
    expect(fs.existsSync(path.join(место.repo, сирота))).toBe(false);
    expect(списокКорзины({repo: место.repo, settings: НАСТРОЙКИ})).toHaveLength(1);
  });
});

describe('слово при возврате из корзины', () => {
  it('запись уборки говорит про файлы, запись удалённой статьи — про статью', async () => {
    const сирота = `${ПАПКА[RU]}/сирота.png`;
    const место = await среда({тексты: {[RU]: шапка('Текст.'), [EN]: шапка('Текст.')}, файлы: {[сирота]: 'старое'}});
    убратьЛишнее({repo: место.repo, editorDir: место.editorDir, settings: НАСТРОЙКИ, версии: [RU]});
    // Та же корзина, но запись удалённой статьи: вида она не несёт вовсе.
    вКорзину({
      repo: место.repo, editorDir: место.editorDir, settings: НАСТРОЙКИ,
      состав: составАрхива({repo: место.repo, settings: НАСТРОЙКИ, решение: {файлы: [RU], папки: [], пути: [RU]}}),
      статья: {название: 'Проба', пути: [RU], языки: ['ru'], папки: []},
    });

    const записи = списокКорзины({repo: место.repo, settings: НАСТРОЙКИ});
    const уборка = записи.find((запись) => запись.вид === ВИД_ЛИШНИХ);
    const статья = записи.find((запись) => запись.вид === undefined);

    expect(уборка).toBeDefined();
    expect(статья).toBeDefined();
    expect(ключВозврата(уборка)).toBe('лишниеВозвращены');
    expect(ключВозврата(статья)).toBe('статьяВозвращена');
  });

  it('обе подписи есть в настройках и говорят разное', () => {
    expect(НАСТРОЙКИ['подписи']['лишниеВозвращены']).toBeTruthy();
    expect(НАСТРОЙКИ['подписи']['статьяВозвращена']).toBeTruthy();
    expect(НАСТРОЙКИ['подписи']['лишниеВозвращены']).not.toBe(НАСТРОЙКИ['подписи']['статьяВозвращена']);
  });
});
