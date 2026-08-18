import type {EditorView} from '@codemirror/view';
import {label} from '../labels';
import {requestJson} from '../api';
import {dominantEol} from '../../core/articleFile.mjs';
import {типКартинки} from '../../core/imageType.mjs';
import {местоВставкиКартинки} from '../../core/imageInsert';

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

/**
 * Открыть окно выбора файла и отдать выбранное. Одно место на весь редактор: вставка новой
 * картинки и замена существующей предлагают один и тот же список форматов и одинаково молчат,
 * когда человек закрыл окно, ничего не выбрав.
 */
export function выбратьФайл(типы: string, взять: (file: File) => void): void {
  const поле = document.createElement('input');
  поле.type = 'file';
  поле.accept = типы;

  поле.onchange = () => {
    const файл = поле.files?.[0];
    if (файл) взять(файл);
  };

  поле.click();
}

/**
 * Какого рода выбранный файл — по его содержимому, тем же правилом, что и на сервере.
 * `null` — это не картинка статьи. Тип от браузера для этого не годится: он взят из имени файла,
 * а имя лжёт (JPEG в файле `.png`), и по нему окно выбрало бы не ту дорогу замены и показало бы
 * человеку неверный формат в вопросе о смене.
 */
export async function породаКартинки(file: File): Promise<string | null> {
  return типКартинки(new Uint8Array(await file.arrayBuffer()));
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

/** Куда легла новая картинка: адрес файла и границы её узла в тексте — для панели alt-текста. */
export interface ВставленнаяКартинка {
  src: string;
  узелОт: number;
  узелДо: number;
}

/**
 * Вставка новой картинки в статью. Два шага сервера подряд: сначала файл едет в служебный
 * карантин, потом ложится рядом со статьёй под свободным именем — и только после этого окно
 * дописывает ссылку. Пока файл едет, человек мог уйти в другую статью или в просмотр старой
 * версии; тогда ссылку писать некуда, и уже уложенная картинка забирается обратно, чтобы
 * не остаться в папке статьи бесхозной.
 *
 * `null` — вставки не было, и это не ошибка: окно сменилось, картинка никуда не легла.
 * Место вставки считается ПОСЛЕ ответа сервера, по живому тексту и живому курсору: за время
 * запроса человек мог печатать, и запомненная заранее позиция указывала бы не туда.
 */
export async function вставитьКартинку(
  file: File,
  article: string,
  view: EditorView,
  актуально: () => boolean = () => true,
): Promise<ВставленнаяКартинка | null> {
  const готово = await requestJson<{жетон?: string}>('/api/asset/prepare', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({article, base64: await toBase64(file)}),
  });
  if (!готово.жетон) throw new Error(label('ошибкаКартинки'));

  // Окно сменилось, пока файл ехал: он остался только в карантине и уборка унесёт его сама.
  if (!актуально() || !view.dom.isConnected) return null;

  const уложено = await requestJson<PasteResult>('/api/asset/place', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({article, жетон: готово.жетон}),
  });
  // Без адреса от сервера ссылаться не на что: `![](undefined)` роняет сборку сайта.
  if (!уложено.src) throw new Error(label('ошибкаКартинки'));

  if (!актуально() || !view.dom.isConnected) {
    await забратьОбратно(article, уложено.src);
    return null;
  }

  const текст = view.state.doc.toString();
  const место = местоВставкиКартинки(текст, view.state.selection.main.to, уложено.src, dominantEol(текст));
  // Правка только дописывает (`to` равно `from`): выделенный человеком текст остаётся на месте.
  view.dispatch({
    changes: {from: место.from, to: место.from, insert: место.insert},
    selection: {anchor: место.курсор},
    scrollIntoView: true,
  });
  view.focus();
  предупредитьОРазмере(уложено);

  return {src: уложено.src, узелОт: место.узелОт, узелДо: место.узелДо};
}

/**
 * Забрать уже уложенную картинку обратно в карантин. Неудача самой уборки человеку не
 * показывается: разговор о картинке, которой он на экране не видел (он уже в другой статье),
 * отправил бы его искать несуществующую беду. В журнал окна она при этом попадает.
 */
async function забратьОбратно(article: string, src: string): Promise<void> {
  try {
    await requestJson('/api/asset/withdraw', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({article, src}),
    });
  } catch (ошибка) {
    console.error('картинку не удалось забрать обратно', ошибка);
  }
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

/**
 * Вставка картинки для окна: берёт открытую статью из ref и молчит, когда окно сменилось.
 * Живёт здесь, а не в App, по той же причине, что и загрузка обложки: правило «окно сменилось —
 * ничего не дописываем» проверяется тестом, а App держится в пределах размера файла (SPEC 4.9).
 *
 * Сменой окна считается другая статья, повторное открытие той же самой и просмотр старой версии:
 * в первых двух случаях редактор уже другой, в третьем правка рабочего текста завела бы
 * автосохранение прямо во время чтения версии.
 */
export function makeImageInsert(deps: {
  runSafe: (action: () => Promise<void>, contextKey?: string) => Promise<boolean>;
  статья: Признак<string | null>;
  заход: Признак<number>;
  просмотр: Признак<boolean>;
}): (file: File, view: EditorView) => Promise<ВставленнаяКартинка | null> {
  return async (file, view) => {
    const куда = deps.статья.current;
    // Статьи на экране нет — класть файл некуда: пути к папке не существует.
    if (!куда) return null;

    const заход = deps.заход.current;
    const тоЖеОкно = (): boolean => !deps.просмотр.current
      && deps.статья.current === куда && deps.заход.current === заход;

    let итог: ВставленнаяКартинка | null = null;
    await deps.runSafe(async () => {
      итог = await вставитьКартинку(file, куда, view, тоЖеОкно);
    }, 'ошибкаКартинки');

    // Тип берётся явно: значение присвоено внутри замыкания, и вывод типов этого не видит.
    return итог as ВставленнаяКартинка | null;
  };
}
