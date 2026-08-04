// Внутристрочная разметка: заголовки, жирное, ссылки, списки, картинки.
import {Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import type {Range} from '@codemirror/state';
import {label} from '../labels';

const hidden = Decoration.replace({});

class BulletWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const dot = document.createElement('span');
    dot.className = 'md-bullet';
    dot.textContent = '•';
    return dot;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
    private readonly article: string,
    private readonly from: number,
    private readonly onReady: () => void,
    private readonly onEdit: (from: number) => void,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt && other.from === this.from;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'md-image';

    // Клик по картинке ставит курсор на её строку: исходный markdown раскрывается,
    // и подпись (alt) правится прямо в тексте. Слушатель на самом элементе — надёжнее,
    // чем ловить событие на уровне редактора: атомарный виджет туда его не всегда пускает.
    wrap.addEventListener('mousedown', (event) => {
      event.preventDefault();
      this.onEdit(this.from);
    });

    const img = document.createElement('img');
    img.alt = this.alt;
    // Картинка грузится асинхронно и растёт с нуля до полной высоты. Пока она не загрузилась,
    // CodeMirror держит для строки заниженную высоту, и клик по строкам ниже попадает мимо.
    // Просим редактор пересчитать координаты, как только высота стала настоящей.
    // Слушатель вешаем ДО назначения src, иначе для картинки из кэша load успевает пройти мимо.
    img.addEventListener('load', this.onReady);
    img.src = `/api/asset?article=${encodeURIComponent(this.article)}&src=${encodeURIComponent(this.src)}`;
    // Картинка уже в кэше — load не сработает, а высота сразу настоящая: пересчитываем сами.
    if (img.complete) this.onReady();
    wrap.append(img);

    const caption = document.createElement('span');
    caption.className = this.alt ? 'md-caption' : 'md-caption md-caption-missing';
    caption.textContent = this.alt || label('подписьНеЗаполнена');
    wrap.append(caption);

    return wrap;
  }
}

export function inlinePreview(article: () => string) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view, article());
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = build(update.view, article());
        }
      }
    },
    {decorations: (plugin) => plugin.decorations},
  );
}

function build(view: EditorView, article: string): DecorationSet {
  const list: Range<Decoration>[] = [];
  const doc = view.state.doc;

  const activeLines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const first = doc.lineAt(range.from).number;
    const last = doc.lineAt(range.to).number;
    for (let line = first; line <= last; line += 1) activeLines.add(line);
  }
  const raw = (pos: number): boolean => activeLines.has(doc.lineAt(pos).number);

  // Куски, целиком заменённые на готовый вид: внутрь них другие пометки ставить нельзя.
  const replaced: Array<[number, number]> = [];
  const insideReplaced = (pos: number): boolean => replaced.some(([from, to]) => pos >= from && pos < to);

  const hide = (from: number, to: number): void => {
    if (to > from && !insideReplaced(from)) list.push(hidden.range(from, to));
  };
  const mark = (from: number, to: number, cls: string): void => {
    if (to > from && !insideReplaced(from)) list.push(Decoration.mark({class: cls}).range(from, to));
  };

  // Строки таблиц оформляет отдельный слой — сюда они попадать не должны.
  for (const {from, to} of view.visibleRanges) {
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(to).number;

    for (let number = first; number <= last; number += 1) {
      const line = doc.line(number);
      const text = line.text.trim();
      if (text.startsWith('|')) replaced.push([line.from, line.to]);
      else if (text === '') list.push(Decoration.line({class: 'md-blank'}).range(line.from));
    }
  }

  for (const {from, to} of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (insideReplaced(node.from)) return false;
        const name = node.name;

        if (name === 'Image') {
          // Активная строка показывается исходным markdown — так правится подпись (alt) картинки.
          if (raw(node.from)) return false;
          const text = doc.sliceString(node.from, node.to);
          const parsed = /^!\[([^\]]*)\]\(([^)\s]+)/.exec(text);
          if (!parsed) return false;
          // Блочный виджет здесь недоступен — CodeMirror запрещает блочные декорации из плагина.
          // Поэтому виджет инлайновый, а верную высоту обеспечивает пересчёт после загрузки картинки.
          const widget = new ImageWidget(
            parsed[2], parsed[1], article, node.from,
            () => view.requestMeasure(),
            (from) => {
              view.dispatch({selection: {anchor: view.state.doc.lineAt(from).from}});
              view.focus();
            },
          );
          replaced.push([node.from, node.to]);
          list.push(Decoration.replace({widget}).range(node.from, node.to));
          return false;
        }

        if (/^ATXHeading[1-6]$/.test(name)) {
          const level = name.slice(-1);
          list.push(Decoration.line({class: `md-h${level}`}).range(doc.lineAt(node.from).from));
          return;
        }

        if (name === 'HeaderMark' && !raw(node.from)) {
          let end = node.to;
          if (doc.sliceString(end, end + 1) === ' ') end += 1;
          hide(node.from, end);
          return;
        }

        // Маркер списка показываем точкой, как на сайте, а не дефисом из исходника.
        if (name === 'ListMark' && !raw(node.from)) {
          const sign = doc.sliceString(node.from, node.to);
          if (sign === '-' || sign === '*' || sign === '+') {
            list.push(Decoration.replace({widget: new BulletWidget()}).range(node.from, node.to));
          }
          return;
        }

        if (name === 'StrongEmphasis') return void mark(node.from, node.to, 'md-strong');
        if (name === 'Emphasis') return void mark(node.from, node.to, 'md-em');
        if (name === 'InlineCode') return void mark(node.from, node.to, 'md-code');
        if (name === 'Link') return void mark(node.from, node.to, 'md-link');

        if ((name === 'EmphasisMark' || name === 'CodeMark' || name === 'QuoteMark') && !raw(node.from)) {
          hide(node.from, node.to);
          return;
        }

        if ((name === 'LinkMark' || name === 'URL') && !raw(node.from)) {
          hide(node.from, node.to);
          return;
        }

        if (name === 'FencedCode') {
          const first = doc.lineAt(node.from).number;
          const end = doc.lineAt(Math.min(node.to, doc.length)).number;
          for (let row = first; row <= end; row += 1) {
            list.push(Decoration.line({class: 'md-fence'}).range(doc.line(row).from));
          }
          return false;
        }

        if (name === 'Blockquote') {
          const first = doc.lineAt(node.from).number;
          const end = doc.lineAt(Math.min(node.to, doc.length)).number;
          for (let row = first; row <= end; row += 1) {
            list.push(Decoration.line({class: 'md-quote'}).range(doc.line(row).from));
          }
          return;
        }

        return;
      },
    });
  }

  return Decoration.set(list, true);
}
