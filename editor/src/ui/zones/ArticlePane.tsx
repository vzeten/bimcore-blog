import {useState} from 'react';
import type {EditorView} from '@codemirror/view';
import type {Deletion} from '../../core/colorize';
import {SelectionToolbar, decideEdit} from '../editor/SelectionToolbar';
import {useEditor, type Spot} from '../editor/useEditor';
import {Properties, type Field} from './Properties';
import type {Article, Settings} from '../types';

export function ArticlePane(props: {
  settings: Settings;
  article: Article;
  fields: Field[];
  onFields: (fields: Field[]) => void;
  onText: (text: string) => void;
  onDeletions: (deletions: Deletion[]) => void;
  onPaste: (file: File, view: EditorView) => void;
  /**
   * Идёт просмотр старой версии: рабочий редактор прячется, но остаётся живым.
   * Снять его с экрана насовсем нельзя — вместе с ним пропадут несохранённые правки
   * и вся история отмены: редактор пересоздался бы из текста, каким статья открывалась.
   */
  скрыт?: boolean;
}) {
  const [spot, setSpot] = useState<Spot | null>(null);
  const [menu, setMenu] = useState(false);

  // Пока человек не выбрал, с чего продолжать, документ показывается, но не правится:
  // любой из двух выборов подставляет свой вариант целиком, и набранное пропало бы.
  const выборНеСделан = props.article.черновикРешение === 'конфликт' && props.article.черновик !== null;

  const {host, view} = useEditor({
    article: props.article,
    onText: props.onText,
    onDeletions: props.onDeletions,
    onSelection: setSpot,
    onPaste: props.onPaste,
    толькоЧтение: выборНеСделан,
  });

  const blocks = props.settings.вставки.filter((item) => item.группа === 'Блоки');

  return (
    <div className={props.скрыт ? 'pane pane-away' : 'pane'}>
      <div className="pane-head">
        <Properties
          settings={props.settings}
          fields={props.fields}
          onChange={props.onFields}
          толькоЧтение={выборНеСделан}
        />

        {/* Кнопки вставки и форматирования меняют текст в обход запрета на набор: они пишут
            в редактор напрямую. Пока выбор не сделан, их на экране нет вовсе. */}
        <div className="insert">
          {!выборНеСделан && (
          <button className="insert-open" onClick={() => setMenu(!menu)}>
            + {props.settings.подписи.вставить}
          </button>
          )}

          {menu && (
            <div className="insert-menu">
              {blocks.map((item) => (
                <button
                  key={item.подпись}
                  onClick={() => {
                    setMenu(false);
                    insert(item.подпись);
                  }}
                >
                  {item.подпись}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="paper" ref={host} />

      <SelectionToolbar
        settings={props.settings}
        spot={выборНеСделан ? null : spot}
        view={view.current}
        articlePath={props.article.path}
      />
    </div>
  );

  function insert(подпись: string): void {
    const editor = view.current;
    const button = blocks.find((item) => item.подпись === подпись);
    if (!editor || !button) return;

    const at = {from: editor.state.selection.main.from, to: editor.state.selection.main.to};
    const edit = decideEdit(button, editor.state.doc.toString(), at, {
      settings: props.settings,
      articlePath: props.article.path,
    });
    if (!edit) return;

    editor.dispatch({
      changes: {from: edit.from, to: edit.to, insert: edit.insert},
      selection: {anchor: edit.from + (edit.caret ?? edit.insert.length)},
    });
    editor.focus();
  }
}
