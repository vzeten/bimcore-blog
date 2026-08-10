// Действия окна (сохранить, открыть версию, создать статью), отделённые от React,
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
    предупреждения?: string[];
    /**
     * Состояние версии, каким оно теперь лежит на диске. Правка после подготовки возвращает
     * версию в черновик, и окно обязано показать это сразу, а не до следующего открытия статьи.
     */
    state?: {готовность?: string};
    устарел?: boolean;
  }) => void;
  fail: (reason: string) => void;
  /** Файл изменился снаружи: сохранять поверх или перечитать — решает человек. */
  conflict?: (reason: string) => void;
}

const причина = (error: unknown): string => (error instanceof Error ? error.message : '');

/**
 * Сохранение статьи. При ошибке `ok` не вызывается — значит «Сохранено» и снятие dirty не происходят.
 * Отпечаток базы едет вместе с текстом: сервер по нему видит, не менялся ли файл снаружи,
 * и отвечает конфликтом вместо тихой перезаписи чужой правки.
 *
 * Пишется ровно один файл — открытая языковая версия. Видимость принадлежит версии (SPEC 2.8),
 * поэтому рассказывать про соседние версии тут нечего: сохранение их не касается.
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
    const ответ = await request<{
      отпечаток?: string;
      предупреждения?: string[];
      state?: {готовность?: string};
    }>('/api/article/save', {
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

/**
 * Создание статьи. Сервер отвечает путём созданной русской версии — окно сразу её открывает.
 * При ошибке `ok` не вызывается: ничего не создано, и делать вид, что создано, нельзя.
 */
export async function createArticle(
  запрос: {раздел: string; название: string; адрес: string; язык: string},
  // `заглушка` — создана ли вместе с русской статьёй английская: окно говорит об этом человеку,
  // и молчать нельзя — про второй созданный файл он должен знать.
  effects: {ok: (созданная: {path: string; заглушка?: boolean}) => void; fail: (reason: string) => void},
  request: Request = requestJson,
): Promise<void> {
  try {
    await effects.ok(await request<{path: string; заглушка?: boolean}>('/api/article/new', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(запрос),
    }));
  } catch (error) {
    effects.fail(причина(error));
  }
}

/**
 * Удаление статьи со всеми языковыми версиями. `ok` зовётся только после подтверждения сервера:
 * убрать статью из окна раньше значит показать человеку, что её нет, когда она на диске осталась.
 *
 * Отказ сервера — обычный путь, а не поломка: статью, уже вышедшую на сайт, программа удалять
 * не умеет, и человеку это говорится словами.
 */
export async function deleteArticle(
  path: string,
  effects: {
    ok: (итог: {удалено: string[]; предупреждения?: string[]}) => void | Promise<void>;
    /** `стёрто` — что уже успело исчезнуть, когда удаление сорвалось на середине. */
    fail: (reason: string, стёрто: string[]) => void | Promise<void>;
  },
  request: Request = requestJson,
): Promise<void> {
  try {
    await effects.ok(await request<{удалено: string[]; предупреждения?: string[]}>('/api/article/delete', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({path}),
    }));
  } catch (error) {
    // Перечень уже стёртого доносим вместе с причиной: при сбое посреди удаления человек иначе
    // не узнает, что именно исчезло, — картинок в списке статей не видно.
    const ответ = (error as {ответ?: {стёрто?: string[]}})?.ответ;
    await effects.fail(причина(error), ответ?.стёрто ?? []);
  }
}
