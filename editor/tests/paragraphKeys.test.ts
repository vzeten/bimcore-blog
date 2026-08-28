// Имя каждого теста повторяет формулировку правила.
// Клавиши обычного абзаца: `Enter` — новый абзац, `Shift+Enter` — жёсткий перенос; вне обычного
// абзаца раскладка молчит, и клавиши работают как работали.
import {describe, expect, it} from 'vitest';
import {EditorSelection, EditorState, type TransactionSpec} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {markdown} from '@codemirror/lang-markdown';
import {клавишиАбзаца, точкаВОбычномАбзаце} from '../src/ui/editor/paragraphKeys';

function состояние(текст: string, курсор: number, конец?: number, толькоЧтение = false): EditorState {
  const state = EditorState.create({
    doc: текст,
    selection: EditorSelection.single(курсор, конец),
    extensions: [markdown(), ...(толькоЧтение ? [EditorState.readOnly.of(true)] : [])],
  });
  // Тест живёт без окна, а дерево markdown парсится лениво — допарсиваем до конца сами.
  ensureSyntaxTree(state, state.doc.length, 1_000);
  return state;
}

/** Нажатие клавиши без окна: фиктивный view отдаёт состояние и записывает правку. */
function нажать(клавиша: 'Enter' | 'Shift-Enter', state: EditorState) {
  const правило = клавишиАбзаца.find((b) => b.key === клавиша);
  if (!правило?.run) throw new Error(`клавиша ${клавиша} не назначена`);

  let правка: TransactionSpec | null = null;
  const view = {state, dispatch: (tr: TransactionSpec) => {правка = tr}} as unknown as EditorView;
  const сработала = правило.run(view);
  return {сработала, правка: правка as TransactionSpec | null};
}

describe('Enter в обычном абзаце создаёт разделитель абзацев', () => {
  it('в конце обычного абзаца вставляется пустая строка, курсор — за ней', () => {
    const текст = 'Первый абзац.';
    const {сработала, правка} = нажать('Enter', состояние(текст, текст.length));

    expect(сработала).toBe(true);
    expect(правка?.changes).toEqual({from: текст.length, insert: '\n\n'});
    expect(правка?.selection).toEqual({anchor: текст.length + 2});
  });

  it('посреди абзаца текст разделяется на два абзаца без потери символов', () => {
    const {сработала, правка} = нажать('Enter', состояние('Один два', 4));

    expect(сработала).toBe(true);
    expect(правка?.changes).toEqual({from: 4, insert: '\n\n'});
  });

  it('в абзаце из нескольких строк с мягкими переносами правило тоже действует', () => {
    const текст = 'строка одна\nстрока две';
    expect(точкаВОбычномАбзаце(состояние(текст, текст.length))).toBe(текст.length);
  });
});

describe('Shift+Enter создаёт жёсткий перенос внутри того же абзаца', () => {
  it('вставляется обратная косая и перенос — их понимают и сайт, и показ', () => {
    const текст = 'Первый абзац.';
    const {сработала, правка} = нажать('Shift-Enter', состояние(текст, текст.length));

    expect(сработала).toBe(true);
    expect(правка?.changes).toEqual({from: текст.length, insert: '\\\n'});
    expect(правка?.selection).toEqual({anchor: текст.length + 2});
  });
});

describe('вне обычного абзаца раскладка молчит, и клавиши работают как работали', () => {
  const молчит = (текст: string, курсор: number) => {
    expect(точкаВОбычномАбзаце(состояние(текст, курсор)), текст).toBeNull();
  };

  it('в пункте списка список продолжает раскладка markdown', () => {
    молчит('- первый пункт', '- первый пункт'.length);
    молчит('1. первый пункт', '1. первый пункт'.length);
  });

  it('заголовок не разрывается', () => {
    молчит('# Заголовок', '# Заголовок'.length);
  });

  it('цитата не разрывается', () => {
    молчит('> строка цитаты', '> строка цитаты'.length);
  });

  it('огороженный и отступной код не разрываются', () => {
    молчит('```\nconst x = 1;\n```', '```\nconst x'.length);
    молчит('код абзаца\n\n    отступной код', 'код абзаца\n\n    отступной код'.length);
  });

  it('таблица не разрывается: commonmark-разбор её не знает, отсекает строковое правило', () => {
    молчит('| а | б |\n| --- | --- |', '| а | б |'.length);
  });

  it('JSX и многострочный MDX-тег не разрываются', () => {
    молчит('<CTA type="demo" />', '<CTA type="demo"'.length);
    молчит('<YouTube\n  title="Розетки" />', '<YouTube\n  title="Розетки"'.length);
  });

  it('строка import не разрывается', () => {
    молчит("import X from './x';", "import X from './x';".length);
  });

  it('строка, где нет ничего кроме картинки, не разрывается', () => {
    молчит('![подпись](./img-01.png)', '![подпись](./img-01.png)'.length);
  });

  it('на пустой строке между абзацами правило молчит', () => {
    молчит('один\n\nдва', 'один\n'.length);
  });

  it('с непустым выделением правило молчит: выделение — не курсор', () => {
    expect(точкаВОбычномАбзаце(состояние('Один два', 0, 4))).toBeNull();
  });

  it('при запрете правки клавиши молчат и правки не делают', () => {
    const текст = 'Первый абзац.';
    const {сработала, правка} = нажать('Enter', состояние(текст, текст.length, undefined, true));

    expect(сработала).toBe(false);
    expect(правка).toBeNull();
  });
});
