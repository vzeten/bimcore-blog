// Клавиши поверхности: между раскладкой markdown (списки и цитаты продолжает она) и общей.

import type {Command, KeyBinding} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {EditorSelection, type EditorState, type TransactionSpec} from '@codemirror/state';
import {isolateHistory} from '@codemirror/commands';
import {тегиТекста} from '../../core/jsxTag.mjs';
import {видеоТекста, упоминаетсяВне} from '../../core/videoFile.mjs';
import type {Блок} from '../../core/jsxBlocks';
import {строкаАбзаца} from '../livePreview/softBreak';
import {блокВ, контейнерКурсора, поверхность, целойСтрокой, type Диапазон, type Область} from './structureGuard';
import {зазорМеждуПунктами} from './listKeys';

/** Курсор в абзаце (или заголовке) прямо в документе; чего commonmark не знает, отсекает `строкаАбзаца`. */
export function точкаВОбычномАбзаце(state: EditorState, иЗаголовок = false): number | null {
  const главное = state.selection.main;
  if (!главное.empty) return null;

  const исходный = syntaxTree(state).resolveInner(главное.from, -1);
  let узел: typeof исходный | null = исходный;
  while (узел !== null && узел.name !== 'Paragraph' && !(иЗаголовок && /^ATXHeading[1-6]$/.test(узел.name))) узел = узел.parent;
  if (узел === null || узел.parent?.name !== 'Document') return null;
  if (узел.name === 'Paragraph' && !(строкаАбзаца(state.doc.lineAt(узел.from).text) && строкаАбзаца(state.doc.lineAt(главное.from).text))) {
    return null;
  }
  return главное.from;
}

/** Перед последней пустой строкой документа хватает одного перевода; строка того же абзаца вплотную — абзац делится. */
function разделитель(state: EditorState, где: number, заголовок: boolean): {insert: string; anchor: number} {
  const строка = state.doc.lineAt(где);
  const следующая = строка.number < state.doc.lines ? state.doc.line(строка.number + 1) : null;
  if (где !== строка.to || следующая === null) return {insert: '\n\n', anchor: где + 2};
  if (следующая.text.trim() === '') return {insert: следующая.number === state.doc.lines ? '\n' : '\n\n', anchor: где + 2};
  const граница = state.field(поверхность).карта.some((о) => о.вид === 'контейнер' && (о.from === следующая.from || о.to === следующая.to));
  return {insert: '\n\n', anchor: !граница && !заголовок && строкаАбзаца(следующая.text) ? где + 3 : где + 2};
}

/** Выход из последнего пустого абзаца контейнера; контейнер без текста свою пустую строку сохраняет. */
export function выходИзКонтейнера(state: EditorState): TransactionSpec | null {
  const pos = state.selection.main.head;
  const контейнер = контейнерКурсора(state, pos);
  if (контейнер === null || контейнер.тело === undefined || !state.selection.main.empty) return null;

  const doc = state.doc;
  let текст = 0;
  for (let n = doc.lineAt(контейнер.тело.from).number; n <= doc.lineAt(контейнер.тело.to).number; n += 1) {
    if (doc.line(n).text.trim() !== '') текст = n;
  }
  if (текст >= doc.lineAt(pos).number) return null;

  const хвост = {from: текст === 0 ? контейнер.тело.to : doc.line(текст).to, to: контейнер.тело.to};
  const дальше = doc.lineAt(контейнер.to).number < doc.lines ? doc.line(doc.lineAt(контейнер.to).number + 1) : null;
  // За закрытием — разделитель и пустой абзац для текста; текст вплотную получает и свой разделитель.
  return {
    changes: [хвост, {from: контейнер.to, insert: дальше === null || дальше.text.trim() === '' ? '\n\n' : '\n\n\n'}],
    selection: {anchor: контейнер.to - (хвост.to - хвост.from) + 2},
    scrollIntoView: true,
    userEvent: 'input',
  };
}

