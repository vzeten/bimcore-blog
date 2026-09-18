// Имя каждого теста повторяет формулировку правила.
//
// Что человек видит сразу после публикации, удаления и отказа (проба владельца 2026-09-19): свод
// читает опубликованное состояние по свежему следу сайта, переход к месту выделяет найденное целиком,
// удача показывается полосой без красного, языки записи корзины — заглавными кодами по порядку.
import {afterEach, describe, expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

import {опубликовать} from '../src/ui/publishRun';
import {расхождениеССайтом} from '../src/adapters/gitFile.mjs';
import {выделениеМеста} from '../src/ui/editor/jumpTo';
import {ErrorBar} from '../src/ui/zones/ErrorBar';
import {языкиЗаписи} from '../src/ui/zones/TrashPanel';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {RU, НАСТРОЙКИ, дверь, наСервере, среда, убратьПесочницы, ход} from './runHarness.mjs';

afterEach(() => убратьПесочницы());

const КОРНИ = НАСТРОЙКИ['контент'].map((корень: {папка: string}) => корень['папка']);

describe('сразу после публикации', () => {
  it('след сайта (origin/main) стоит на опубликованном, даже без настроенного следа при fetch: свод не видит «изменение ещё не на сайте»', async () => {
    const с = await среда();
    // Так бывает в репозиториях, где удалённый заведён без обычного следа веток.
    await с.git.raw(['config', '--unset-all', 'remote.origin.fetch']);
    fs.appendFileSync(path.join(с.repo, RU), 'Новая строка.\n', 'utf8');
    expect(await расхождениеССайтом(с.git, 'origin/main', КОРНИ)).toContain(RU);

    const исход = await опубликовать(RU, false, ход(дверь(с, []), []), 'всем');

    expect(исход.вид).toBe('готово');
    expect((await с.git.raw(['rev-parse', 'origin/main'])).trim()).toBe(await наСервере(с.сервер));
    expect(await расхождениеССайтом(с.git, 'origin/main', КОРНИ)).not.toContain(RU);
  }, ЖДАТЬ_GIT * 2);
});

describe('переход к месту', () => {
  const документ = {lines: 3, length: 30, line: (n: number) => ({from: [0, 0, 10, 20][n]})};

  it('найденное выделяется целиком: от начала в строке на свою длину', () => {
    expect(выделениеМеста({строка: 2, столбец: 3, длина: 5}, документ)).toEqual({anchor: 13, head: 18});
  });

  it('где в строке — неизвестно: курсор в начале строки; выделение не выходит за конец документа', () => {
    expect(выделениеМеста({строка: 2}, документ)).toEqual({anchor: 10, head: 10});
    expect(выделениеМеста({строка: 3, столбец: 5, длина: 40}, документ)).toEqual({anchor: 25, head: 30});
  });
});

describe('полоса сообщений и корзина', () => {
  it('удача — полоса без красного и не тревога; ошибка — как прежде', () => {
    const удача = renderToStaticMarkup(<ErrorBar settings={НАСТРОЙКИ} текст="Статья в корзине." удача onЗакрыть={() => {}} />);
    const ошибка = renderToStaticMarkup(<ErrorBar settings={НАСТРОЙКИ} текст="Не вышло." onЗакрыть={() => {}} />);

    expect(удача).toContain('class="errorbar errorbar-ok"');
    expect(удача).toContain('role="status"');
    expect(ошибка).toContain('class="errorbar"');
    expect(ошибка).toContain('role="alert"');
  });

  it('языки записи корзины — заглавными кодами в порядке языков настроек', () => {
    expect(языкиЗаписи(['en', 'es', 'ru'], НАСТРОЙКИ)).toBe('RU, EN, ES');
  });
});
