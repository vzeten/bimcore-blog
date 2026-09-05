// Видеофайл статьи вместо трёх служебных строк: настоящий проигрыватель без автозапуска.
//
// Слой живёт состоянием редактора вместе с остальными блоками (`blocks.ts`): замена накрывает
// переносы строк, и такую замену CodeMirror принимает только от состояния (SPEC 3.3). Здесь же
// правило «спрятать строку импорта»: им пользуются и карточка товара, и ролик, а второго
// правила про одно и то же не заводится (SPEC 4.3).
import {Decoration, EditorView, WidgetType} from '@codemirror/view';
import {EditorSelection, type EditorState, type Range} from '@codemirror/state';
import {импортСтатьи} from '../../core/jsxTag.mjs';
import {видеоТекста} from '../../core/videoFile.mjs';
import {адресКартинки} from './assetSrc';
import {label} from '../labels';

/** Что ядро знает о ролике статьи: границы тега, переменная, адрес файла и границы импорта. */
export interface Видеофайл {
  переменная: string;
  адрес: string;
  импорт: {от: number; до: number};
  от: number;
  до: number;
}

class VideoFileWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly имяФайла: string,
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }

  // Позиция входит в сравнение наравне с адресом: тот же ролик в другом месте статьи — другой
  // блок, и переиспользованный DOM выделял бы по нажатию чужие границы.
  eq(другой: VideoFileWidget): boolean {
    return другой.src === this.src && другой.from === this.from && другой.to === this.to;
  }

  toDOM(): HTMLElement {
    const блок = document.createElement('div');
    блок.className = 'md-video-file';

    // Ролик играет по кнопке человека: ни `autoplay`, ни `loop` окну не нужны — оно показывает
    // место и даёт проверить файл, а не крутит видео само. Кнопки браузера остаются живыми:
    // нажатия внутри проигрывателя редактор не перехватывает (`ignoreEvent`).
    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.src = this.src;
    блок.append(video);

    // Подпись — ручка блока: нажатие выделяет тег целиком, дальше работают обычные жесты
    // редактора — `Backspace`/`Delete` убирают блок, отмена возвращает его.
    const низ = document.createElement('span');
    низ.className = 'md-video-file-caption';
    const подпись = document.createElement('span');
    подпись.className = 'md-block-name';
    подпись.textContent = label('блокВидеофайл');
    const файл = document.createElement('span');
    файл.className = 'md-video-title';
    файл.textContent = this.имяФайла;
    низ.append(подпись, файл);
    низ.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const view = EditorView.findFromDOM(блок);
      view?.dispatch({selection: EditorSelection.range(this.from, this.to), scrollIntoView: true});
      view?.focus();
    });
    блок.append(низ);

    return блок;
  }
}

/**
 * Служебная строка `import … from '…'` человеку не показывается: рядом с блоком она выглядит
 * куском кода посреди статьи, а нужна она только сайту. В файле строка остаётся на месте, а в
 * окне занимает нулевую высоту — иначе на её месте оставалась бы пустая строка.
 *
 * Вместе со строкой прячется пустая строка под ней: в MDX она принадлежит самому импорту —
 * отделяет служебную строку от разметки, — и без неё над блоком оставался бы лишний пустой ряд.
 * Пустых строк подряд правило берёт ровно одну: вторая уже собственный отступ человека, и
 * съесть её значило бы менять вид статьи там, где его задал он.
 *
 * Внутри огороженного кода строка остаётся примером, как и сам тег.
 */
export function спрятатьИмпорт(
  state: EditorState,
  текст: string,
  код: boolean[],
  переменная: string,
  импорты: Map<number, number>,
): void {
  const импорт = импортСтатьи(текст, переменная) as {от: number} | null;
  if (импорт === null) return;

  const строка = state.doc.lineAt(импорт.от);
  if (код[строка.number - 1]) return;

  const следом = строка.number < state.doc.lines ? state.doc.line(строка.number + 1) : null;
  const конец = следом !== null && следом.text.trim() === '' ? следом.to : строка.to;

  импорты.set(строка.from, Math.min(конец + 1, state.doc.length));
}

/**
 * Ролики статьи: каждый понятный тег `<video>` заменяется проигрывателем целиком — все три
 * строки, — а его импорт прячется тем же правилом, что импорт карточки. Тег внутри
 * огороженного кода остаётся примером. Что ядро не признало роликом, здесь не трогается вовсе.
 */
export function видеофайлыСтатьи(
  state: EditorState,
  текст: string,
  код: boolean[],
  article: string,
  импорты: Map<number, number>,
  list: Range<Decoration>[],
): void {
  for (const видео of видеоТекста(текст) as Видеофайл[]) {
    if (код[state.doc.lineAt(видео.от).number - 1]) continue;

    // Адрес идёт серверу таким, как записан в импорте: путь рядом со статьёй он читает сам,
    // одним правилом на все записи (`adapters/assets.mjs`).
    const src = article === '' ? '' : адресКартинки(article, видео.адрес);
    const имяФайла = видео.адрес.split('/').pop() ?? видео.адрес;
    const widget = new VideoFileWidget(src, имяФайла, видео.от, видео.до);
    list.push(Decoration.replace({widget}).range(видео.от, видео.до));
    спрятатьИмпорт(state, текст, код, видео.переменная, импорты);
  }
}