const новыйАбзац: Command = (view) => {
  const state = view.state;
  if (state.readOnly) return false;

  const выход = выходИзКонтейнера(state);
  if (выход !== null) {
    view.dispatch(выход);
    return true;
  }

  // Пустая строка сразу после жёсткого переноса: перенос уступает место абзацу, иначе косая осталась бы на сайте.
  const pos = state.selection.main.head;
  if (state.selection.main.empty && state.doc.lineAt(pos).text === '' && state.doc.sliceString(pos - 2, pos) === '\\\n') {
    view.dispatch({changes: {from: pos - 2, to: pos, insert: '\n\n'}, selection: {anchor: pos}, scrollIntoView: true, userEvent: 'input'});
    return true;
  }

  const абзац = точкаВОбычномАбзаце(state);
  const где = абзац ?? точкаВОбычномАбзаце(state, true);
  if (где === null) return false;
  const {insert, anchor} = разделитель(state, где, абзац === null);
  view.dispatch({changes: {from: где, insert}, selection: {anchor}, scrollIntoView: true, userEvent: 'input'});
  return true;
};

/**
 * Курсор в абзаце пункта списка: колонка содержимого пункта для строки-продолжения. Не больше трёх
 * пробелов: построчный разбор переносов счёл бы четыре отступным кодом, а меньшая колонка —
 * законное продолжение пункта по CommonMark.
 */
function пунктКурсора(state: EditorState): {где: number; колонка: number} | null {
  const главное = state.selection.main;
  if (!главное.empty) return null;
  let узел: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(главное.from, -1);
  while (узел !== null && узел.name !== 'Paragraph') узел = узел.parent;
  if (узел === null || узел.parent?.name !== 'ListItem') return null;
  const маркер = /^[ \t]*([-*+]|\d{1,9}[.)])[ \t]+/.exec(state.doc.lineAt(узел.parent.from).text);
  return маркер === null ? null : {где: главное.from, колонка: Math.min(3, маркер[0].length)};
}

/** Жёсткий перенос: в абзаце — косая и новая строка, в пункте списка — плюс отступ продолжения. */
const жёсткийПеренос: Command = (view) => {
  if (view.state.readOnly) return false;
  const абзац = точкаВОбычномАбзаце(view.state);
  const пункт = абзац === null ? пунктКурсора(view.state) : null;
  const где = абзац ?? пункт?.где ?? null;
  if (где === null) return false;
  const insert = `\\\n${' '.repeat(пункт?.колонка ?? 0)}`;
  view.dispatch({changes: {from: где, insert}, selection: {anchor: где + insert.length}, scrollIntoView: true, userEvent: 'input'});
  return true;
};

export function удалениеБлока(state: EditorState, блок: Область): Диапазон[] {
  const doc = state.doc;
  const первая = doc.lineAt(блок.from);
  const последняя = doc.lineAt(блок.to);
  const пустая = (n: number): boolean => n >= 1 && n <= doc.lines && doc.line(n).text.trim() === '';
  const правки: Диапазон[] = !целойСтрокой(doc, блок) ? [{from: блок.from, to: блок.to}]
    : пустая(последняя.number + 1) ? [{from: первая.from, to: Math.min(doc.length, doc.line(последняя.number + 1).to + 1)}]
      : [{from: пустая(первая.number - 1) ? doc.line(первая.number - 1).from : первая.from, to: последняя.to}];

  const текст = doc.toString();
  const скрытые = state.field(поверхность).карта.filter((о) => о.вид === 'скрытый' && целойСтрокой(doc, о));
  const карточки = (тегиТекста(текст) as (Блок & {от: number; до: number})[]).filter((тег) => тег.свойства.some((с) => с.выражение));
  const ролики = видеоТекста(текст) as {от: number; до: number; переменная: string; импорт: {от: number}}[];
  if (карточки.length === 1 && карточки[0].от === блок.from && карточки[0].до === блок.to) {
    // Единственная карточка забирает свой импорт; импорты роликов остаются при своих блоках.
    const своиРоликов = new Set(ролики.map((р) => скрытые.find((о) => о.from <= р.импорт.от && р.импорт.от < о.to)));
    for (const о of скрытые) if (!своиРоликов.has(о)) правки.push({from: о.from, to: Math.min(doc.length, о.to + 1)});
  }
  // Ролик забирает свой импорт только тогда, когда переменная больше нигде не упомянута:
  // на один файл могут ссылаться два тега, и второй без импорта уронил бы сборку сайта.
  const ролик = ролики.find((р) => р.от === блок.from && р.до === блок.to);
  const импорт = ролик === undefined ? undefined : скрытые.find((о) => о.from <= ролик.импорт.от && ролик.импорт.от < о.to);
  if (ролик !== undefined && импорт !== undefined && !упоминаетсяВне(текст, ролик.переменная, [блок, импорт])) {
    правки.push({from: импорт.from, to: Math.min(doc.length, импорт.to + 1)});
  }
  return правки;
}

