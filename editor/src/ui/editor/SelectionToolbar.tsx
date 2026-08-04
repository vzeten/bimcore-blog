import {useState} from 'react';
import type {EditorView} from '@codemirror/view';
import * as act from '../../core/commands';
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
  const left = Math.max(8, Math.min(props.spot.left, window.innerWidth - 220));
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
  props: {settings: Settings; articlePath: string},
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

  if (button.команда === 'призыв') {
    // Тип призыва — по разделу статьи. Запасное значение берётся из настроек («умолчание»),
    // своего в коде нет: второй источник правды тихо перебивал бы настройку.
    const карта = props.settings.призывПоРазделу;
    const section = Object.keys(карта).find((key) => props.articlePath.includes(`/${key}/`));
    const type = карта[section ?? 'умолчание'] ?? карта['умолчание'];
    return {from: at.from, to: at.to, insert: `<CTA type="${type}" />`};
  }

  if (button.команда === 'вставить' && button.текст) {
    const caret = button.текст.indexOf('|');
    const insert = button.текст.replace('|', '');
    return {from: at.from, to: at.to, insert, caret: caret === -1 ? insert.length : caret};
  }

  return null;
}

export {decide as decideEdit};
