import type {EditorView} from '@codemirror/view';
import {label} from '../labels';
import {requestJson} from '../api';

interface PasteResult {
  src?: string;
  тяжёлая?: boolean;
  килобайт?: number;
}

/** Техническая величина, а не настройка: длинный список аргументов переполняет стек браузера. */
const КУСОК = 8192;

export async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += КУСОК) binary += String.fromCharCode(...bytes.subarray(i, i + КУСОК));
  return btoa(binary);
}

/**
 * Кладёт картинку тела статьи и возвращает путь, которым на неё надо ссылаться.
 * Имя файлу даёт сервер по шаблону из настроек, а не человек: имя выбранного файла может быть
 * кириллическим или с пробелами, а такое имя роняет сборку сайта (SPEC 2.2).
 *
 * Обложка идёт своей дорогой — `uploadCover`: у неё другое имя файла и другая проверка типа.
 */
export async function uploadAsset(article: string, file: File): Promise<PasteResult> {
  const answer = await requestJson<PasteResult>('/api/asset/paste', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      article,
      base64: await toBase64(file),
      ext: (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg'),
    }),
  });

  // Без адреса от сервера ссылаться не на что: `![](undefined)` и пустой `image` роняют сборку.
  if (!answer.src) throw new Error(label('ошибкаКартинки'));
  return answer;
}

/**
 * Кладёт файл обложкой статьи. Своя ручка, а не признак у вставки в тело: обложке нужно
 * постоянное имя (`cover.png`, `cover.jpg`) и строгая проверка типа по содержимому, а забытый
 * признак молча дал бы обложке имя картинки тела и пропустил бы проверку.
 *
 * Расширение не отправляется: тип определяет сервер по самим байтам. Имя файла на стороне
 * человека может лгать, и обложка чужого формата роняет сборку сайта уже после публикации.
 */
export async function uploadCover(article: string, file: File): Promise<PasteResult> {
  const answer = await requestJson<PasteResult>('/api/asset/cover', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({article, base64: await toBase64(file)}),
  });

  // Без адреса от сервера в шапку писать нечего: пустой `image` роняет сборку сайта.
  if (!answer.src) throw new Error(label('ошибкаКартинки'));
  return answer;
}

/** Тяжёлый файл — не ошибка, а предупреждение: картинка уже лежит на месте, решает человек. */
export function предупредитьОРазмере(answer: PasteResult): void {
  if (answer.тяжёлая) window.alert(label('тяжёлаяКартинка', {килобайт: answer.килобайт ?? 0}));
}

/** Признак, живущий в ref окна: его читают поздние ответы, созданные до того, как всё поменялось. */
interface Признак<T> {
  current: T;
}

/**
 * Загрузка обложки для свойств статьи: кладёт файл в папку открытой статьи и отдаёт путь для шапки.
 * `null` — путь применять нельзя; причина сбоя к этому моменту уже показана человеку.
 *
 * Живёт здесь, а не в окне, чтобы правило «окно сменилось — путь не применяем» проверялось тестом.
 * Сменой окна считается не только другая статья, но и просмотр старой версии этой же и повторное
 * открытие той же самой: путь от чужой папки указал бы в пустоту (картинка лежит рядом со своей
 * статьёй, SPEC 1.3), а правка шапки во время просмотра версии заводит автосохранение там,
 * где разрешено только чтение.
 */
