import type {EditorView} from '@codemirror/view';
import {блокВ} from './structureGuard';

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

/** Панель блока по горизонтали: не выходит за правый край окна своей шириной. */
export function местоПанели(left: number): number {
  return Math.max(8, Math.min(left, window.innerWidth - 280));
}

/** Панель целиком на экране: не влезла под блоком — поднимается, но выше края экрана не уходит. */
export function поВертикали(top: number, высота: number): number {
  if (высота === 0) return top;

  return Math.max(8, Math.min(top, window.innerHeight - высота - 8));
}

/**
 * Только что вставленный блок: курсор стоит под ним, границы самого тега даёт карта поверхности
 * от знака `<` перед курсором, место панели — у его виджета. `null` — блока или места на экране нет.
 */
export function вставленныйБлок(editor: EditorView, конец: number): {from: number; to: number; left: number; top: number} | null {
  const начало = editor.state.doc.toString().lastIndexOf('<', конец);
  const блок = начало === -1 ? null : блокВ(editor.state, начало);
  const место = блок === null ? null : уУзла(editor, блок.from, '.md-block');
  if (блок === null || место === null) return null;

  return {from: блок.from, to: блок.to, left: место.left, top: место.bottom};
}