/** За непроходимой областью у курсора: блок, служебное, разделитель или null — удаляет штатная команда. */
function уКрая(state: EditorState, pos: number, вперёд: boolean): Область | 'служебное' | 'разделитель' | null {
  const {карта, области} = state.field(поверхность);
  const область = области.find((о) => (вперёд ? о.from === pos : о.to === pos));
  if (область === undefined) return null;

  const задевает = (о: Диапазон): boolean => о.from < область.to && о.to > область.from;
  // Контейнер задет только своей границей: разделитель между абзацами его тела — обычный.
  const внутри = карта.filter((о) => (о.вид === 'контейнер' && о.тело !== undefined
    ? задевает({from: о.from, to: о.тело.from}) || задевает({from: о.тело.to, to: о.to})
    : задевает(о)));
  const блоки = внутри.filter((о) => о.вид === 'блок');
  if (блоки.length > 0) return вперёд ? блоки[0] : блоки[блоки.length - 1];
  if (внутри.some((о) => о.вид === 'контейнер' || (о.вид === 'скрытый' && целойСтрокой(state.doc, о)))) return 'служебное';
  return внутри.every((о) => о.вид === 'разделитель') ? 'разделитель' : null;
}

function удаление(вперёд: boolean): Command {
  return (view) => {
    const state = view.state;
    if (state.readOnly) return false;
    const выбор = state.selection.main;

    if (!выбор.empty) {
      const блок = блокВ(state, выбор.from);
      if (блок === null || блок.from !== выбор.from || блок.to !== выбор.to) return false;
      const изменения = state.changes(удалениеБлока(state, блок));
      view.dispatch({changes: изменения, selection: {anchor: изменения.mapPos(блок.from)}, scrollIntoView: true, userEvent: 'delete'});
      return true;
    }

    // Зазор между пунктами одного списка уходит целиком: маркер со словами не склеивается. Пустая
    // строка после косой переноса разделителем не считается, поэтому зазор ищется раньше края.
    const зазор = зазорМеждуПунктами(state, выбор.head, вперёд);
    if (зазор !== null) {
      view.dispatch({changes: зазор.changes, selection: {anchor: зазор.anchor}, scrollIntoView: true, userEvent: 'delete', annotations: isolateHistory.of('full')});
      return true;
    }
    const край = уКрая(state, выбор.head, вперёд);
    if (край === null) return false;
    if (край === 'служебное') {
      // Пустой абзац сразу после примечания уходит, курсор — в конец его текста: выход по `Enter`
      // отменяется той же клавишей, что и в обычном тексте.
      const строка = state.doc.lineAt(выбор.head);
      // Ближайшее примечание выше: карта отсортирована по началу, берётся последнее подходящее.
      const примечание = state.field(поверхность).карта.filter((о) => о.вид === 'контейнер' && о.тело !== undefined && о.to < строка.from).pop();
      if (вперёд || строка.text !== '' || примечание === undefined || строка.number === 1) return true;
      view.dispatch({changes: {from: строка.from - 1, to: строка.from}, selection: {anchor: примечание.тело!.to}, scrollIntoView: true, userEvent: 'delete'});
      return true;
    }
    if (край === 'разделитель') {
      if (state.doc.lineAt(выбор.head).text.trim() !== '') return false;
      const перевод = вперёд ? {from: выбор.head, to: выбор.head + 1} : {from: выбор.head - 1, to: выбор.head};
      view.dispatch({changes: перевод, selection: {anchor: перевод.from}, userEvent: 'delete'});
      return true;
    }
    view.dispatch({selection: EditorSelection.range(край.from, край.to), scrollIntoView: true});
    return true;
  };
}

export const клавишиПоверхности: KeyBinding[] = [
  {key: 'Enter', run: новыйАбзац},
  {key: 'Shift-Enter', run: жёсткийПеренос},
  {key: 'Backspace', run: удаление(false)},
  {key: 'Delete', run: удаление(true)},
];
