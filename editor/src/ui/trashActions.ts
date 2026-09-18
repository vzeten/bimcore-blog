// Действия корзины (перечень, возврат), отделённые от React по тем же правилам, что и `actions.ts`:
// `ok` только при успехе сервера, `fail` — с причиной и перечнем того, что мешает.
import {requestJson} from './api';

type Request = typeof requestJson;

const причина = (error: unknown): string => (error instanceof Error ? error.message : '');

export interface TrashEntry {
  id: string;
  удалено: string;
  состояние: string;
  название?: string;
  пути?: string[];
  языки?: string[];
}

/** Перечень корзины. Срока у записей нет: сама она ничего не удаляет (решение владельца 2026-09-18). */
export function trashList(request: Request = requestJson): Promise<{записи: TrashEntry[]}> {
  return request<{записи: TrashEntry[]}>('/api/trash');
}

/**
 * Стереть запись корзины насовсем. Двумя заходами, как удаление статьи: без подтверждения сервер
 * только называет, что исчезнет, с подтверждением — стирает. Вернуть после этого нечем.
 */
export async function trashDrop(
  id: string,
  подтверждено: boolean,
  effects: {ok: (итог: {стёрто?: string; спрашиваю?: boolean; название?: string}) => void | Promise<void>; fail: (reason: string) => void | Promise<void>},
  request: Request = requestJson,
): Promise<void> {
  try {
    await effects.ok(await request<{стёрто?: string; спрашиваю?: boolean; название?: string}>('/api/trash/drop', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(подтверждено ? {id, подтверждено: true} : {id}),
    }));
  } catch (error) {
    await effects.fail(причина(error));
  }
}

/** Возврат записи из корзины. Отказ — конфликт на месте статьи или повреждённая запись. */
export async function trashRestore(
  id: string,
  effects: {ok: (итог: {возвращено: string[]}) => void | Promise<void>; fail: (reason: string, конфликты: string[]) => void | Promise<void>},
  request: Request = requestJson,
): Promise<void> {
  try {
    await effects.ok(await request<{возвращено: string[]}>('/api/trash/restore', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id}),
    }));
  } catch (error) {
    const ответ = (error as {ответ?: {конфликты?: string[]}})?.ответ;
    await effects.fail(причина(error), ответ?.конфликты ?? []);
  }
}
