// Действия корзины (перечень, возврат), отделённые от React по тем же правилам, что и `actions.ts`:
// `ok` только при успехе сервера, `fail` — с причиной и перечнем того, что мешает.
import {requestJson} from './api';

type Request = typeof requestJson;

const причина = (error: unknown): string => (error instanceof Error ? error.message : '');

export interface TrashEntry {
  id: string;
  удалено: string;
  срокДо: string;
  состояние: string;
  название?: string;
  пути?: string[];
  языки?: string[];
}

/** Перечень корзины: просроченные готовые записи сервер попутно убирает сам. */
export function trashList(request: Request = requestJson): Promise<{дней: number; записи: TrashEntry[]}> {
  return request<{дней: number; записи: TrashEntry[]}>('/api/trash');
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
