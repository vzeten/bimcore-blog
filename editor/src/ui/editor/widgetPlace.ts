import type {EditorView} from '@codemirror/view';

export interface Края {
  left: number;
  top: number;
  bottom: number;
}

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