export function makeCoverUpload(deps: {
  runSafe: (action: () => Promise<void>, contextKey?: string) => Promise<boolean>;
  статья: Признак<string | null>;
  заход: Признак<number>;
  просмотр: Признак<boolean>;
}): (file: File) => Promise<string | null> {
  const окно = (): string => `${deps.статья.current ?? ''}|${deps.заход.current}|${deps.просмотр.current}`;

  return async (file) => {
    const куда = deps.статья.current;
    // Статьи на экране нет — класть файл некуда: пути к папке не существует.
    if (!куда) return null;

    const было = окно();
    let ответ: PasteResult | null = null;

    // Причину от сервера показываем с тем, что не вышло: «нет папки статьи» само по себе
    // читается как обрывок неизвестно чего (SPEC 6.7).
    const вышло = await deps.runSafe(async () => {
      try {
        ответ = await uploadCover(куда, file);
      } catch (ошибка) {
        // Окно успело смениться — человек уже в другой статье или читает старую версию.
        // Разговор о неудавшейся картинке он отнесёт к тому, что видит сейчас, и пойдёт
        // искать несуществующую беду. Молчим по тому же правилу, что и на удачном пути.
        if (окно() !== было) return;
        throw ошибка;
      }
    }, 'ошибкаОбложки');

    // Окно сменилось — молчим совсем: разговор о картинке на экране, где её никто не выбирал,
    // человек отнесёт к тому, что видит сейчас, и будет искать несуществующую проблему.
    // Тип берётся явно: значение присвоено внутри замыкания, и вывод типов этого не видит.
    const итог = ответ as PasteResult | null;
    if (!вышло || !итог || окно() !== было) return null;

    предупредитьОРазмере(итог);
    return итог.src ?? null;
  };
}

/**
 * Вставка картинки из буфера. `актуально` — можно ли ещё менять рабочий текст: пока запрос шёл,
 * человек мог уйти в просмотр старой версии, а там правка рабочего текста запрещена — она
 * заводит автосохранение и дописывает черновик прямо во время чтения версии.
 * Файл картинки при этом уже загружен и остаётся на месте: терять его незачем.
 */
export async function pasteImage(
  file: File,
  article: string,
  view: EditorView,
  актуально: () => boolean = () => true,
): Promise<void> {
  const answer = await uploadAsset(article, file);

  // Человек уже не в рабочем тексте — дописывать в него нельзя, даже свою же картинку.
  if (!актуально()) return;

  // Курсор уводим на следующую строку: пока он на строке картинки, видна разметка, а не картинка.
  const at = view.state.selection.main;
  const text = `![](${answer.src})\n`;
  view.dispatch({changes: {from: at.from, to: at.to, insert: text}, selection: {anchor: at.from + text.length}});
  view.focus();

  предупредитьОРазмере(answer);
}

/**
 * Отправляет новый файл картинки на сервер и возвращает его ответ (в нём вес и предупреждение
 * о тяжёлом файле). Бросает, если замена не прошла — вызывающему нечего показывать успехом.
 * Сетевая часть отделена от выбора файла и панели — так поведение проверяется без DOM.
 * Страница не перезагружается никогда: показ обновляет токен замены (`картинкаЗаменена`).
 */
export async function uploadReplacement(article: string, src: string, file: File): Promise<PasteResult> {
  return requestJson<PasteResult>('/api/asset/replace', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({article, src, base64: await toBase64(file)}),
  });
}

/** Ответ смены формата: новый адрес картинки и новый отпечаток файла статьи. */
export interface ReformatResult extends PasteResult {
  reformatted?: boolean;
  новыйSrc?: string;
  отпечаток?: string;
  /** Почему старый файл остался: на него ссылаются либо убрать не удалось. `null` — удалён. */
  старыйОставлен?: 'ссылки' | 'сбой' | null;
}

/**
 * Смена формата картинки: сервер кладёт новый файл с новым расширением, обновляет ссылку
 * в файле статьи и убирает старый файл, если на него не осталось ссылок. Окну для этого нужны
 * точный текст узла, номер его вхождения и отпечаток файла статьи — сервер обязан доказать,
 * что правит ровно то место, которое видел человек.
 */
export async function uploadReformat(запрос: {
  article: string;
  src: string;
  узел: string;
  номер: number;
  отпечаток: string;
  file: File;
}): Promise<ReformatResult> {
  return requestJson<ReformatResult>('/api/asset/reformat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      article: запрос.article,
      src: запрос.src,
      узел: запрос.узел,
      номер: запрос.номер,
      отпечаток: запрос.отпечаток,
      base64: await toBase64(запрос.file),
    }),
  });
}
