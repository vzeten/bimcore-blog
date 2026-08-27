import {Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import type {Range} from '@codemirror/state';
import {разборТега} from '../../core/jsxBlocks';
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

  const выбор: string[] = [];
  for (const поле of описание.поля) {
    const значение = разобран.свойства.find((свойство) => свойство.имя === поле.имя)?.значение;
    if (значение === undefined) continue;
    выбор.push(поле.значения[значение] ?? незнакомое(значение));
  }

  return {имя: разобран.имя, подпись: описание.подпись, выбор};
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
}

function тотЖеВыбор(один: ВидБлока, другой: ВидБлока): boolean {
  return один.выбор.length === другой.выбор.length
    && один.выбор.every((слово, номер) => слово === другой.выбор[номер]);
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

        const widget = new BlockWidget(текст, вид, node.from, node.to, onБлок);
        list.push(Decoration.replace({widget}).range(node.from, node.to));
      },
    });
  }

  return Decoration.set(list, true);
}
