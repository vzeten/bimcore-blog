import {useEffect, useRef} from 'react';
import {EditorSelection, EditorState, Transaction} from '@codemirror/state';
import {EditorView, keymap} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
import {запретПравки, чтениеСтатьи} from './reading';
import {клавишиСписка} from './listKeys';
import {клавишиПоверхности} from './surfaceKeys';
import {блокВ, обычныйТекст} from './structureGuard';
import {layerColors, слоиОкна} from '../layerColors';
import {правкаПанелиКартинки, type КартинкаВОкне} from '../livePreview/inline';
import {взятьПереход, слушатьПереход} from './jumpTo';
import type {БлокВОкне} from '../livePreview/blocks';
import type {Article, ОписаниеБлока} from '../types';

/** Рамка выделения в координатах окна и видимая часть области редактора: панель встаёт мимо обеих. */
export interface Spot {
  left: number;
  right: number;
  /** Верх выделения в координатах окна. */
  top: number;
  /** Низ выделения в координатах окна: сюда падает панель, если сверху места нет. */
  bottom: number;
  /** Видимая часть прокручиваемой области редактора: за неё панель не выходит, пока есть куда встать. */
  область: {top: number; bottom: number};
}

export function useEditor(options: {
  article: Article;
  onText: (text: string) => void;
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
          // Выделение рисует сам браузер: оно идёт по знакам, а не полосой на всю строку.
          // Подсветка строки курсора — своя, из поверхности: строку блока она не трогает.
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
          layerColors(() => слоиОкна(свежие.current.article)),
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

    // Панель стоит в координатах окна: прокрутка и смена размера окна двигают выделение, а не
    // документ, и без пересчёта панель осталась бы висеть над чужим текстом.
    const пересчёт = () => {
      if (view.current) свежие.current.onSelection(spotOf(view.current));
    };
    window.addEventListener('scroll', пересчёт, true);
    window.addEventListener('resize', пересчёт);

    // «Перейти к месту» из причины отказа публикации: строка тела с единицы, край документа — предел.
    const перейти = () => {
      const строка = view.current === null ? null : взятьПереход(свежие.current.article.path);
      if (строка === null || view.current === null) return;
      const doc = view.current.state.doc;
      const где = doc.line(Math.min(Math.max(1, строка), doc.lines)).from;
      view.current.dispatch({selection: {anchor: где}, scrollIntoView: true});
      view.current.focus();
    };
    перейти();
    const отписка = слушатьПереход(перейти);

    return () => {
      отписка();
      window.removeEventListener('scroll', пересчёт, true);
      window.removeEventListener('resize', пересчёт);
      view.current?.destroy();
      view.current = null;
    };
  }, [options.article.path]);

  return {host, view};
}

/**
 * Где показать всплывающую панель команд: рамка выделения в координатах окна.
 * Панель позиционируется fixed, поэтому вычитать контейнер не нужно — раньше из-за этого
 * панель улетала вверх, ведь редактор начинается ниже своего родителя.
 * Выделение в несколько строк занимает строки целиком, и его рамка — вся ширина текста.
 */
export function spotOf(view: EditorView): Spot | null {
  const range = view.state.selection.main;
  // Команды показываются только непустому выделению обычного текста: блок и служебные строки их не получают.
  if (range.empty || !обычныйТекст(view.state, range.from, range.to)) return null;

  const start = view.coordsAtPos(range.from);
  const end = view.coordsAtPos(range.to, -1);
  if (!start || !end) return null;

  const прокрутка = view.scrollDOM.getBoundingClientRect();
  const область = {top: Math.max(прокрутка.top, 0), bottom: Math.min(прокрутка.bottom, window.innerHeight)};
  // Выделение целиком ушло за видимую область — панели не к чему стоять, она уходит с ним.
  if (end.bottom <= область.top || start.top >= область.bottom) return null;

  const текст = view.contentDOM.getBoundingClientRect();
  const наОднойСтроке = end.top < start.bottom;
  return {
    left: наОднойСтроке ? start.left : текст.left,
    right: наОднойСтроке ? end.right : текст.right,
    top: start.top,
    bottom: end.bottom,
    область,
  };
}
