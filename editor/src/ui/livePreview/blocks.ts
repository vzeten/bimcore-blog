import {Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import type {Range} from '@codemirror/state';
import {разборТега} from '../../core/jsxBlocks';
import {обложкаВидео} from '../../core/videoLink.mjs';
import {label} from '../labels';
import type {ОписаниеБлока} from '../types';

export interface БлокВОкне {
  имя: string;
  текст: string;
  from: number;
  to: number;
  left: number;
  top: number;
}

export interface ВидБлока {
  имя: string;
  подпись: string;
  выбор: string[];
  /** Название блока словами человека: у видео это его заголовок, а не номер и не адрес. */
  название?: string;
  /** Адрес картинки-обложки. Она украшение: не загрузилась — блок остаётся блоком. */
  обложка?: string;
  /** Блок занимает строку целиком и повторяет пропорции сайта — так устроено видео. */
  воВсюСтроку?: boolean;
}

export function видБлока(
  текст: string,
  блоки: Record<string, ОписаниеБлока>,
  незнакомое: (значение: string) => string,
): ВидБлока | null {
  const разобран = разборТега(текст);
  if (разобран === null) return null;

  const описание = блоки[разобран.имя];
  if (описание === undefined) return null;

  const значение = (имя: string | undefined): string | undefined =>
    (имя === undefined ? undefined : разобран.свойства.find((свойство) => свойство.имя === имя)?.значение);

  // Словами показывается только выбор из заготовок: адрес, дата и число секунд человеку в тексте
  // статьи ничего не говорят, и место блока они бы только замусорили.
  const выбор: string[] = [];
  for (const поле of описание.поля) {
    if (поле.вид !== undefined && поле.вид !== 'выбор') continue;
    const записано = значение(поле.имя);
    if (записано === undefined) continue;
    выбор.push(поле.значения?.[записано] ?? незнакомое(записано));
  }

  const название = значение(описание.названиеПоля)?.trim();
  // Обложку показывает то же поле, которым человек задаёт ссылку: второй настройки про то же
  // самое заводить незачем. Номер непонятен — обложки просто нет, блок от этого не ломается.
  const ссылка = описание.поля.find((поле) => поле.вид === 'ссылкаВидео');
  const обложка = обложкаВидео(значение(ссылка?.имя) ?? '') as string | null;

  return {
    имя: разобран.имя,
    подпись: описание.подпись,
    выбор,
    ...(название !== undefined && название !== '' ? {название} : {}),
    ...(обложка !== null ? {обложка} : {}),
    // Блок со ссылкой на видео человек и на сайте видит целой полосой: показывать его строчной
    // плашкой значит обещать одно, а выпустить другое.
    ...(ссылка !== undefined ? {воВсюСтроку: true} : {}),
  };
}

class BlockWidget extends WidgetType {
  constructor(
    private readonly текст: string,
    private readonly вид: ВидБлока,
    private readonly from: number,
    private readonly to: number,
    private readonly onOpen: ((блок: БлокВОкне) => void) | undefined,
  ) {
    super();
  }

  // Позиция входит в сравнение наравне с текстом: одинаковый тег в другом месте статьи — другой
  // блок, и переиспользованный CodeMirror DOM открыл бы панель с чужими границами узла.
  eq(другой: BlockWidget): boolean {
    return другой.текст === this.текст && другой.from === this.from && тотЖеВыбор(другой.вид, this.вид);
  }

  toDOM(): HTMLElement {
    const блок = this.вид.воВсюСтроку === true ? this.полоса() : this.плашка();

    блок.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const место = блок.getBoundingClientRect();
      this.onOpen?.({
        имя: this.вид.имя, текст: this.текст, from: this.from, to: this.to,
        left: место.left, top: место.bottom,
      });
    });

    return блок;
  }

  /** Обычный блок: подпись и выбранная заготовка одной строкой. Так показан призыв к действию. */
  private плашка(): HTMLElement {
    const блок = document.createElement('span');
    блок.className = 'md-block';

    const подпись = document.createElement('span');
    подпись.className = 'md-block-name';
    подпись.textContent = this.вид.подпись;
    блок.append(подпись);

    for (const слово of this.вид.выбор) {
      const выбор = document.createElement('span');
      выбор.className = 'md-block-choice';
      выбор.textContent = слово;
      блок.append(выбор);
    }

    return блок;
  }

  /**
   * Видео так, как его увидит читатель: полоса во всю ширину текста, пропорции 16:9, обложка и
   * знак воспроизведения. Само видео здесь не играет — окно показывает место, а не проигрыватель.
   */
  private полоса(): HTMLElement {
    const блок = document.createElement('div');
    блок.className = 'md-video';

    // Обложка — украшение, а не содержание блока: её грузят из сети, и сети может не быть.
    // Не загрузилась — картинка убирается, и остаётся та же полоса с подписью и названием.
    if (this.вид.обложка !== undefined) {
      const обложка = document.createElement('img');
      обложка.className = 'md-video-cover';
      обложка.src = this.вид.обложка;
      обложка.alt = '';
      обложка.addEventListener('error', () => обложка.remove());
      блок.append(обложка);
    }

    const знак = document.createElement('span');
    знак.className = 'md-video-play';
    блок.append(знак);

    const низ = document.createElement('span');
    низ.className = 'md-video-caption';

    const подпись = document.createElement('span');
    подпись.className = 'md-block-name';
    подпись.textContent = this.вид.подпись;
    низ.append(подпись);

    if (this.вид.название !== undefined) {
      const название = document.createElement('span');
      название.className = 'md-video-title';
      название.textContent = this.вид.название;
      низ.append(название);
    }

    блок.append(низ);

    return блок;
  }
}

