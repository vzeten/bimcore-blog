import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {EditorView} from '@codemirror/view';
import {ChangeSet} from '@codemirror/state';
import {isolateHistory} from '@codemirror/commands';
import {ensureSyntaxTree, language} from '@codemirror/language';
import * as act from '../../core/commands';
import {sectionOf} from '../../core/articles.mjs';
import {границыСоветов, оформлениеСовета, советы} from '../../core/tipBlock';
import {видСписка, преобразованиеСписка, type Окружение, type ПравкаСписка} from '../../core/listConvert';
import {КОСАЯ_ПЕРЕНОСА, блокВнеРазбора, внутриОграды, переносыАбзацев} from '../livePreview/softBreak';
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

/**
 * Что о тексте знает правило списка: настоящее дерево разбора окна (целиком, не только видимая
 * часть), границы примечаний и какие строки абзаца сайт всё же покажет блоком. Дерево не успело —
 * правило откажет.
 */
function окружениеСписка(view: EditorView): Окружение | null {
  const дерево = ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  const язык = view.state.facet(language);
  if (дерево === null || язык === null) return null;
  const строки = view.state.doc.toString().split('\n');
  return {
    дерево,
    границы: границыСоветов(строки, внутриОграды(строки)),
    обычная: (строка) => !блокВнеРазбора(строка),
    косая: (строка) => КОСАЯ_ПЕРЕНОСА.test(строка),
    // Вторая ступень правки смотрит на результат тем же разбором, что и окно.
    разбор: (text) => язык.parser.parse(text),
  };
}

/** Правка списка одной транзакцией: две ступени замен, выделение — задетые единицы целиком. */
export function правкаСписка(view: EditorView, правка: ПравкаСписка): void {
  const первая = view.state.changes(правка.changes);
  const изменения = первая.compose(ChangeSet.of(правка.затем, первая.newLength));
  view.dispatch({
    changes: изменения,
    selection: {anchor: изменения.mapPos(правка.выделение.from, 1), head: изменения.mapPos(правка.выделение.to, -1)},
    scrollIntoView: true,
    userEvent: 'input',
    // Одна запись истории на действие: набор до и после него в неё не склеивается.
    annotations: isolateHistory.of('full'),
  });
}

/** Размер панели, измеренный у настоящего DOM: для какой ступени (раскрытой или нет) он снят. */
interface Размер {
  раскрытая: boolean;
  ширина: number;
  высота: number;
}

/**
 * Куда встать панели, чтобы не закрыть выделение: над ним, а если сверху видимой области мало
 * места — под ним. Не помещается ни там, ни там (выделение выше видимой области) — панель у верха
 * окна. Слева она идёт от начала выделения, но не выходит за края окна. Все размеры настоящие:
 * измеренная панель, рамка выделения и видимая область, никаких запасов «на глаз».
 */
export function положениеПанели(
  spot: Pick<Spot, 'left' | 'top' | 'bottom' | 'область'>,
  размер: {ширина: number; высота: number},
  окно: {ширина: number; высота: number},
): {left: number; top: number} {
  const ЗАЗОР = 6;
  const КРАЙ = 8;
  const над = spot.top - ЗАЗОР - размер.высота;
  const под = spot.bottom + ЗАЗОР;
  let top: number;
  if (над >= spot.область.top) top = над;
  else if (под + размер.высота <= spot.область.bottom) top = под;
  else top = Math.max(КРАЙ, Math.min(над, окно.высота - размер.высота - КРАЙ));
  const left = Math.max(КРАЙ, Math.min(spot.left, окно.ширина - размер.ширина - КРАЙ));
  return {left, top};
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
  const view = props.view;
  const state = view?.state ?? null;

  // Настоящий размер панели снимается с её DOM после каждой отрисовки; пока размер не снят или снят
  // с другой ступени, панель невидима — иначе на один кадр она встала бы по чужому размеру.
  const корень = useRef<HTMLDivElement>(null);
  const [размер, setРазмер] = useState<Размер | null>(null);
  useLayoutEffect(() => {
    const el = корень.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setРазмер((прежний) =>
      прежний !== null && прежний.раскрытая === open && прежний.ширина === r.width && прежний.высота === r.height
        ? прежний
        : {раскрытая: open, ширина: r.width, высота: r.height},
    );
  });

  // Действующий вид списка у выделения подсвечивает свою кнопку: повторное нажатие снимает список.
  // Разбор всего документа привязан к его состоянию: прокрутка и смена размера окна его не повторяют.
  const окружение = useMemo(() => (open && view !== null ? окружениеСписка(view) : null), [open, view, state]);

  if (!props.spot || view === null || state === null) return null;

  const buttons = props.settings.вставки.filter((item) => item.группа !== 'Блоки');
  const {from, to} = state.selection.main;
  const активныйСписок = окружение === null ? null : видСписка(state.doc.toString(), {from, to}, окружение);

  // Координаты оконные (position: fixed). Панель не закрывает выделение и не выходит за края окна.
  const измерена = размер !== null && размер.раскрытая === open;
  const место = измерена ? положениеПанели(props.spot, размер, {ширина: window.innerWidth, высота: window.innerHeight}) : {left: 8, top: 0};
  const style = {...место, visibility: измерена ? undefined : ('hidden' as const)};
  // Нажатие по панели не забирает фокус у текста: выделение остаётся живым до самой команды.
  const держатьФокус = (event: {preventDefault(): void}) => event.preventDefault();

  if (!open) {
    return (
      <div className="float" style={style} ref={корень} onMouseDown={держатьФокус}>
        <button onClick={() => setOpen(true)}>{п.форматировать}</button>
        <button disabled title={п.скороКомментарий}>{п.комментировать}</button>
      </div>
    );
  }

  return (
    <div className="float" style={style} ref={корень} onMouseDown={держатьФокус} role="toolbar" aria-label={п.форматировать}>
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
  if (button.команда === 'список') {
    const окружение = окружениеСписка(view);
    const правка = окружение === null ? null : преобразованиеСписка(doc, at, button.вид ?? 'точки', окружение);
    if (правка !== null) правкаСписка(view, правка);
    // Список отказал целиком либо правку не пропустил фильтр разметки — человек обязан узнать об
    // этом, а не гадать, почему ничего не произошло.
    if (правка === null || view.state.doc.toString() === doc) props.onСообщить?.(props.settings.подписи.списокНельзя);
    view.focus();
    return;
  }
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
  // Знаки разметки ищутся по всему абзацу, а не по строкам выделения: мягкий перенос пару не рвёт.
  // Что продолжает абзац, знает одно правило программы — здесь оно только спрашивается.
  if (button.команда === 'обернуть') {
    const {мягкие, жёсткие} = переносыАбзацев(doc.split('\n'));
    return act.wrap(doc, at, button.знак ?? '**', new Set([...мягкие, ...жёсткие]));
  }
  if (button.команда === 'ссылка') {
    return act.link(doc, at, {текст: props.settings.подписи.ссылкаТекст});
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
