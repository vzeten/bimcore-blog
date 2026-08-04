// Действия «сохранить» и «сменить видимость», отделённые от React, чтобы их поведение
// проверялось тестом без интерфейса и без новых зависимостей.
// Главное правило: `ok` вызывается ТОЛЬКО при успехе сервера, `fail` — при ошибке с её причиной.
import {requestJson} from './api';

type Request = typeof requestJson;

export interface Effects {
  /**
   * Успех. Ответ сервера передаётся целиком: после сохранения в нём приходит новый отпечаток файла,
   * и без его подхвата следующая правка ушла бы со старой базой и дала ложный конфликт.
   */
  ok: (ответ?: {отпечаток?: string}) => void;
  fail: (reason: string) => void;
  /** Файл изменился снаружи: сохранять поверх или перечитать — решает человек. */
  conflict?: (reason: string) => void;
}

const причина = (error: unknown): string => (error instanceof Error ? error.message : '');

/**
 * Сохранение статьи. При ошибке `ok` не вызывается — значит «Сохранено» и снятие dirty не происходят.
 * Отпечаток базы едет вместе с текстом: сервер по нему видит, не менялся ли файл снаружи,
 * и отвечает конфликтом вместо тихой перезаписи чужой правки.
 */
export async function saveArticle(
  body: {path: string; body: string; frontmatterRaw: string; отпечатокБазы?: string; перезаписать?: boolean},
  effects: Effects,
  request: Request = requestJson,
): Promise<void> {
  try {
    const ответ = await request<{отпечаток?: string}>('/api/article/save', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    effects.ok(ответ);
  } catch (error) {
    const текст = причина(error);
    // Конфликт — не обычная ошибка: человеку предлагается выбор, а не просто сообщение.
    if (effects.conflict && (error as {конфликт?: boolean})?.конфликт) effects.conflict(текст);
    else effects.fail(текст);
  }
}

/**
 * Автосохранение черновика. Настоящий `.mdx` не трогается — сервер пишет только черновик.
 * При ошибке `ok` не вызывается: признак несохранённого остаётся, правки в окне не теряются.
 */
export async function autosaveDraft(
  draft: {path: string; body: string; frontmatterRaw: string; отпечатокБазы: string},
  effects: Effects,
  request: Request = requestJson,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await request('/api/draft', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(draft),
      signal,
    });
    effects.ok();
  } catch (error) {
    // Прерванный запрос — не сбой: его результат уже никому не нужен.
    if ((error as {прервано?: boolean})?.прервано) return;
    effects.fail(причина(error));
  }
}

/** Смена видимости всех языковых версий. При ошибке `ok` не вызывается — состояние статьи не меняется. */
export async function setVisibility(
  paths: string[],
  скрыть: boolean,
  effects: Effects,
  request: Request = requestJson,
): Promise<void> {
  try {
    await request('/api/visibility', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({paths, скрыть}),
    });
    effects.ok();
  } catch (error) {
    effects.fail(причина(error));
  }
}
