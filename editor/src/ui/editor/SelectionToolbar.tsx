import {useState} from 'react';
import type {EditorView} from '@codemirror/view';
import * as act from '../../core/commands';
import {sectionOf} from '../../core/articles.mjs';
import {оформлениеСовета, советы} from '../../core/tipBlock';
import {видСписка, преобразованиеСписка} from '../../core/listConvert';
import {внутриОграды, строкаАбзаца} from '../livePreview/softBreak';
import {названиеСоветаСтатьи} from '../livePreview/tip';
import {вставкаБлока, значениеПоРазделу, новыйТег} from '../../core/jsxBlocks';
import type {Button, Settings} from '../types';
import type {Spot} from './useEditor';

/**
 * Панель всплывает над выделением и исчезает без него. Сначала два выбора — форматировать или
 * комментировать, — а набор команд раскрывается вторым шагом одной панелью: группы отделены
 * визуально, короткие кнопки объясняют себя подсказкой и доступным названием.
 */

type Пиктограммы = 'ссылка' | 'точки' | 'числа';

/** Чем кнопка показана: короткий знак с пиктограммой либо слово из настроек. */
export function видКнопки(button: Button): {знак: string; пиктограмма?: Пиктограммы} {
  if (button.команда === 'заголовок') return {знак: `H${button.уровень ?? 2}`};
  if (button.команда === 'обернуть') return {знак: button.знак === '*' ? 'I' : button.знак === '**' ? 'B' : button.подпись};
  if (button.команда === 'ссылка') return {знак: button.подпись, пиктограмма: 'ссылка'};
  if (button.команда === 'список') return {знак: button.подпись, пиктограмма: button.вид === 'числа' ? 'числа' : 'точки'};
  return {знак: button.подпись};
}

/** Кнопки по группам настроек в их порядке: группа переносится целиком, кнопки не перемешиваются. */
function поГруппам(buttons: Button[]): [string, Button[]][] {
  const группы = new Map<string, Button[]>();
  for (const item of buttons) группы.set(item.группа, [...(группы.get(item.группа) ?? []), item]);
  return [...группы.entries()];
}

/** Пиктограммы панели: цепочка ссылки и два знакомых знака списка. */
function Пиктограмма(props: {вид: Пиктограммы}) {
  const общее = {width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true};
  if (props.вид === 'ссылка') {
    return <svg {...общее}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>;
  }
  if (props.вид === 'точки') {
    return <svg {...общее}><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" /></svg>;
  }
  return (
    <svg {...общее}>
      <path d="M10 6h11M10 12h11M10 18h11" />
      <text x="1" y="8.5" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>
      <text x="1" y="14.5" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>
      <text x="1" y="20.5" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
    </svg>
  );
}
export function SelectionToolbar(props: {
  settings: Settings;
  spot: Spot | null;
  view: EditorView | null;
  articlePath: string;
  /** Отказ команды: причина уходит в общую строку сообщений окна, текст не меняется. */
  onСообщить?: (текст: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const п = props.settings.подписи;

  if (!props.spot || !props.view) return null;

  const buttons = props.settings.вставки.filter((item) => item.группа !== 'Блоки');
  // Действующий вид списка у выделения подсвечивает свою кнопку: повторное нажатие снимает список.
  const {from, to} = props.view.state.selection.main;
  const активныйСписок = open ? видСписка(props.view.state.doc.toString(), {from, to}, строкаАбзаца) : null;

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
    <div className="float" style={style} role="toolbar" aria-label={п.форматировать}>
      <button className="float-back" onClick={() => setOpen(false)} title={п.форматировать} aria-label={п.форматировать}>←</button>
      {поГруппам(buttons).map(([группа, кнопки]) => (
        <span className="float-group" key={группа} role="group" aria-label={группа}>
          {кнопки.map((item) => {
            const вид = видКнопки(item);
            return (
              <button key={item.подпись} onClick={() => run(item, props)} title={item.подпись} aria-label={item.подпись}
                aria-pressed={item.команда === 'список' ? активныйСписок === (item.вид ?? 'точки') : undefined}
                className={вид.пиктограмма === undefined && вид.знак !== item.подпись ? 'float-key' : undefined}>
                {вид.пиктограмма !== undefined ? <Пиктограмма вид={вид.пиктограмма} /> : вид.знак}
              </button>
            );
          })}
        </span>
      ))}
    </div>
  );
}

function run(
  button: Button,
  props: {settings: Settings; view: EditorView | null; articlePath: string; onСообщить?: (текст: string) => void},
): void {
  const view = props.view;
  if (!view) return;

  const doc = view.state.doc.toString();
  const at = {from: view.state.selection.main.from, to: view.state.selection.main.to};
  const edit = decide(button, doc, at, props);
  if (!edit) {
    // Список отказал целиком — человек обязан узнать причину, а не гадать, почему ничего не произошло.
    if (button.команда === 'список') props.onСообщить?.(props.settings.подписи.списокНельзя);
    return;
  }

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
  if (button.команда === 'список') return преобразованиеСписка(doc, at, button.вид ?? 'точки', строкаАбзаца);
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
