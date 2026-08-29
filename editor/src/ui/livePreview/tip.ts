// Смысловые блоки статьи показываются тем же видом, каким их покажет сайт: полоса с названием
// вместо служебной строки `:::tip`, рамка вокруг текста и пустая нижняя кромка вместо `:::`.
//
// Слой живёт состоянием редактора, а не плагином: замена накрывает строку целиком, и CodeMirror
// обязан знать о ней заранее (SPEC 3.3).
import {Decoration, EditorView, WidgetType, type DecorationSet} from '@codemirror/view';
import {StateField, type EditorState, type Range} from '@codemirror/state';
import {названияБлоков, советы} from '../../core/tipBlock';
import {articlePlace} from '../../core/frontmatterRules.mjs';
import {внутриОграды} from './softBreak';
import type {Settings} from '../types';

export function названиеСоветаСтатьи(settings: Settings, path: string): Record<string, string> {
  const место = articlePlace(path, settings.контент);
  return названияБлоков(settings.названияБлоков, место.locale, settings.основнойЯзык);
}

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
const строкаБлока = (тип: string, место: string) =>
  Decoration.line({class: `md-tip md-tip-${тип}${место}`});

export function tipLayer(названия: Record<string, string>) {
  return StateField.define<DecorationSet>({
    create: (state) => построить(state, названия),
    update: (value, tr) => (tr.docChanged ? построить(tr.state, названия) : value),
    provide: (field) => EditorView.decorations.from(field),
  });
}

function построить(state: EditorState, названия: Record<string, string>): DecorationSet {
  const строки: string[] = [];
  for (let номер = 1; номер <= state.doc.lines; номер += 1) строки.push(state.doc.line(номер).text);

  const list: Range<Decoration>[] = [];

  for (const совет of советы(строки, внутриОграды(строки))) {
    for (let номер = совет.открытие; номер <= совет.закрытие; номер += 1) {
      const строка = state.doc.line(номер + 1);
      const место = номер === совет.открытие
        ? ' md-tip-head'
        : (номер === совет.закрытие ? ' md-tip-foot' : '');
      list.push(строкаБлока(совет.тип, место).range(строка.from));
    }

    const открытие = state.doc.line(совет.открытие + 1);
    const заголовок = new ЗаголовокСовета(совет.заголовок ?? названия[совет.тип] ?? '');
    list.push(Decoration.replace({widget: заголовок}).range(открытие.from, открытие.to));

    // Закрывающая строка остаётся строкой, но пустой: она и есть нижнее поле рамки. Спрятать её
    // вместе с переносом было бы короче на вид, но тогда курсор терял бы место за концом блока.
    const закрытие = state.doc.line(совет.закрытие + 1);
    list.push(ЗАКРЫТИЕ_СПРЯТАНО.range(закрытие.from, закрытие.to));
  }

  return Decoration.set(list, true);
}