function тотЖеВыбор(один: ВидБлока, другой: ВидБлока): boolean {
  return один.выбор.length === другой.выбор.length
    && один.выбор.every((слово, номер) => слово === другой.выбор[номер])
    && один.название === другой.название
    && один.обложка === другой.обложка;
}

export function blockPreview(блоки: Record<string, ОписаниеБлока>, onБлок?: (блок: БлокВОкне) => void) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view, блоки, onБлок);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) this.decorations = build(update.view, блоки, onБлок);
      }
    },
    {decorations: (plugin) => plugin.decorations},
  );
}

function build(
  view: EditorView,
  блоки: Record<string, ОписаниеБлока>,
  onБлок?: (блок: БлокВОкне) => void,
): DecorationSet {
  const list: Range<Decoration>[] = [];

  for (const {from, to} of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'HTMLTag') return;

        const текст = view.state.doc.sliceString(node.from, node.to);
        const вид = видБлока(текст, блоки, (значение) => label('блокНеизвестен', {значение}));
        if (вид === null) return;

        // Видео занимает свою строку целиком — значит и заменяется целой строкой: рядом с полосой
        // не остаётся текста, куда встал бы курсор посреди JSX. Тег, делящий строку с текстом,
        // такой заменой разорвал бы абзац, и ему достаётся ровно его собственный кусок.
        //
        // Блочной декорацией (`block: true`) это делать нельзя: CodeMirror принимает такие только
        // от поля состояния, а слой показа живёт плагином, и программа падала бы прямо при
        // открытии статьи. Полосу во всю ширину даёт сам виджет — его корень блочный.
        const строка = view.state.doc.lineAt(node.from);
        const целаяСтрока = вид.воВсюСтроку === true
          && строка.from === node.from && строка.to === node.to;
        const от = целаяСтрока ? строка.from : node.from;
        const до = целаяСтрока ? строка.to : node.to;

        const widget = new BlockWidget(текст, вид, node.from, node.to, onБлок);
        list.push(Decoration.replace({widget}).range(от, до));
      },
    });
  }

  return Decoration.set(list, true);
}
