// Запросы окна о товарах и сама вставка карточки.
//
// Каталог и картинку спрашивает сервер: токен магазина в браузер редактора не уезжает. Картинка
// едет в статью той же дорогой, что и файл человека, — карантин, потом укладка рядом со статьёй
// (`/api/asset/place`), и только после этого окно дописывает текст. Пока картинка ехала, человек
// мог уйти в другую статью: тогда уже уложенный файл забирается обратно, чтобы не остаться
// в папке бесхозным, а статья не меняется вовсе.
import type {EditorView} from '@codemirror/view';
import {requestJson} from '../api';
import {label} from '../labels';
import {забратьОбратно} from './images';
import {вставкаКарточки, карточкаУжеЕсть, type Товар} from './productInsert';

export type {Товар};

/** Каталог магазина. Ошибка сети или отказ сервера доходят словами: вставлять товар нечего. */
export async function каталогТоваров(): Promise<Товар[]> {
  const ответ = await requestJson<{товары?: Товар[]}>('/api/products');
  return ответ.товары ?? [];
}

/**
 * Вставка карточки выбранного товара. `null` — вставки не было, и это не ошибка: окно сменилось,
 * картинка никуда не легла. Отказ правила (карточка в статье уже есть, опасный знак в значении)
 * доходит до человека ошибкой, а уже уложенная картинка забирается обратно.
 */
export async function вставитьТовар(вход: {
  article: string;
  view: EditorView;
  товар: Товар;
  название: string;
  описание: string;
  локаль: string | null;
  кнопки: Record<string, string>;
  актуально: () => boolean;
}): Promise<boolean> {
  const {article, view, товар} = вход;
  if (карточкаУжеЕсть(view.state.doc.toString())) throw new Error(label('карточкаУжеЕсть'));

  const готово = await requestJson<{жетон?: string}>('/api/product/image', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({article, id: товар.id}),
  });
  if (!готово.жетон) throw new Error(label('ошибкаКартинки'));

  // Окно сменилось, пока картинка ехала: она осталась только в карантине, уборка унесёт её сама.
  if (!вход.актуально() || !view.dom.isConnected) return false;

  const уложено = await requestJson<{src?: string}>('/api/asset/place', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({article, жетон: готово.жетон}),
  });
  if (!уложено.src) throw new Error(label('ошибкаКартинки'));

  if (!вход.актуально() || !view.dom.isConnected) {
    await забратьОбратно(article, уложено.src);
    return false;
  }

  const текст = view.state.doc.toString();
  const вставка = вставкаКарточки({
    текст,
    at: {from: view.state.selection.main.from, to: view.state.selection.main.to},
    товар,
    название: вход.название,
    описание: вход.описание,
    локаль: вход.локаль,
    src: уложено.src,
    кнопки: вход.кнопки,
  });

  // Правило отказало уже после укладки файла: ссылки на него не будет, значит и файла быть
  // не должно — иначе он уехал бы в публикацию картинкой, которой нет в статье.
  if (вставка === null) {
    await забратьОбратно(article, уложено.src);
    throw new Error(label('карточкаНеСобралась'));
  }

  // Обе правки — одной транзакцией: тег без импорта роняет сборку сайта, импорт без тега
  // оставляет в статье кусок кода ни к чему.
  view.dispatch({
    changes: вставка.правки,
    selection: {anchor: вставка.курсор},
    scrollIntoView: true,
  });
  view.focus();
  return true;
}
