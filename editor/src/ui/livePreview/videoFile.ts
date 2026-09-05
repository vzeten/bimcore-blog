// Видеофайл статьи вместо трёх служебных строк: настоящий проигрыватель без автозапуска.
//
// Слой живёт состоянием редактора вместе с остальными блоками (`blocks.ts`): замена накрывает
// переносы строк, и такую замену CodeMirror принимает только от состояния (SPEC 3.3). Здесь же
// правило «спрятать строку импорта»: им пользуются и карточка товара, и ролик, а второго
// правила про одно и то же не заводится (SPEC 4.3).
import {Decoration, EditorView, WidgetType} from '@codemirror/view';
import type {EditorState, Range} from '@codemirror/state';
import {импортСтатьи} from '../../core/jsxTag.mjs';
import {ИМЯ_БЛОКА_ВИДЕО, видеоТекста, свойствоВидео} from '../../core/videoFile.mjs';
import {адресКартинки} from './assetSrc';
import {label} from '../labels';
import type {БлокВОкне} from './blocks';

/** Что ядро знает о ролике статьи: границы тега, переменная, адрес файла и границы импорта. */
export interface Видеофайл {
  переменная: string;
  адрес: string;
  импорт: {от: number; до: number};
  от: number;
  до: number;
}

/** Свойство тега, которое панель зовёт названием: оно же читается вслух читателю с экрана. */
const НАЗВАНИЕ = 'aria-label';

class VideoFileWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly имяФайла: string,
    private readonly название: string | null,
    private readonly onOpen: ((блок: БлокВОкне) => void) | undefined,
  ) {
    super();
  }

  // Позиция в сравнение НЕ входит: набор буквы выше сдвигает тег, и тот же ролик на новом месте —
  // тот же проигрыватель. Пересоздание DOM на каждую букву гасило бы игру и сбрасывало время
  // (наблюдение владельца 2026-09-05). Где тег стоит сейчас, ручка узнаёт у редактора в момент
  // нажатия (`posAtDOM`), а не из запомненных при отрисовке чисел.
  eq(другой: VideoFileWidget): boolean {
    return другой.src === this.src && другой.имяФайла === this.имяФайла && другой.название === this.название;
  }

  // Сменилось только название или имя файла — проигрыватель остаётся, меняется подпись.
  updateDOM(dom: HTMLElement): boolean {
    if (dom.dataset.src !== this.src) return false;
    this.подписать(dom);
    return true;
  }

  toDOM(): HTMLElement {
    const блок = document.createElement('div');
    блок.className = 'md-video-file';
    блок.dataset.src = this.src;

    // Ролик играет по кнопке человека: ни `autoplay`, ни `loop` окну не нужны — оно показывает
    // место и даёт проверить файл, а не крутит видео само. Кнопки браузера остаются живыми:
    // нажатия внутри проигрывателя редактор не перехватывает (`ignoreEvent`).
    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.src = this.src;
    блок.append(video);

    // Подпись — ручка блока: нажатие выделяет тег целиком и открывает его свойства, дальше
    // работают обычные жесты редактора — `Backspace`/`Delete` убирают блок, отмена возвращает его.
    const низ = document.createElement('span');
    низ.className = 'md-video-file-caption';
    низ.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const view = EditorView.findFromDOM(блок);
      if (view === null) return;
      const ролик = роликУзла(view, блок);
      if (ролик === null) return;
      const место = блок.getBoundingClientRect();
      this.onOpen?.({
        имя: ИМЯ_БЛОКА_ВИДЕО, текст: view.state.sliceDoc(ролик.от, ролик.до), from: ролик.от, to: ролик.до,
        left: место.left, top: место.bottom,
      });
    });
    блок.append(низ);
    this.подписать(блок);

    return блок;
  }

  /** Подпись блока: его имя, название ролика словами человека и имя файла тише. */
  private подписать(блок: HTMLElement): void {
    const низ = блок.querySelector('.md-video-file-caption');
    if (низ === null) return;
    низ.replaceChildren();

    const подпись = document.createElement('span');
    подпись.className = 'md-block-name';
    подпись.textContent = label('блокВидеофайл');
    низ.append(подпись);

    if (this.название !== null && this.название !== '') {
      const название = document.createElement('span');
      название.className = 'md-video-title';
      название.textContent = this.название;
      низ.append(название);
    }

    const файл = document.createElement('span');
    файл.className = this.название ? 'md-video-file-name' : 'md-video-title';
    файл.textContent = this.имяФайла;
    низ.append(файл);
  }
}

/**
 * Ролик, которому принадлежит этот DOM, — по живому положению в документе, а не по числам,
 * запомненным при отрисовке: те устаревают с первой же буквой выше по тексту.
 */
function роликУзла(view: EditorView, блок: HTMLElement): Видеофайл | null {
  const pos = view.posAtDOM(блок);
  const ролики = видеоТекста(view.state.doc.toString()) as Видеофайл[];
  const внутри = ролики.find((в) => в.от <= pos && pos <= в.до);
  if (внутри !== undefined) return внутри;
  // Положение пришлось на край строки блока: берётся ближайший ролик.
  return ролики.reduce<Видеофайл | null>((лучший, в) =>
    (лучший === null || Math.abs(в.от - pos) < Math.abs(лучший.от - pos) ? в : лучший), null);
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
  onБлок?: (блок: БлокВОкне) => void,
): void {
  for (const видео of видеоТекста(текст) as Видеофайл[]) {
    if (код[state.doc.lineAt(видео.от).number - 1]) continue;

    // Адрес идёт серверу таким, как записан в импорте: путь рядом со статьёй он читает сам,
    // одним правилом на все записи (`adapters/assets.mjs`).
    const src = article === '' ? '' : адресКартинки(article, видео.адрес);
    const имяФайла = видео.адрес.split('/').pop() ?? видео.адрес;
    const название = свойствоВидео(текст.slice(видео.от, видео.до), НАЗВАНИЕ) as string | null;
    const widget = new VideoFileWidget(src, имяФайла, название, onБлок);
    list.push(Decoration.replace({widget}).range(видео.от, видео.до));
    спрятатьИмпорт(state, текст, код, видео.переменная, импорты);
  }
}
