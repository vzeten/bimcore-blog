// Клавиши обычного абзаца: `Enter` начинает новый абзац, `Shift+Enter` — жёсткий перенос строки
// внутри текущего. Прежде `Enter` вставлял одиночный перенос, а он в обычном абзаце мягкий:
// живой показ склеивал его пробелом, и набранное зрительно возвращалось в предыдущий абзац.
//
// Раскладка стоит между раскладкой markdown (`Prec.high`, продолжает списки и цитаты) и общей:
// в списке, заголовке, таблице, коде и MDX-конструкции правило молчит, и клавиши работают как
// работали. В спорном случае молчать безопаснее, чем разорвать чужой блок.

import {keymap, type Command, type KeyBinding} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import type {EditorState} from '@codemirror/state';
import {строкаАбзаца} from '../livePreview/softBreak';

/**
 * Куда вставлять: позиция курсора, если он стоит в обычном абзаце. Иначе null.
 *
 * Абзац ищется в уже подключённом дереве markdown тем же взглядом, что у его раскладки, — узел
 * слева от курсора. Годится только `Paragraph`, лежащий прямо в документе: абзац внутри списка
 * или цитаты принадлежит своему блоку. Чего commonmark-разбор не знает — GFM-таблицу,
 * многострочный MDX-тег, строку-картинку — отсекает существующее строковое правило показа
 * (`строкаАбзаца`), проверенное на первой строке узла и строке курсора. Выделение — не курсор:
 * с ним правило молчит, и клавиша работает как раньше.
 */
export function точкаВОбычномАбзаце(state: EditorState): number | null {
  const главное = state.selection.main;
  if (!главное.empty) return null;

  const узел = syntaxTree(state).resolveInner(главное.from, -1);
  let абзац: typeof узел | null = узел;
  while (абзац !== null && абзац.name !== 'Paragraph') абзац = абзац.parent;
  if (абзац === null || абзац.parent?.name !== 'Document') return null;

  const перваяСтрока = state.doc.lineAt(абзац.from).text;
  const строкаКурсора = state.doc.lineAt(главное.from).text;
  if (!строкаАбзаца(перваяСтрока) || !строкаАбзаца(строкаКурсора)) return null;

  return главное.from;
}

function вставка(текст: string): Command {
  return (view) => {
    if (view.state.readOnly) return false;

    const где = точкаВОбычномАбзаце(view.state);
    if (где === null) return false;

    view.dispatch({
      changes: {from: где, insert: текст},
      selection: {anchor: где + текст.length},
      scrollIntoView: true,
      userEvent: 'input',
    });
    return true;
  };
}

/** Разделитель абзацев и жёсткий перенос `\` — синтаксис markdown, не настройка (SPEC 4.4). */
export const клавишиАбзаца: KeyBinding[] = [
  {key: 'Enter', run: вставка('\n\n')},
  {key: 'Shift-Enter', run: вставка('\\\n')},
];

export function абзацныеКлавиши() {
  return keymap.of(клавишиАбзаца);
}
