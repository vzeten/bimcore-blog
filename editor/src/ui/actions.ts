// Действия окна (сохранить, сменить видимость, открыть версию), отделённые от React,
// чтобы их поведение проверялось тестом без интерфейса и без новых зависимостей.
// Главное правило: `ok` вызывается ТОЛЬКО при успехе сервера, `fail` — при ошибке с её причиной.
import {requestJson} from './api';

type Request = typeof requestJson;

export interface Effects {
  /**
   * Успех. Ответ сервера передаётся целиком: после сохранения в нём приходит новый отпечаток файла,
   * и без его подхвата следующая правка ушла бы со старой базой и дала ложный конфликт.
   */
  /**
   * Успех запроса. `устарел` — сервер принял ответ, но запись отклонил как более старую,
   * чем уже лежащая: для автосохранения это норма, а для спасения работы — сигнал, что
   * спасти не вышло и человеку надо сказать правду.
   */
  ok: (ответ?: {
    отпечаток?: string;
    /** Свежие отпечатки записанных файлов по путям: так отвечает смена видимости. */
    отпечатки?: Record<string, string>;
    предупреждения?: string[];
    устарел?: boolean;
    /** Нужен ли ещё ответ окну: так отвечает смена видимости, у которой предупреждение важнее экрана. */
    актуально?: boolean;
  }) => void;
  fail: (reason: string) => void;
  /** Файл изменился снаружи: сохранять поверх или перечитать — решает человек. */
  conflict?: (reason: string) => void;
  /**
   * Нужен ли ещё этот ответ. Пока запрос шёл, человек мог открыть другую статью,
   * и применять к ней состояние прошлой нельзя: окно станет смесью двух статей.
   */
  актуально?: () => boolean;
}

const причина = (error: unknown): string => (error instanceof Error ? error.message : '');

/**
 * Сохранение статьи. При ошибке `ok` не вызывается — значит «Сохранено» и снятие dirty не происходят.
 * Отпечаток базы едет вместе с текстом: сервер по нему видит, не менялся ли файл снаружи,
 * и отвечает конфликтом вместо тихой перезаписи чужой правки.
 */
