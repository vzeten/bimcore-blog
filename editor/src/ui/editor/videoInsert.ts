// Вставка видеофайла (WebM) из меню: выбор файла, заслон окна, та же дорога, что у картинки —
// карантин, укладка рядом со статьёй, отзыв при смене окна, — и две правки текста одной
// транзакцией: импорт ролика и тег `<video>` записью образца с диска.
//
// Тег без импорта роняет сборку сайта, импорт без тега оставляет в статье кусок кода ни к чему,
// поэтому обе правки идут вместе, и отмена возвращает обе (SPEC 3.3, правило карточки товара).
import type {EditorView} from '@codemirror/view';
import {label} from '../labels';
import {requestJson} from '../api';
import {вставкаБлока} from '../../core/jsxBlocks';
import {НАЧАЛЬНЫХ_БАЙТ_ВИДЕО, похожеНаВидео} from '../../core/imageType.mjs';
import {webmПеревесил, текстОтказаГиф} from '../../core/imageWeight.mjs';
import {РАСШИРЕНИЕ_ВИДЕО, импортВидео, местоИмпорта, новыйВидеоТег, свободнаяПеременная} from '../../core/videoFile.mjs';
import {toBase64, забратьОбратно, уложитьПодготовленную} from './images';
import type {Selection} from '../../core/commands';
import type {Settings} from '../types';

/** Предел веса ролика и слова отказов: и то и другое — настройки, окну они приходят готовыми. */
export interface ПравилоВидео {
  пределМегабайт: number;
  отказВес: string;
  отказТип: string;
}

/** Правило из настроек. `null` — настройки ещё не пришли, а без них не открыта и статья. */
export function правилоВидео(settings: Settings | null): ПравилоВидео | null {
  if (settings === null) return null;

  return {
    пределМегабайт: settings.картинки.пределWebmМегабайт,
    отказВес: settings.ошибкиСервера.webmБольшеПредела,
    отказТип: settings.ошибкиСервера.неверныйТипВидео,
  };
}

/**
 * Заслон окна перед отправкой: не WebM по содержимому либо тяжелее предела — дальше выбора файл
 * не идёт. Читается только начало файла: тащить в память чужой или тяжёлый ролик ради отказа
 * незачем, а слово сервера остаётся вторым, независимым заслоном по всем байтам.
 */
export async function отказВидеофайла(file: File, правило: ПравилоВидео): Promise<string | null> {
  const начало = new Uint8Array(await file.slice(0, НАЧАЛЬНЫХ_БАЙТ_ВИДЕО).arrayBuffer());
  if (!похожеНаВидео(начало)) return правило.отказТип;
  if (webmПеревесил(РАСШИРЕНИЕ_ВИДЕО, file.size, правило.пределМегабайт)) {
    return текстОтказаГиф(правило.отказВес, правило.пределМегабайт);
  }

  return null;
}

export interface Правка {
  from: number;
  to: number;
  insert: string;
}

/**
 * Что дописывается в статью: импорт ролика у начала текста и тег на месте курсора отдельным
 * блоком (правило отступов — общее, `вставкаБлока`). Имя переменной свободное в тексте; импорт
 * не уходит ниже тега, иначе служебная строка стояла бы посреди статьи: курсор в самом начале
 * статьи даёт одну правку — импорт и тег подряд.
 */
export function правкиВидео(текст: string, at: Selection, src: string, название: string): {правки: Правка[]; курсор: number} {
  const переменная = свободнаяПеременная(текст, src);
  const блок = вставкаБлока(текст, at, новыйВидеоТег(переменная, название));
  const место = местоИмпорта(текст) as number;
  const импорт = `${импортВидео(переменная, src)}\n\n`;
  const курсор = импорт.length + блок.from + (блок.caret ?? блок.insert.length);

  if (место >= блок.from) return {правки: [{from: блок.from, to: блок.to, insert: импорт + блок.insert}], курсор};
  return {правки: [{from: место, to: место, insert: импорт}, {from: блок.from, to: блок.to, insert: блок.insert}], курсор};
}

/**
 * Вставка ролика в статью. `null` — вставки не было, и это не ошибка: окно сменилось, пока файл
 * ехал, и уже уложенный файл забран обратно. Место считается ПОСЛЕ ответа сервера, по живому
 * тексту и живому курсору: за время запроса человек мог печатать. Правку, которую поверхность
 * редактора не пропустила, программа не считает вставкой: уложенный файл забирается обратно,
 * иначе он остался бы в папке статьи бесхозным и уехал бы в публикацию.
 */
export async function вставитьВидеофайл(
  file: File,
  article: string,
  view: EditorView,
  правило: ПравилоВидео,
  название: string,
  актуально: () => boolean = () => true,
): Promise<{src: string} | null> {
  const отказ = await отказВидеофайла(file, правило);
  if (отказ !== null) throw new Error(отказ);

  const готово = await requestJson<{жетон?: string}>('/api/asset/prepare', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({article, base64: await toBase64(file), род: 'видео'}),
  });
  if (!готово.жетон) throw new Error(label('ошибкаВидео'));

  // Окно сменилось, пока файл ехал: он остался только в карантине, и уборка унесёт его сама.
  if (!актуально() || !view.dom.isConnected) return null;

  const уложено = await уложитьПодготовленную(article, готово.жетон, () => актуально() && view.dom.isConnected);
  if (уложено === null) return null;

  const было = view.state.doc.toString();
  const {правки, курсор} = правкиВидео(
    было,
    {from: view.state.selection.main.from, to: view.state.selection.main.to},
    уложено.src,
    название,
  );
  view.dispatch({changes: правки, selection: {anchor: курсор}, scrollIntoView: true});
  if (view.state.doc.toString() === было) {
    await забратьОбратно(article, уложено.src);
    throw new Error(label('ошибкаВидео'));
  }
  view.focus();

  return {src: уложено.src};
}

/** Признак, живущий в ref окна: его читают поздние ответы, созданные до того, как всё поменялось. */
interface Признак<T> {
  current: T;
}

/**
 * Вставка ролика для окна — по тем же признакам, что и вставка картинки: другая статья,
 * повторное открытие той же или просмотр старой версии означают «окно сменилось», и в чужой
 * или запертый текст ничего не дописывается. Причина отказа показывается человеку словами.
 */
export function makeVideoInsert(deps: {
  runSafe: (action: () => Promise<void>, contextKey?: string) => Promise<boolean>;
  статья: Признак<string | null>;
  заход: Признак<number>;
  просмотр: Признак<boolean>;
  правило: ПравилоВидео | null;
}): (file: File, view: EditorView, название: string) => Promise<{src: string} | null> {
  return async (file, view, название) => {
    const куда = deps.статья.current;
    // Статьи на экране нет или настройки не пришли — класть файл некуда.
    if (!куда || deps.правило === null) return null;

    const правило = deps.правило;
    const заход = deps.заход.current;
    const тоЖеОкно = (): boolean => !deps.просмотр.current
      && deps.статья.current === куда && deps.заход.current === заход;

    let итог: {src: string} | null = null;
    await deps.runSafe(async () => {
      итог = await вставитьВидеофайл(file, куда, view, правило, название, тоЖеОкно);
    }, 'ошибкаВидео');

    // Тип берётся явно: значение присвоено внутри замыкания, и вывод типов этого не видит.
    return итог as {src: string} | null;
  };
}
