import {useEffect, useRef} from 'react';
import {EditorState, Transaction} from '@codemirror/state';
import {EditorView, keymap, drawSelection, highlightActiveLine} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
import {запретПравки, чтениеСтатьи} from './reading';
import {layerColors} from '../layerColors';
import type {Deletion, Layer} from '../../core/colorize';
import type {Article} from '../types';

export interface Spot {
  left: number;
  /** Верх выделения в координатах окна. */
  top: number;
  /** Низ выделения в координатах окна: сюда падает панель, если сверху места нет. */
  bottom: number;
}

export function useEditor(options: {
  article: Article;
  onText: (text: string) => void;
  onDeletions: (deletions: Deletion[]) => void;
  onSelection: (spot: Spot | null) => void;
  onPaste: (file: File, view: EditorView) => void;
  /**
   * Правка запрещена, пока человек не выбрал, с чего продолжать (файл или автосохранение).
   * Иначе набранное в этот момент пропадает при любом из двух выборов: оба подставляют
   * в окно свой вариант целиком.
   */
  толькоЧтение?: boolean;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  // Свежие обработчики и статья в ref. Редактор создаётся один раз на статью и держит замыкание
  // того мгновения: без ref он до самого закрытия статьи звал бы обработчики, знающие отпечаток
  // и текст файла на момент открытия. После сохранения отпечаток меняется, и набранное уходило
  // бы в черновик со старым — при следующем открытии человек получал бы ложный выбор
  // «черновик или файл», а выбор «взять файл» отбрасывал бы его работу.
  const свежие = useRef(options);
  свежие.current = options;

  useEffect(() => {
    if (!host.current) return;

    const before: Layer[] = options.article.published === null
      ? [{text: options.article.body, kind: 'prevHuman'}]
      : [
          {text: options.article.published, kind: 'site'},
          {text: options.article.body, kind: 'prevHuman'},
        ];

    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: options.article.body,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          ...чтениеСтатьи(() => свежие.current.article.path),
          ...(options.толькоЧтение === true ? запретПравки() : []),
          layerColors(() => before, (deletions) => свежие.current.onDeletions(deletions)),
          EditorView.domEventHandlers({
            paste: (event, editor) => {
              const file = [...(event.clipboardData?.items ?? [])]
                .find((item) => item.type.startsWith('image/'))
                ?.getAsFile();
              if (!file) return false;
              event.preventDefault();
              свежие.current.onPaste(file, editor);
              return true;
            },
          }),
          EditorView.updateListener.of((update) => {
            // Подстановка целой пары (возврат к версии) помечена как правка не от человека:
            // она уже записана в черновик, и повторная отправка завела бы вторую запись той же
            // пары. Курсор и выделение при этом пересчитываются как обычно.
            const своя = update.transactions.every((tr) => tr.annotation(Transaction.remote) !== true);
            if (update.docChanged && своя) свежие.current.onText(update.state.doc.toString());
            if (!update.selectionSet && !update.docChanged) return;
            свежие.current.onSelection(spotOf(update.view));
          }),
        ],
      }),
    });

    (window as unknown as {__editor?: EditorView}).__editor = view.current;

    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, [options.article.path]);

  return {host, view};
}

/**
 * Где показать всплывающую панель команд: у начала выделения, в координатах окна.
 * Панель позиционируется fixed, поэтому вычитать контейнер не нужно — раньше из-за этого
 * панель улетала вверх, ведь редактор начинается ниже своего родителя.
 */
function spotOf(view: EditorView): Spot | null {
  const range = view.state.selection.main;
  if (range.empty) return null;

  const start = view.coordsAtPos(range.from);
  if (!start) return null;

  return {left: start.left, top: start.top, bottom: start.bottom};
}