export async function saveArticle(
  body: {
    path: string;
    body: string;
    frontmatterRaw: string;
    отпечатокБазы?: string;
    перезаписать?: boolean;
    /** Когда началось это сохранение: по нему сервер не убирает черновик, написанный позже. */
    правкаОт?: string;
  },
  effects: Effects,
  request: Request = requestJson,
): Promise<void> {
  try {
    const ответ = await request<{отпечаток?: string; предупреждения?: string[]}>('/api/article/save', {
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
  draft: {path: string; body: string; frontmatterRaw: string; отпечатокБазы: string; правкаОт?: string},
  effects: Effects,
  request: Request = requestJson,
  signal?: AbortSignal,
): Promise<void> {
  try {
    // Ответ доносим до вызывающего целиком: в нём может стоять `устарел`, и тогда запись
    // на диск не легла — спасение работы обязано об этом узнать.
    const ответ = await request<{устарел?: boolean}>('/api/draft', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(draft),
      signal,
    });
    effects.ok(ответ);
  } catch (error) {
    // Прерванный запрос — не сбой: его результат уже никому не нужен.
    if ((error as {прервано?: boolean})?.прервано) return;
    effects.fail(причина(error));
  }
}

/**
 * Открытие статьи. Ответ применяется только если он всё ещё нужен: открыли A, следом B,
 * и поздний ответ A иначе подменил бы окно — человек продолжил бы правку, думая, что он в B,
 * а правки уходили бы в черновик и файл A.
 */
export async function loadArticle<T>(
  path: string,
  effects: {ok: (статья: T) => void; fail: (reason: string) => void; актуально?: () => boolean},
  request: Request = requestJson,
): Promise<void> {
  const актуально = effects.актуально ?? (() => true);

  try {
    const статья = await request<T>(`/api/article?path=${encodeURIComponent(path)}`);
    if (актуально()) effects.ok(статья);
  } catch (error) {
    if (актуально()) effects.fail(причина(error));
  }
}

/**
 * Лента версий статьи. Ответ применяется только если он всё ещё нужен: пока запрос шёл,
 * человек мог уйти в другую статью, и чужая лента показала бы версии не той статьи.
 */
export async function loadSessions<T>(
  path: string,
  effects: {ok: (сеансы: T[]) => void; fail: (reason: string) => void; актуально?: () => boolean},
  request: Request = requestJson,
): Promise<void> {
  const актуально = effects.актуально ?? (() => true);

  try {
    const ответ = await request<{сеансы: T[]}>(`/api/versions?path=${encodeURIComponent(path)}`);
    if (актуально()) effects.ok(ответ.сеансы);
  } catch (error) {
    if (актуально()) effects.fail(причина(error));
  }
}

/** Чем отвечает открытие версии: содержимое снимка, разобранное сервером на шапку и тело. */
export interface VersionEffects {
  ok: (версия: {frontmatterRaw: string; body: string}) => void;
  fail: (reason: string) => void;
  /**
   * Выполняется ДО запроса: здесь ждущая правка дописывается в черновик, иначе таймер сработает
   * уже во время чтения старой версии. Вернуло `false` — просмотр не начинается вовсе:
   * бросать незаписанную работу ради чтения старой версии нельзя.
   */
  доЗапроса?: () => Promise<boolean> | boolean;
  /**
   * Актуален ли ещё выбор. Пока ответ шёл, человек мог выбрать другую версию или уйти из статьи;
   * такой ответ не должен подменить то, что открыто сейчас.
   */
  актуально?: () => boolean;
}

/**
 * Открыть версию на просмотр. Только чтение: ни файл, ни черновик, ни состояние не трогаются,
 * поэтому здесь один-единственный запрос и ни одного пишущего.
 * Возвращает `false`, если просмотр не начался вовсе — тогда окно должно остаться в работе.
 */
export async function openVersion(
  запрос: {path: string; имя: string},
  effects: VersionEffects,
  request: Request = requestJson,
): Promise<boolean> {
  if (effects.доЗапроса && (await effects.доЗапроса()) === false) return false;
  const актуально = effects.актуально ?? (() => true);

  try {
    const адрес = `/api/version?path=${encodeURIComponent(запрос.path)}&имя=${encodeURIComponent(запрос.имя)}`;
    const ответ = await request<{frontmatterRaw: string; body: string}>(адрес);
    if (актуально()) effects.ok(ответ);
  } catch (error) {
    if (актуально()) effects.fail(причина(error));
  }

  return true;
}

/** Смена видимости всех языковых версий. При ошибке `ok` не вызывается — состояние статьи не меняется. */
export async function setVisibility(
  paths: string[],
  скрыть: boolean,
  effects: Effects,
  request: Request = requestJson,
): Promise<void> {
  const актуально = effects.актуально ?? (() => true);

  try {
    // Ответ доносим целиком: в нём свежие отпечатки записанных файлов. Без них следующее
    // сохранение сравнило бы правку с файлом, каким он был до смены видимости, и получило бы
    // ложное «изменён снаружи» — менял-то файл сам редактор.
    const ответ = await request<{отпечатки?: Record<string, string>; предупреждения?: string[]}>('/api/visibility', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({paths, скрыть}),
    });
    // `ok` зовётся всегда: в ответе может быть предупреждение о незаписанной версии, и оно
    // относится к работе, а не к экрану. Что можно менять в окне, решает сам обработчик —
    // он и проверяет, та ли статья открыта сейчас.
    effects.ok({...ответ, актуально: актуально()});
  } catch (error) {
    // Ошибку показываем всегда, даже если человек уже ушёл: он нажал переключатель и вправе
    // знать, что видимость не изменилась. Молчание здесь и есть тихая потеря его решения.
    effects.fail(причина(error));
  }
}
