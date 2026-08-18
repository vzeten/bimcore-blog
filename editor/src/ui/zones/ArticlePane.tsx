import {useEffect, useRef, useState} from 'react';
import {Transaction} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import type {Deletion} from '../../core/colorize';
import {ImagePanel} from '../editor/ImagePanel';
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
  onPaste: (file: File, view: EditorView) => void;
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
    onPaste: props.onPaste,
    onImage: setКартинка,
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
          /* Ключ перемонтирует панель при нажатии другой картинки: без него поле alt-текста
             и итог остались бы от прежней, и «Готово» записало бы чужой alt. */
          key={`${картинка.from}:${картинка.src}`}
          settings={props.settings}
          картинка={картинка}
          view={view.current}
          articlePath={props.article.path}
          сохранено={props.сохранено}
          отпечаток={props.article.отпечаток}
          ссылкаОбновлена={props.ссылкаОбновлена}
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
