// Клавиши списка в окне: `Enter` продолжает пункт и завершает список на пустом, `Backspace`
// снимает маркер, `Tab` вкладывает пункт, `Shift+Tab` возвращает его наружу.
// Продолжение и завершение — штатные команды markdown; своя привязка нужна только ради настройки:
// по умолчанию `Enter` на пустом втором пункте не завершает список, а вставляет над ним пустую
// строку и делает список разреженным. Уровень пункта считает `src/core/listIndent.ts`.

import {keymap, type Command, type KeyBinding} from '@codemirror/view';
import {deleteMarkupBackward, insertNewlineContinueMarkupCommand} from '@codemirror/lang-markdown';
import {syntaxTree} from '@codemirror/language';
import {вложить, поднять, вСписке} from '../../core/listIndent';
import type {Edit, Selection} from '../../core/commands';
import {КОСАЯ_ПЕРЕНОСА} from '../livePreview/softBreak';

/** Маркер пункта на его первой строке: отступ, знак или номер, точка или скобка. */
const МАРКЕР = /^([ \t]*)(\d{1,9}|[-*+])([.)]?)[ \t]+/;

/**
 * `Enter` на строке-продолжении пункта (после `Shift+Enter`): новый пункт по маркеру самого
 * пункта. Штатная команда на такой строке продолжает абзац отступом и при этом сбивает номера
 * следующих пунктов, поэтому здесь она не годится. Пустое продолжение уходит вместе со своей
 * косой: перенос перед концом пункта остался бы на сайте буквой.
 */
const новыйПунктПослеПродолжения: Command = (view) => {
  const state = view.state;
  const главное = state.selection.main;
  if (state.readOnly || !главное.empty) return false;
  const строка = state.doc.lineAt(главное.from);
  const пусто = строка.text.trim() === '';
  if (пусто && строка.number === 1) return false;
  // Пустое продолжение в дерево пункта не входит: пункт ищется от конца строки выше.
  let пункт: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(пусто ? строка.from - 1 : главное.from, -1);
  while (пункт !== null && пункт.name !== 'ListItem') пункт = пункт.parent;
  if (пункт === null || state.doc.lineAt(пункт.from).number === строка.number) return false;
  const м = МАРКЕР.exec(state.doc.lineAt(пункт.from).text);
  if (м === null) return false;

  const номер = /^\d/.test(м[2]) ? Number(м[2]) : null;
  const маркер = `${м[1]}${номер === null ? м[2] : номер + 1}${м[3]} `;
  const выше = state.doc.line(строка.number - 1);
  const from = пусто ? выше.to - (КОСАЯ_ПЕРЕНОСА.test(выше.text) ? 1 : 0) : главное.from;
  const changes = [{from, to: главное.from, insert: `\n${маркер}`}];
  // Номера следующих пунктов того же списка сдвигаются, пока идут подряд, — как делает штатная команда.
  for (let след = пункт.nextSibling, ожидаемый = номер; след !== null && ожидаемый !== null; след = след.nextSibling) {
    const т = МАРКЕР.exec(state.doc.lineAt(след.from).text);
    if (след.name !== 'ListItem' || т === null || Number(т[2]) !== ожидаемый + 1) break;
    changes.push({from: след.from + т[1].length, to: след.from + т[1].length + т[2].length, insert: String(ожидаемый + 2)});
    ожидаемый += 1;
  }
  view.dispatch({changes, selection: {anchor: from + 1 + маркер.length}, scrollIntoView: true, userEvent: 'input'});
  return true;
};

function команда(правило: (текст: string, где: Selection) => Edit | null): Command {
  return (view) => {
    if (view.state.readOnly) return false;

    const {from, to} = view.state.selection.main;
    const текст = view.state.doc.toString();
    const правка = правило(текст, {from, to});

    // Двигать некуда (первый пункт списка, левый край), но курсор стоит в списке: клавишу забираем
    // себе и текст не трогаем. Иначе `Tab` увёл бы фокус из текста посреди набора списка.
    // Вне списка правило молчит, и `Tab` работает как работал.
    if (!правка) return вСписке(текст, {from, to});

    view.dispatch({
      changes: {from: правка.from, to: правка.to, insert: правка.insert},
      selection: правка.select
        ? {anchor: правка.from + правка.select.from, head: правка.from + правка.select.to}
        : {anchor: правка.from + (правка.caret ?? 0)},
      scrollIntoView: true,
      userEvent: 'input.indent',
    });
    return true;
  };
}

export const уровеньСписка: KeyBinding[] = [
  {key: 'Enter', run: новыйПунктПослеПродолжения},
  {key: 'Enter', run: insertNewlineContinueMarkupCommand({nonTightLists: false})},
  {key: 'Backspace', run: deleteMarkupBackward},
  {key: 'Tab', run: команда(вложить)},
  {key: 'Shift-Tab', run: команда(поднять)},
];

export function клавишиСписка() {
  return keymap.of(уровеньСписка);
}
