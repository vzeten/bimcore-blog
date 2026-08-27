// Где на экране виджет редактора. Одно правило на обе панели свойств: у картинки панель встаёт
// у её верхнего края, у блока статьи — под ним, поэтому здесь отдаются оба края сразу.
// Вынесено из зоны статьи ради предела размера файла (SPEC 4.9); состояния тут нет.

import type {EditorView} from '@codemirror/view';

/** Края виджета в координатах окна. */
export interface Края {
  left: number;
  top: number;
  bottom: number;
}

/**
 * Сначала спрашивается сам виджет — он знает свои настоящие края; если он ещё не построен,
 * берётся место позиции в тексте. `null` — показать панель не у чего: строка вне видимой части.
 */
export function уУзла(editor: EditorView, позиция: number, класс: string): Края | null {
  const узел = editor.domAtPos(позиция).node;
  const элемент = узел instanceof HTMLElement ? узел : узел.parentElement;
  const виджет = элемент?.closest(класс) ?? элемент?.querySelector(класс);
  if (виджет instanceof HTMLElement) {
    const место = виджет.getBoundingClientRect();
    return {left: место.left, top: место.top, bottom: место.bottom};
  }

  const место = editor.coordsAtPos(позиция);
  return место === null ? null : {left: место.left, top: место.top, bottom: место.bottom};
}
