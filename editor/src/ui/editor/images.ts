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
  const answer = await requestJson<PasteResult>('/api/asset/paste', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      article,
      base64: await toBase64(file),
      ext: (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg'),
    }),
  });

  // Без адреса от сервера картинку не вставляем: `![](undefined)` роняет сборку сайта.
  if (!answer.src) throw new Error(label('ошибкаКартинки'));

  // Человек уже не в рабочем тексте — дописывать в него нельзя, даже свою же картинку.
  if (!актуально()) return;

  // Курсор уводим на следующую строку: пока он на строке картинки, видна разметка, а не картинка.
  const at = view.state.selection.main;
  const text = `![](${answer.src})\n`;
  view.dispatch({changes: {from: at.from, to: at.to, insert: text}, selection: {anchor: at.from + text.length}});
  view.focus();

  if (answer.тяжёлая) window.alert(label('тяжёлаяКартинка', {килобайт: answer.килобайт ?? 0}));
}

/**
 * Отправляет новый файл картинки на сервер. Бросает, если замена не прошла.
 * Сетевая часть отделена от выбора файла и перезагрузки — так проверяется поведение без DOM.
 */
export async function uploadReplacement(article: string, src: string, file: File): Promise<void> {
  await requestJson('/api/asset/replace', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({article, src, base64: await toBase64(file)}),
  });
}

/**
 * Заменяет файл картинки. Страница перезагружается ТОЛЬКО при успехе:
 * если замена не прошла, `uploadReplacement` бросает — до перезагрузки дело не доходит.
 * `onFail` показывает ошибку в окне (панель ошибки), а не через alert.
 *
 * TODO(В1-07): подключить к кнопке замены картинки в интерфейсе и покрыть весь пользовательский путь.
 * Пока к кнопке НЕ подключено — точка входа на будущее; тестом покрыта только сетевая часть
 * (`uploadReplacement`), не весь путь.
 */
export async function replaceImage(article: string, src: string, onFail: (message: string) => void): Promise<void> {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/*';

  picker.onchange = async () => {
    const file = picker.files?.[0];
    if (!file) return;
    try {
      await uploadReplacement(article, src, file);
      window.location.reload();
    } catch (error) {
      onFail(error instanceof Error ? error.message : label('ошибкаЗамены'));
    }
  };

  picker.click();
}
