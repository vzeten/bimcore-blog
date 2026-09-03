import {useEffect, useRef} from 'react';
import {EditorSelection, EditorState, Transaction} from '@codemirror/state';
import {EditorView, keymap, drawSelection, highlightActiveLine} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
import {запретПравки, чтениеСтатьи} from './reading';
import {клавишиСписка} from './listKeys';
import {клавишиПоверхности} from './surfaceKeys';
import {блокВ, контейнерКурсора, обычныйТекст} from './structureGuard';
import {layerColors, слоиОкна} from '../layerColors';
import type {Deletion} from '../../core/colorize';
import {правкаПанелиКартинки, type КартинкаВОкне} from '../livePreview/inline';
import type {БлокВОкне} from '../livePreview/blocks';
import type {Article, ОписаниеБлока} from '../types';

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
  /** Нажатие по картинке в тексте: открыть панель её свойств. */
  onImage?: (картинка: КартинкаВОкне) => void;
  блоки: Record<string, ОписаниеБлока>;
  названиеСовета: Record<string, string>;
  onБлок?: (блок: БлокВОкне) => void;
  /**
   * Любое изменение документа, включая подстановку версии: панель свойств картинки держит
   * позицию узла и после чужой правки обязана закрыться, а не править сдвинувшийся текст.
   */
  onDocChanged?: () => void;
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

  const сВыбором = <Т extends {from: number}>(далее: (что: Т) => void) => (что: Т): void => {
    const блок = view.current === null ? null : блокВ(view.current.state, что.from);
    if (блок !== null) {
      // Виджет гасит нажатие, и без явного фокуса `Delete` не дошёл бы до редактора.
      view.current?.dispatch({selection: EditorSelection.range(блок.from, блок.to)});
      view.current?.focus();
    }
    далее(что);
  };

  useEffect(() => {
    if (!host.current) return;

    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: options.article.body,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          // Уровень пункта списка стоит выше общей раскладки: в ней `Tab` не занят вовсе и
          // уводил фокус из текста, а продолжение и конец списка по `Enter` уже даёт markdown.
          клавишиСписка(),
          keymap.of(клавишиПоверхности),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          ...чтениеСтатьи(
            () => свежие.current.article.path,
            options.блоки,
            options.названиеСовета,
            сВыбором((картинка) => свежие.current.onImage?.(картинка)),
            сВыбором((блок) => свежие.current.onБлок?.(блок)),
          ),
          ...(options.толькоЧтение === true ? запретПравки() : []),
          // Цепочка слоёв читается свежей на каждый пересчёт, а не запоминается при создании
          // редактора: иначе после сохранения цвет остался бы прежним до повторного открытия
          // статьи, и правка, которой человек перекрыл текст ИИ, не сменила бы цвет.
          // На диск за ней при этом никто не ходит — она приходит с открытием статьи.
          layerColors(
            () => слоиОкна(свежие.current.article),
            (deletions) => свежие.current.onDeletions(deletions),
          ),
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
            // Правка самой панели картинки закрытия не требует: панель обязана успеть
            // показать итог и закрывает себя сама.
            const отПанели = update.transactions.some((tr) => tr.annotation(правкаПанелиКартинки) === true);
            if (update.docChanged && !отПанели) свежие.current.onDocChanged?.();
            if (!update.selectionSet && !update.docChanged) return;
            свежие.current.onSelection(spotOf(update.view));
          }),
        ],
      }),
    });

    view.current.dispatch({selection: {anchor: 0}}); // начальный курсор — через карту: первая строка бывает скрытой
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
  // Команды — выделению обычного текста либо курсору внутри примечания: снять или сменить его тип
  // можно без повторного выделения. Блок и служебные строки команд не получают.
  const годится = range.empty ? контейнерКурсора(view.state, range.head) !== null : обычныйТекст(view.state, range.from, range.to);
  if (!годится) return null;

  const start = view.coordsAtPos(range.from);
  if (!start) return null;

  return {left: start.left, top: start.top, bottom: start.bottom};
}
