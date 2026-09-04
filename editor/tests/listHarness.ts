// Общая обвязка тестов списков: окружение кнопки с тем же разбором, что в окне, и правка кнопкой,
// проведённая через состояние редактора с фильтром разметки. Тестов здесь нет.
import {EditorSelection, EditorState, type TransactionSpec} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {commonmarkLanguage, markdown} from '@codemirror/lang-markdown';
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
import {преобразованиеСписка, type Окружение, type ПравкаСписка} from '../src/core/listConvert';
import {правкаСписка} from '../src/ui/editor/SelectionToolbar';
import {границыСоветов} from '../src/core/tipBlock';
import {КОСАЯ_ПЕРЕНОСА, блокВнеРазбора, внутриОграды} from '../src/ui/livePreview/softBreak';
import {поверхностьРедактирования} from '../src/ui/editor/structureGuard';
import {уровеньСписка} from '../src/ui/editor/listKeys';
import {клавишиПоверхности} from '../src/ui/editor/surfaceKeys';

export function окружение(text: string): Окружение {
  const строки = text.split('\n');
  return {
    дерево: commonmarkLanguage.parser.parse(text),
    границы: границыСоветов(строки, внутриОграды(строки)),
    обычная: (строка) => !блокВнеРазбора(строка),
    косая: (строка) => КОСАЯ_ПЕРЕНОСА.test(строка),
    разбор: (t) => commonmarkLanguage.parser.parse(t),
  };
}

const расширения = () => [history(), markdown({addKeymap: false}), поверхностьРедактирования({})];

/** Правка кнопкой списка, как в окне: две ступени одной транзакцией через фильтр разметки. */
export function кнопка(text: string, from: number, to: number, вид: 'точки' | 'числа'): {текст: string; выбор: string} | null {
  const правка = преобразованиеСписка(text, {from, to}, вид, окружение(text));
  if (правка === null) return null;
  const итог = отправить(EditorState.create({doc: text, extensions: расширения()}), правка);
  const {from: a, to: b} = итог.selection.main;
  return {текст: итог.doc.toString(), выбор: итог.doc.sliceString(a, b)};
}

/** Состояние редактора с полным разбором, курсором или выделением. */
export function состояние(текст: string, from: number, to = from, разобрать = true): EditorState {
  const state = EditorState.create({doc: текст, selection: EditorSelection.range(from, to), extensions: расширения()});
  if (разобрать) ensureSyntaxTree(state, state.doc.length, 5_000);
  return state;
}

/** Нажатие клавиши в порядке окна: раскладка списка, поверхности, затем общая — первая сработавшая команда. */
export function нажать(клавиша: string, state: EditorState): {сработала: boolean; текст: string; курсор: number; state: EditorState} {
  let итог = state;
  const view = {state, dispatch: (spec: TransactionSpec) => { итог = state.update(spec).state; }} as unknown as EditorView;
  const сработала = [...уровеньСписка, ...клавишиПоверхности, ...defaultKeymap, ...historyKeymap]
    .filter((b) => b.key === клавиша)
    .some((b) => b.run?.(view));
  return {сработала, текст: итог.doc.toString(), курсор: итог.selection.main.head, state: итог};
}

/** Кнопка списка на готовом состоянии — той же транзакцией, что отправляет панель окна. */
export function кнопкаНа(state: EditorState, from: number, to: number, вид: 'точки' | 'числа'): EditorState {
  const text = state.doc.toString();
  const правка = преобразованиеСписка(text, {from, to}, вид, окружение(text));
  if (правка === null) throw new Error('кнопка отказала');
  return отправить(state, правка);
}

/** Отправка правки той же функцией, что и панель окна: ступени, выделение и запись истории те же. */
function отправить(state: EditorState, правка: ПравкаСписка): EditorState {
  let итог = state;
  const view = {state, dispatch: (spec: TransactionSpec) => { итог = state.update(spec).state; }, focus: () => {}} as unknown as EditorView;
  правкаСписка(view, правка);
  return итог;
}

/** Набор текста в месте курсора — как печатает человек. */
export function набрать(state: EditorState, текст: string): EditorState {
  const pos = state.selection.main.head;
  return state.update({changes: {from: pos, insert: текст}, selection: {anchor: pos + текст.length}, userEvent: 'input.type'}).state;
}
