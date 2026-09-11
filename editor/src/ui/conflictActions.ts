// Разрешение расхождения — отдельным файлом от остальных действий окна: действия переросли
// предел размера файла (SPEC 4.9), и первым отделяется то, что относится к сведению сторон.
// Дверь к серверу та же одна на всю программу (SPEC 6.1).

import {requestJson} from './api';
import type {Пара} from './types';

const причина = (error: unknown): string => (error instanceof Error ? error.message : '');

/** Ответ сервера: собранная пара и отпечаток версии, от которой её собрали. */
type ИтогСпора = {решено?: Пара; отпечаток?: string};

/**
 * Разрешение расхождения: человек ответил по каждому спорному месту, какую сторону оставить.
 * Сервер собирает пару и кладёт её в черновик версии; файл статьи при этом не пишется.
 */
export async function решитьСпор(
  body: {path: string; ответы: {место: string; номер: number; сторона: string}[]},
  effects: {ok: (ответ?: ИтогСпора) => void; fail: (reason: string) => void},
  request: typeof requestJson = requestJson,
): Promise<void> {
  try {
    effects.ok(await request<ИтогСпора>('/api/article/conflict',
      {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}));
  } catch (error) {
    effects.fail(причина(error));
  }
}
