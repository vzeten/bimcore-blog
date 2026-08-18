// Внутристрочная разметка: заголовки, жирное, ссылки, списки, картинки.
import {Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {Annotation, StateEffect, StateField, type Range} from '@codemirror/state';
import {РАЗБОР_КАРТИНКИ, shownAlt} from '../../core/commands';
import {строкаТолькоКартинка} from './imageCaret';

/** Картинка, по которой человек нажал: всё, что нужно панели её свойств. */
export interface КартинкаВОкне {
  src: string;
  /** Подпись как она записана в файле, со знаками экранирования. */
  alt: string;
  from: number;
  to: number;
  /** Где картинка на экране — чтобы панель встала рядом с ней. Координаты окна. */
  left: number;
  top: number;
}

/**
 * Пометка успешной замены файла картинки: показ обязан перечитать байты с диска.
 * Токен уникален у каждой замены — счётчик после перезапуска начался бы заново
 * и совпал бы с тем, что уже лежит в кэше браузера.
 */
export const картинкаЗаменена = StateEffect.define<{src: string; токен: string}>();

/**
 * Пометка правки, сделанной самой панелью картинки. Любая другая правка текста закрывает
 * панель (её позиция узла устаревает), а собственная — нет: панель обязана успеть показать
 * итог человеку, а закрывает себя сама, когда это уместно.
 */
export const правкаПанелиКартинки = Annotation.define<boolean>();

/**
 * Токены замен по пути картинки — часть состояния редактора, а не внешняя карта:
 * внешняя пережила бы смену статьи и подсунула чужой версии чужие токены.
 */
export const версииКартинок = StateField.define<Map<string, string>>({
  create: () => new Map(),
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(картинкаЗаменена)) {
        if (next === value) next = new Map(value);
        next.set(effect.value.src, effect.value.токен);
      }
    }
    return next;
  },
});

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
    private readonly to: number,
    /** Токен последней замены файла: меняет адрес загрузки, чтобы показать новые байты. */
    private readonly версия: string,
    private readonly onReady: () => void,
    private readonly onOpen: (картинка: КартинкаВОкне) => void,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    // Статья входит в ключ на равных: одинаковый узел в другой статье — другая картинка,
    // и переиспользованный DOM показал бы чужой файл.
    return other.src === this.src && other.alt === this.alt && other.from === this.from
      && other.версия === this.версия && other.article === this.article;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'md-image';

    const img = document.createElement('img');

    // Нажатие открывает панель свойств картинки У САМОЙ картинки: она не исчезает, текст
    // не смещается, курсор не переезжает (слово владельца 2026-08-16; раньше клик раскрывал
    // исходную разметку — правка подписи переехала в панель). Слушатель на самом элементе —
    // надёжнее, чем ловить событие на уровне редактора: атомарный виджет его не всегда пускает.
    wrap.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const место = img.getBoundingClientRect();
      this.onOpen({src: this.src, alt: this.alt, from: this.from, to: this.to, left: место.left, top: место.top});
    });

    // Alt-текст живёт атрибутом, как на сайте. Подписью под картинкой он не показывается:
    // на сайте её там нет, а рисовать то, чего читатель не увидит, — неправда показа
    // (слово владельца 2026-08-17). Прочитать и поправить alt можно в панели по нажатию.
    img.alt = shownAlt(this.alt);
    // Картинка грузится асинхронно и растёт с нуля до полной высоты. Пока она не загрузилась,
    // CodeMirror держит для строки заниженную высоту, и клик по строкам ниже попадает мимо.
    // Просим редактор пересчитать координаты, как только высота стала настоящей.
    // Слушатель вешаем ДО назначения src, иначе для картинки из кэша load успевает пройти мимо.
    img.addEventListener('load', this.onReady);
    const метка = this.версия === '' ? '' : `&v=${encodeURIComponent(this.версия)}`;
    img.src = `/api/asset?article=${encodeURIComponent(this.article)}&src=${encodeURIComponent(this.src)}${метка}`;
    // Картинка уже в кэше — load не сработает, а высота сразу настоящая: пересчитываем сами.
    if (img.complete) this.onReady();
    wrap.append(img);

    return wrap;
  }
}

export function inlinePreview(article: () => string, onImage?: (картинка: КартинкаВОкне) => void) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view, article(), onImage);
      }

      update(update: ViewUpdate): void {
        // Замена файла картинки текст не меняет, но виджет обязан перечитать байты — токен
        // замены входит в его ключ, и пересборка декораций создаёт виджет с новым адресом.
        const заменили = update.transactions.some((tr) => tr.effects.some((effect) => effect.is(картинкаЗаменена)));
        if (update.docChanged || update.viewportChanged || update.selectionSet || заменили) {
          this.decorations = build(update.view, article(), onImage);
        }
      }
    },
    {decorations: (plugin) => plugin.decorations},
  );

  return [версииКартинок, plugin];
}

function build(view: EditorView, article: string, onImage?: (картинка: КартинкаВОкне) => void): DecorationSet {
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
          // Картинка остаётся картинкой и на активной строке: раскрытие в исходную разметку
          // заставляло её исчезать и дёргало текст при любом клике рядом (слово владельца
          // 2026-08-17 — зрительных скачков быть не должно). Подпись и файл правятся панелью.
          const text = doc.sliceString(node.from, node.to);
          const parsed = РАЗБОР_КАРТИНКИ.exec(text);
          if (!parsed) return false;
          // Блочный виджет здесь недоступен — CodeMirror запрещает блочные декорации из плагина.
          // Поэтому виджет инлайновый, а верную высоту обеспечивает пересчёт после загрузки картинки.
          const версии = view.state.field(версииКартинок, false);
          const widget = new ImageWidget(
            parsed[2], parsed[1], article, node.from, node.to,
            версии?.get(parsed[2]) ?? '',
            () => view.requestMeasure(),
            (картинка) => onImage?.(картинка),
          );
          replaced.push([node.from, node.to]);
          list.push(Decoration.replace({widget}).range(node.from, node.to));

          // У строки, где нет ничего кроме картинки, схлопывается высота строчного бокса:
          // иначе над и под картинкой остаются две пустые полосы высотой в строку текста,
          // которых на сайте нет (наблюдение владельца 2026-08-17).
          const строка = doc.lineAt(node.from);
          if (строкаТолькоКартинка(строка.text)) {
            list.push(Decoration.line({class: 'md-image-line'}).range(строка.from));
          }
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
