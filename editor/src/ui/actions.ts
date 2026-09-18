// Действия окна (сохранить, открыть версию, создать статью), отделённые от React,
// чтобы их поведение проверялось тестом без интерфейса и без новых зависимостей.
// Главное правило: `ok` вызывается ТОЛЬКО при успехе сервера, `fail` — при ошибке с её причиной.
import {requestJson} from './api';
import type {Пара, Спор} from './types';

type Request = typeof requestJson;

export interface Effects {
  /**
   * Успех запроса. Ответ передаётся целиком: в нём приходит новый отпечаток файла, готовность
   * версии на диске, а после сведения — и текст, который сервер записал или сложил из сторон.
   * Без их подхвата следующая правка ушла бы со старой базой и дала ложное расхождение.
   * `устарел` — сервер принял запрос, но запись отклонил как более старую, чем уже лежащая.
   */
  ok: (ответ?: {
    отпечаток?: string;
    предупреждения?: string[];
    state?: {готовность?: string};
    устарел?: boolean;
    /** Что сервер записал в файл: после сведения это не то же, что послало окно. */
    записано?: Пара;
    /** Итог сведения с внешней правкой, сам файл на диске и отложенный спор этой версии. */
    сведено?: Пара | null;
    файл?: Пара;
    спор?: Спор | null;
  }) => void;
  fail: (reason: string) => void;
  /**
   * Свести стороны сервер не смог: записи не было, стороны лежат на диске, человеку показывается
   * панель расхождения. `ответ` — тело отказа целиком, в нём приходит сам спор.
   */
  conflict?: (reason: string, ответ?: unknown) => void;
}

const причина = (error: unknown): string => (error instanceof Error ? error.message : '');

/**
 * Сохранение статьи. При ошибке `ok` не вызывается — значит «Сохранено» и снятие dirty не происходят.
 * Отпечаток базы едет вместе с текстом: по нему сервер сводит работу человека с внешней правкой,
 * а неразрешимое пересечение возвращает расхождением вместо тихой перезаписи чужой работы.
 * Пишется ровно один файл — открытая языковая версия. Видимость принадлежит версии (SPEC 2.8),
 * поэтому рассказывать про соседние версии тут нечего: сохранение их не касается.
 */
export async function saveArticle(
  body: {
    path: string;
    body: string;
    frontmatterRaw: string;
    отпечатокБазы?: string;
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
    if (effects.conflict && (error as {конфликт?: boolean})?.конфликт) {
      effects.conflict(текст, (error as {ответ?: unknown})?.ответ);
    }
    else effects.fail(текст);
  }
}

/**
 * Автосохранение черновика. Настоящий `.mdx` не трогается — сервер пишет только черновик,
 * но перед этим сверяет файл с диском и сводит внешнюю правку с работой человека.
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
 * Начало языковой версии у существующей статьи. Запрос уходит только после явного согласия
 * человека: до него окно ничего не спрашивает у сервера и ни одного файла не появляется.
 *
 * Путь новой версии считает сервер — окно называет только открытую статью и выбранный язык.
 */
export async function startLocale(
  запрос: {path: string; локаль: string},
  effects: {ok: (созданная: {path: string}) => void | Promise<void>; fail: (reason: string) => void},
  request: Request = requestJson,
): Promise<void> {
  try {
    await effects.ok(await request<{path: string}>('/api/article/locale', {
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
/** Что сервер говорит об удалении до действия: куда уйдёт статья, почему и какие языки. */
export interface DeletePreview {
  режим: 'корзина';
  /** `опубликована`, `неОпубликована` или `неизвестно`: по ней окно говорит про судьбу страницы сайта. */
  причина: string;
  пути: string[];
  языки: string[];
}

export interface DeleteResult {
  удалено: string[];
  режим: 'корзина';
  корзина?: string;
  удаленоКогда?: string;
  предупреждения?: string[];
}

/**
 * Удаление статьи двумя заходами одним адресом: без подтверждения сервер только называет, что
 * произойдёт, и ничего не меняет; с подтверждением переносит статью в корзину. Возврат из корзины
 * и стирание записи насовсем — отдельные действия корзины.
 */
export async function deleteArticle<T extends DeletePreview | DeleteResult>(
  path: string,
  подтверждено: 'корзина' | null,
  effects: {
    ok: (итог: T) => void | Promise<void>;
    /** `стёрто` — что уже успело исчезнуть, когда удаление сорвалось на середине. */
    fail: (reason: string, стёрто: string[]) => void | Promise<void>;
  },
  request: Request = requestJson,
): Promise<void> {
  try {
    await effects.ok(await request<T>('/api/article/delete', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(подтверждено === null ? {path} : {path, подтверждено}),
    }));
  } catch (error) {
    // Перечень уже стёртого доносим вместе с причиной: при сбое посреди удаления человек иначе
    // не узнает, что именно исчезло, — картинок в списке статей не видно.
    const ответ = (error as {ответ?: {стёрто?: string[]}})?.ответ;
    await effects.fail(причина(error), ответ?.стёрто ?? []);
  }
}
