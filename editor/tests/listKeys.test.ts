// Имя каждого теста повторяет формулировку правила.
// Клавиши списка на настоящем состоянии редактора: раскладка списка идёт первой, как в окне.
import {describe, expect, it} from 'vitest';
import {EditorSelection, EditorState, type TransactionSpec} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {markdown} from '@codemirror/lang-markdown';
import {поверхностьРедактирования} from '../src/ui/editor/structureGuard';
import {уровеньСписка} from '../src/ui/editor/listKeys';
import {клавишиПоверхности} from '../src/ui/editor/surfaceKeys';

function состояние(текст: string, курсор: number): EditorState {
  const state = EditorState.create({
    doc: текст,
    selection: EditorSelection.single(курсор),
    extensions: [markdown({addKeymap: false}), поверхностьРедактирования({})],
  });
  ensureSyntaxTree(state, state.doc.length, 1_000);
  return state;
}

/** Нажатие клавиши: раскладка списка, затем раскладка поверхности — первая сработавшая команда. */
function нажать(клавиша: string, state: EditorState) {
  let итог = state;
  const view = {state, dispatch: (spec: TransactionSpec) => { итог = state.update(spec).state; }} as unknown as EditorView;
  const сработала = [...уровеньСписка, ...клавишиПоверхности].filter((b) => b.key === клавиша).some((b) => b.run?.(view));
  return {сработала, текст: итог.doc.toString(), курсор: итог.selection.main.head};
}

describe('Enter в списке: пункт продолжается, пустой пункт завершает список без разрежения', () => {
  it('Enter в конце пункта даёт следующий пункт с тем же маркером', () => {
    expect(нажать('Enter', состояние('- a', 3))).toMatchObject({текст: '- a\n- ', курсор: 6});
  });

  it('Enter на пустом втором пункте завершает список, не вставляя над ним пустую строку', () => {
    expect(нажать('Enter', состояние('- a\n- ', 6))).toMatchObject({текст: '- a\n\n', курсор: 5});
    expect(нажать('Enter', состояние('1. a\n2. ', 8))).toMatchObject({текст: '1. a\n\n', курсор: 6});
  });

  it('Enter на пустом пункте перед абзацем даёт пустой абзац с разделителями по обе стороны', () => {
    expect(нажать('Enter', состояние('- a\n- b\n- \n\nАбзац.', 10))).toMatchObject({текст: '- a\n- b\n\n\n\nАбзац.', курсор: 9});
  });

  it('Enter на пустом пункте у границы примечания не ставит перед ней пустую строку', () => {
    expect(нажать('Enter', состояние(':::tip\n- a\n- \n:::', 13))).toMatchObject({текст: ':::tip\n- a\n\n\n:::', курсор: 12});
  });

  it('Enter на пустом пункте перед пустым абзацем уводит курсор в него, не заводя второй', () => {
    expect(нажать('Enter', состояние('- a\n- \n', 6))).toMatchObject({текст: '- a\n\n', курсор: 5});
    expect(нажать('Enter', состояние(':::tip\n- a\n- \n\n:::', 13))).toMatchObject({текст: ':::tip\n- a\n\n\n:::', курсор: 12});
  });
});

describe('Enter на строке-продолжении пункта после Shift+Enter даёт новый пункт', () => {
  it('маркированный: новый пункт с тем же маркером', () => {
    expect(нажать('Enter', состояние('- раз\\\n  два', 12))).toMatchObject({текст: '- раз\\\n  два\n- ', курсор: 15});
  });

  it('нумерованный: следующий номер, а номера дальше сдвигаются, пока идут подряд', () => {
    expect(нажать('Enter', состояние('1. a\\\n   b\n2. c\n3. d\n\n7. e', 10)))
      .toMatchObject({текст: '1. a\\\n   b\n2. \n3. c\n4. d\n\n7. e', курсор: 14});
  });

  it('пустое продолжение уходит вместе с косой переноса: перед концом пункта она была бы буквой', () => {
    expect(нажать('Enter', состояние('1. a\\\n   \n2. b', 9))).toMatchObject({текст: '1. a\n2. \n3. b', курсор: 8});
  });

  it('на первой строке пункта команда молчит и уступает штатной', () => {
    expect(нажать('Enter', состояние('- a\n- b', 7))).toMatchObject({текст: '- a\n- b\n- '});
  });
});

describe('Shift+Enter в пункте списка переносит текст внутри пункта', () => {
  it('косая и отступ в колонку содержимого: два пробела у точки, три у номера', () => {
    expect(нажать('Shift-Enter', состояние('- раз два', 5))).toMatchObject({текст: '- раз\\\n   два', курсор: 9});
    expect(нажать('Shift-Enter', состояние('1. раз', 6))).toMatchObject({текст: '1. раз\\\n   ', курсор: 11});
  });

  it('отступ не больше трёх пробелов: четыре построчный разбор счёл бы кодом', () => {
    expect(нажать('Shift-Enter', состояние('10. раз', 7))).toMatchObject({текст: '10. раз\\\n   ', курсор: 12});
  });

  it('в обычном абзаце перенос без отступа, как и был', () => {
    expect(нажать('Shift-Enter', состояние('раз два', 3))).toMatchObject({текст: 'раз\\\n два', курсор: 5});
  });
});
