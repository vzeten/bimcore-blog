import {useEffect, useRef, useState} from 'react';
import {Transaction} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {типыТелаСтатьи} from '../../core/imageType.mjs';
import {выбратьФайл, type ВставленнаяКартинка} from '../editor/images';
import type {Deletion} from '../../core/colorize';
import {ImagePanel} from '../editor/ImagePanel';
import {перенестиВыбор} from '../editor/imagePanelPlace';
import {SelectionToolbar, decideEdit} from '../editor/SelectionToolbar';
import {useEditor, type Spot} from '../editor/useEditor';
import type {КартинкаВОкне} from '../livePreview/inline';
import {Properties} from './Properties';
import type {Field} from '../headFields';
import type {Article, Settings} from '../types';

export function ArticlePane(props: {
  settings: Settings;
  article: Article;
  fields: Field[];
  onFields: (fields: Field[]) => void;
  onText: (text: string) => void;
  onDeletions: (deletions: Deletion[]) => void;
  /**
   * Вставка новой картинки: файл едет на сервер, ссылка дописывается в текст. `null` в ответе —
   * вставки не было (окно сменилось или запрос не прошёл), и панель свойств не открывается.
   */
  вставитьКартинку: (file: File, view: EditorView) => Promise<ВставленнаяКартинка | null>;
  /** Загрузка файла для поля-картинки в свойствах. `null` в ответе — не вышло, причина показана. */
  загрузить: (file: File) => Promise<string | null>;
  /** Текст окна совпадает с файлом — условие входа в смену формата картинки. */
  сохранено: boolean;
  /** Файл статьи изменён сервером при смене формата: наверх уходят новые тело и отпечаток. */
  ссылкаОбновлена: (данные: {текст: string; отпечаток: string}) => void;
  /**
   * Идёт просмотр старой версии: рабочий редактор прячется, но остаётся живым.
   * Снять его с экрана насовсем нельзя — вместе с ним пропадут несохранённые правки
   * и вся история отмены: редактор пересоздался бы из текста, каким статья открывалась.
   */
  скрыт?: boolean;
  /**
   * Текст, который надо положить в редактор целиком: возврат к версии или откат возврата.
   * Номер отличает два возврата к одной и той же версии подряд — по тексту это неразличимо.
   */
  подстановка?: {текст: string; номер: number} | null;
}) {
  const [spot, setSpot] = useState<Spot | null>(null);
  const [menu, setMenu] = useState(false);
  const [картинка, setКартинка] = useState<КартинкаВОкне | null>(null);
  // Номер выбора картинки. Он и есть ключ панели: нажали другую картинку — панель создаётся
  // заново и поля в ней чистые; сменился адрес той же выбранной — панель остаётся, иначе
  // с ней пропали бы и набранный alt, и показанный итог операции.
  const [выбор, setВыбор] = useState(0);
  // Тот же номер живым значением: поздний ответ прежней панели приходит с её собственным
  // номером, и сверять его надо с тем выбором, который на экране СЕЙЧАС, а не с тем, что был
  // виден при её отрисовке. Иначе весть о старой картинке досталась бы новой.
  const выборРеф = useRef(0);
  // Пока панель меняет файл, правка текста её не закрывает: человек обязан получить итог
  // операции, которая уже меняет диск. Ref, а не состояние: признак читает обработчик редактора.
  const файловаяОперация = useRef(false);

  // Пока человек не выбрал, с чего продолжать, документ показывается, но не правится:
  // любой из двух выборов подставляет свой вариант целиком, и набранное пропало бы.
  const выборНеСделан = props.article.черновикРешение === 'конфликт' && props.article.черновик !== null;

  const {host, view} = useEditor({
    article: props.article,
    onText: props.onText,
    onDeletions: props.onDeletions,
    onSelection: setSpot,
    onPaste: (file, editor) => void вставить(file, editor),
    onImage: (картинка) => {
      выборРеф.current += 1;
      setВыбор(выборРеф.current);
      setКартинка(картинка);
    },
    // Панель свойств картинки держит позицию узла на момент открытия: любая правка текста
    // (своя, чужая, подстановка версии) сдвигает позиции, и панель закрывается, а не правит
    // наугад. Кроме времени файловой операции: диск уже меняется, и итог обязан дойти
    // до человека (находка ворот 2026-08-17); применять устаревшую позицию панель не станет —
    // она сверяет текст сама.
    onDocChanged: () => {
      if (!файловаяОперация.current) setКартинка(null);
    },
    толькоЧтение: выборНеСделан,
  });

  // Просмотр старой версии прячет рабочий редактор — панель картинки уходит вместе с ним:
  // её правки относятся к рабочему тексту, а на экране в это время другой.
  useEffect(() => {
    if (props.скрыт === true) setКартинка(null);
  }, [props.скрыт]);

  // Возврат кладёт текст ТРАНЗАКЦИЕЙ в живой редактор, а не пересозданием зоны: пересоздание
  // стёрло бы историю отмены, а вместе с ней и обещание обратимости.
  const номерПодстановки = props.подстановка?.номер ?? 0;
  useEffect(() => {
    const editor = view.current;
    const текст = props.подстановка?.текст;
    if (!editor || номерПодстановки === 0 || текст === undefined) return;
    if (editor.state.doc.toString() === текст) return;

    // Пометка «правка не от человека»: пара уже записана в черновик до подстановки, и слушатель
    // не должен отправить её второй раз — иначе таймер очереди вернул бы надпись «Автосохранено»
    // поверх честного «Сохранено».
    editor.dispatch({
      changes: {from: 0, to: editor.state.doc.length, insert: текст},
      annotations: Transaction.remote.of(true),
    });
  }, [номерПодстановки]);

  // После сохранения меняется состояние, от которого считается цвет: правка, перекрывшая текст ИИ,
  // становится «моей прошлой». Плагин цвета просыпается только на транзакциях, поэтому окно шлёт
  // пустую — она ничего не меняет в тексте, но даёт цвету повод пересчитаться.
  useEffect(() => {
    view.current?.dispatch({});
  }, [props.article.телоФайла, props.article.слои]);

  const blocks = props.settings.вставки.filter((item) => item.группа === 'Блоки');

  return (
    <div className={props.скрыт ? 'pane pane-away' : 'pane'}>
      <div className="pane-head">
        <Properties
          settings={props.settings}
          fields={props.fields}
          onChange={props.onFields}
          path={props.article.path}
          загрузить={props.загрузить}
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

      {картинка !== null && !выборНеСделан && view.current !== null && (
        <ImagePanel
          /* Ключ перемонтирует панель при выборе другой картинки: без него поле alt-текста
             и итог остались бы от прежней, и «Готово» записало бы чужой alt. Адрес в ключ
             не входит: он меняется у той же выбранной картинки при смене формата. */
          key={`выбор-${выбор}`}
          settings={props.settings}
          картинка={картинка}
          view={view.current}
          articlePath={props.article.path}
          сохранено={props.сохранено}
          отпечаток={props.article.отпечаток}
          ссылкаОбновлена={props.ссылкаОбновлена}
          /* Адрес, границы узла и место на экране у выбранной картинки стали другими:
             без этого следующее действие из панели адресовало бы уже несуществующий файл. */
          выбор={выбор}
          onПеремена={(данные) => setКартинка((было) => перенестиВыбор(было, выборРеф.current, данные))}
          onЗанято={(идёт) => {
            файловаяОперация.current = идёт;
          }}
          onClose={() => setКартинка(null)}
        />
      )}
    </div>
  );

  function insert(подпись: string): void {
    const editor = view.current;
    const button = blocks.find((item) => item.подпись === подпись);
    if (!editor || !button) return;

    // Картинка — не текстовая вставка: сначала человек выбирает файл, потом сервер кладёт его
    // рядом со статьёй, и только затем в текст дописывается ссылка.
    if (button.команда === 'картинка') {
      выбратьКартинку(editor);
      return;
    }

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

  /** Выбор файла картинки. Предлагается ровно то, что примет сервер: PNG, JPG и GIF. */
  function выбратьКартинку(editor: EditorView): void {
    выбратьФайл(типыТелаСтатьи(), (file) => void вставить(file, editor));
  }

  /**
   * Вставка картинки и сразу за ней — панель её свойств: человек видит поле «Alt-текст» и может
   * заполнить его, не разыскивая картинку нажатием.
   */
  async function вставить(file: File, editor: EditorView): Promise<void> {
    const готово = await props.вставитьКартинку(file, editor);
    if (готово === null || !editor.dom.isConnected) return;

    // Координаты берутся сразу: редактор строит виджет картинки в той же правке, что и текст,
    // поэтому ждать отрисовки нечего. Ожидание кадра здесь было бы хуже — в неактивной вкладке
    // браузер такие кадры не выдаёт вовсе, и панель не появилась бы никогда.
    const место = уКартинки(editor, готово.узелОт);
    if (место === null) return;

    выборРеф.current += 1;
    setВыбор(выборРеф.current);
    setКартинка({src: готово.src, alt: '', from: готово.узелОт, to: готово.узелДо, ...место});
  }
}

/**
 * Где на экране картинка в этой позиции. Сначала спрашивается сам её виджет — он знает свои
 * настоящие края; если виджет ещё не построен, берётся место позиции в тексте.
 * `null` — показать панель не у чего: строка вне видимой части.
 */
function уКартинки(editor: EditorView, позиция: number): {left: number; top: number} | null {
  const узел = editor.domAtPos(позиция).node;
  const элемент = узел instanceof HTMLElement ? узел : узел.parentElement;
  const картинка = элемент?.closest('.md-image') ?? элемент?.querySelector('.md-image');
  if (картинка instanceof HTMLElement) {
    const место = картинка.getBoundingClientRect();
    return {left: место.left, top: место.top};
  }

  const место = editor.coordsAtPos(позиция);
  return место === null ? null : {left: место.left, top: место.top};
}
