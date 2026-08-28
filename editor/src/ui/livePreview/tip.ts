// Совет статьи показывается тем же смысловым блоком, каким его покажет сайт: полоса с названием
// вместо служебной строки `:::tip`, рамка вокруг текста и пустая нижняя кромка вместо `:::`.
//
// Текст совета остаётся обычным текстом редактора: человек нажимает на него и правит прямо там,
// отдельной панели у совета нет. Служебные строки закрыты заменой, а в файле остаются на месте —
// сохранение без правок по-прежнему не меняет ни байта.
//
// Слой живёт состоянием редактора, а не плагином: замена накрывает строку целиком, и CodeMirror
// обязан знать о ней заранее (SPEC 3.3).
import {Decoration, EditorView, WidgetType, type DecorationSet} from '@codemirror/view';
import {StateField, type EditorState, type Range} from '@codemirror/state';
import {названиеСовета, советы} from '../../core/tipBlock';
import {articlePlace} from '../../core/frontmatterRules.mjs';
import {внутриОграды} from './softBreak';
import type {Settings} from '../types';

/** Как назвать совет в этой статье: язык берётся из её пути, слова — из настроек. */
export function названиеСоветаСтатьи(settings: Settings, path: string): string {
  const место = articlePlace(path, settings.контент);
  return названиеСовета(settings.названиеСовета, место.locale, settings.основнойЯзык);
}

/** Название совета вместо служебной строки: своё из скобок или обычное для языка статьи. */
class ЗаголовокСовета extends WidgetType {
  constructor(private readonly название: string) {
    super();
  }

  // Название входит в сравнение: без него CodeMirror оставил бы прежнюю полосу, когда человек
  // сменил собственный заголовок блока.
  eq(другой: ЗаголовокСовета): boolean {
    return другой.название === this.название;
  }

  toDOM(): HTMLElement {
    const полоса = document.createElement('span');
    полоса.className = 'md-tip-name';
    полоса.textContent = this.название;
    return полоса;
  }
}

const ЗАКРЫТИЕ_СПРЯТАНО = Decoration.replace({});
const СТРОКА_СОВЕТА = Decoration.line({class: 'md-tip'});
const ПЕРВАЯ_СТРОКА = Decoration.line({class: 'md-tip md-tip-head'});
const ПОСЛЕДНЯЯ_СТРОКА = Decoration.line({class: 'md-tip md-tip-foot'});

/** Слой блока «Совет». `название` — обычное имя совета на языке открытой статьи. */
export function tipLayer(название: string) {
  return StateField.define<DecorationSet>({
    create: (state) => построить(state, название),
    update: (value, tr) => (tr.docChanged ? построить(tr.state, название) : value),
    provide: (field) => EditorView.decorations.from(field),
  });
}

function построить(state: EditorState, название: string): DecorationSet {
  const строки: string[] = [];
  for (let номер = 1; номер <= state.doc.lines; номер += 1) строки.push(state.doc.line(номер).text);

  const list: Range<Decoration>[] = [];

  for (const совет of советы(строки, внутриОграды(строки))) {
    for (let номер = совет.открытие; номер <= совет.закрытие; номер += 1) {
      const строка = state.doc.line(номер + 1);
      const место = номер === совет.открытие
        ? ПЕРВАЯ_СТРОКА
        : (номер === совет.закрытие ? ПОСЛЕДНЯЯ_СТРОКА : СТРОКА_СОВЕТА);
      list.push(место.range(строка.from));
    }

    const открытие = state.doc.line(совет.открытие + 1);
    const заголовок = new ЗаголовокСовета(совет.заголовок ?? название);
    list.push(Decoration.replace({widget: заголовок}).range(открытие.from, открытие.to));

    // Закрывающая строка остаётся строкой, но пустой: она и есть нижнее поле рамки. Спрятать её
    // вместе с переносом было бы короче на вид, но тогда курсор терял бы место за концом блока.
    const закрытие = state.doc.line(совет.закрытие + 1);
    list.push(ЗАКРЫТИЕ_СПРЯТАНО.range(закрытие.from, закрытие.to));
  }

  return Decoration.set(list, true);
}
