import {useState} from 'react';
import type {EditorView} from '@codemirror/view';
import * as act from '../../core/commands';
import {sectionOf} from '../../core/articles.mjs';
import {оформлениеСовета, советы} from '../../core/tipBlock';
import {внутриОграды} from '../livePreview/softBreak';
import {названиеСоветаСтатьи} from '../livePreview/tip';
import {вставкаБлока, значениеПоРазделу, новыйТег} from '../../core/jsxBlocks';
import type {Button, Settings} from '../types';
import type {Spot} from './useEditor';

/**
 * Панель всплывает над выделением и исчезает без него.
 * Сначала два выбора — форматировать или комментировать, — а набор команд
 * раскрывается вторым шагом: восемь кнопок сразу читать тяжело.
 */
export function SelectionToolbar(props: {
  settings: Settings;
  spot: Spot | null;
  view: EditorView | null;
  articlePath: string;
}) {
  const [open, setOpen] = useState(false);
  const п = props.settings.подписи;

  if (!props.spot || !props.view) return null;

  const buttons = props.settings.вставки.filter((item) => item.группа !== 'Блоки');

  // Панель встаёт над выделением; если сверху мало места — под ним, чтобы не уйти за край окна.
  // Координаты оконные (position: fixed), слева не даём вылезти за правый край.
  const ВЫСОТА = 40;
  const сверхуТесно = props.spot.top < ВЫСОТА + 8;
  const top = сверхуТесно ? props.spot.bottom + 6 : props.spot.top - ВЫСОТА;
  // Раскрытый набор команд широкий: панель переносит кнопки и прижимается к правому краю окна.
  const left = Math.max(8, Math.min(props.spot.left, window.innerWidth - (open ? 720 : 220)));
  const style = {left, top};

  if (!open) {
    return (
      <div className="float" style={style}>
        <button onClick={() => setOpen(true)}>{п.форматировать}</button>
        <button disabled title={п.скороКомментарий}>{п.комментировать}</button>
      </div>
    );
  }

  return (
    <div className="float" style={style}>
      <button className="float-back" onClick={() => setOpen(false)}>←</button>
      {buttons.map((item) => (
        <button key={item.подпись} onClick={() => run(item, props)}>
          {item.подпись}
        </button>
      ))}
    </div>
  );
}

function run(
  button: Button,
  props: {settings: Settings; view: EditorView | null; articlePath: string},
): void {
  const view = props.view;
  if (!view) return;

  const doc = view.state.doc.toString();
  const at = {from: view.state.selection.main.from, to: view.state.selection.main.to};
  const edit = decide(button, doc, at, props);
  if (!edit) return;

  view.dispatch({
    changes: {from: edit.from, to: edit.to, insert: edit.insert},
    selection: edit.select
      ? {anchor: edit.from + edit.select.from, head: edit.from + edit.select.to}
      : {anchor: edit.from + (edit.caret ?? edit.insert.length)},
  });
  view.focus();
}

function decide(
  button: Button,
  doc: string,
  at: act.Selection,
  props: {settings: Settings; articlePath: string; шапка?: Record<string, string>},
): act.Edit | null {
  if (button.команда === 'заголовок') return act.heading(doc, at, button.уровень ?? 2);
  if (button.команда === 'список') return act.list(doc, at, button.вид ?? 'точки');
  if (button.команда === 'обернуть') return act.wrap(doc, at, button.знак ?? '**');
  if (button.команда === 'ссылка') {
    return act.link(doc, at, {адрес: props.settings.подписи.ссылкаЗаглушка, текст: props.settings.подписи.ссылкаТекст});
  }
  if (button.команда === 'таблица') {
    return act.table(doc, at, button.столбцов ?? 3, button.строк ?? 2, props.settings.подписи.столбецШаблон);
  }

  if (button.команда === 'блок' && button.блок !== undefined) {
    const описание = props.settings.блоки[button.блок];
    if (описание === undefined) return null;

    // Поле раздела берёт предложение у дерева разделов, начальное свойство — у шапки статьи:
    // название видео для доступности уже написано в её заголовке, спрашивать его незачем.
    const тег = новыйТег(button.блок, описание, ({изШапки}) => {
      if (изШапки !== undefined) return props.шапка?.[изШапки] ?? null;
      return значениеПоРазделу(props.settings.призывПоРазделу, sectionOf(props.articlePath, props.settings));
    });
    return вставкаБлока(doc, at, тег);
  }

  // Примечание — оформление выделенного текста, а не вставка: повторный выбор снимает его.
  // Заголовок берётся по языку статьи, чтобы на сайте блок не назвался чужим словом.
  if (button.команда === 'совет' && button.блок !== undefined) {
    const строки = doc.split('\n');
    const названия = названиеСоветаСтатьи(props.settings, props.articlePath);
    return оформлениеСовета(doc, at, button.блок, названия, советы(строки, внутриОграды(строки)));
  }

  if (button.команда === 'вставить' && button.текст) {
    const caret = button.текст.indexOf('|');
    const insert = button.текст.replace('|', '');
    return {from: at.from, to: at.to, insert, caret: caret === -1 ? insert.length : caret};
  }

  return null;
}

export {decide as decideEdit};
