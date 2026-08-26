// Клавиши уровня списка в окне: `Tab` вкладывает пункт, `Shift+Tab` возвращает его наружу.
// Здесь только связь редактора с правилом: сам расчёт живёт в `src/core/listIndent.ts`.

import {keymap, type Command, type KeyBinding} from '@codemirror/view';
import {вложить, поднять, вСписке} from '../../core/listIndent';
import type {Edit, Selection} from '../../core/commands';

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
  {key: 'Tab', run: команда(вложить)},
  {key: 'Shift-Tab', run: команда(поднять)},
];

export function клавишиСписка() {
  return keymap.of(уровеньСписка);
}
