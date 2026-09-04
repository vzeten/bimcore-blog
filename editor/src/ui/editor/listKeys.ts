// Клавиши списка в окне: `Enter` разбивает пункт на следующий, `Enter` на пустом пункте завершает
// список, `Backspace` снимает маркер, `Tab` вкладывает пункт, `Shift+Tab` возвращает его наружу.
// Продолжение пункта — своя команда, а не штатная: штатная наследует разреженность списка по его
// первым двум пунктам, и в старом списке каждый `Enter` вставлял пустую строку. Здесь новый пункт
// всегда вплотную, а затронутый список одной транзакцией уплотняется вместе с соседями того же вида
// (`core/listStructure.ts`): зазоры уходят, если каждый пункт простой, номера идут подряд.
// Штатная команда остаётся только на пустом пункте (выход из списка или уровень выше) и в цитате.
// Уровень пункта считает `src/core/listIndent.ts`.

import {keymap, type Command, type KeyBinding} from '@codemirror/view';
import type {ChangeSet, EditorState} from '@codemirror/state';
import {isolateHistory} from '@codemirror/commands';
import {deleteMarkupBackward, insertNewlineContinueMarkupCommand} from '@codemirror/lang-markdown';
import {syntaxTree} from '@codemirror/language';
import type {SyntaxNode} from '@lezer/common';
import {вложить, поднять, вСписке} from '../../core/listIndent';
import {
  видУзла, группа, маркерСтроки, номерНового, построчно, простой, список, удалениеЗазора, уплотнение, type Замена,
} from '../../core/listStructure';
import {границыСоветов} from '../../core/tipBlock';
import type {Edit, Selection} from '../../core/commands';
import {КОСАЯ_ПЕРЕНОСА, внутриОграды} from '../livePreview/softBreak';

const косая = (строка: string): boolean => КОСАЯ_ПЕРЕНОСА.test(строка);

/** Блок, внутри которого клавиша списка не действует: там `Enter` — обычный перевод строки. */
const НЕ_ТЕКСТ = /^(FencedCode|CodeBlock|HTMLBlock|ATXHeading[1-6]|SetextHeading[1-6]|Table)$/;

/** Пункт у позиции: ближайший предок ListItem, если до него нет кода или другого блока. */
function пунктУ(state: EditorState, pos: number): {пункт: SyntaxNode; вЦитате: boolean} | null {
  let узел: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  while (узел !== null && узел.name !== 'ListItem') {
    if (НЕ_ТЕКСТ.test(узел.name)) return null;
    узел = узел.parent;
  }
  if (узел === null) return null;
  let вЦитате = false;
  for (let выше = узел.parent; выше !== null; выше = выше.parent) if (выше.name === 'Blockquote') вЦитате = true;
  return {пункт: узел, вЦитате};
}

/** Границы примечаний по строкам: дерево их не знает и продолжает последний пункт закрывающей `:::`. */
function границыСтрок(строки: string[]): Set<number> {
  return границыСоветов(строки, внутриОграды(строки));
}

/** Замены сливаются там, где вставка стоит в начале или внутри удаляемого зазора: одна замена вместо двух в одной точке. */
function слить(changes: Замена[]): Замена[] {
  const по = [...changes].sort((x, y) => x.from - y.from || x.to - y.to);
  const итог: Замена[] = [];
  for (const з of по) {
    const прежняя = итог[итог.length - 1];
    if (прежняя !== undefined && з.from <= прежняя.to && (з.from < прежняя.to || з.from === з.to || прежняя.from === прежняя.to)) {
      прежняя.to = Math.max(прежняя.to, з.to);
      прежняя.insert += з.insert;
    } else {
      итог.push({...з});
    }
  }
  return итог;
}

/**
 * `Enter` в тексте пункта: текст после курсора уходит в следующий пункт с тем же знаком или номером.
 * Перед маркером — пустой пункт выше, курсор остаётся у текста. Выделение внутри одной строки пункта
 * заменяется разбиением. Пустое продолжение (после `Shift+Enter`) уходит вместе со своей косой:
 * перенос перед концом пункта остался бы на сайте буквой.
 */
const следующийПункт: Command = (view) => {
  const state = view.state;
  const главное = state.selection.main;
  if (state.readOnly) return false;
  const строка = state.doc.lineAt(главное.from);
  const пусто = строка.text.trim() === '';
  if (пусто && (строка.number === 1 || !главное.empty)) return false;
  const колонкаКурсора = главное.from - строка.from;
  const маркерСтрокиКурсора = пусто ? null : маркерСтроки(строка.text);
  const передМаркером = маркерСтрокиКурсора !== null && колонкаКурсора <= маркерСтрокиКурсора.отступ + маркерСтрокиКурсора.текст.length;
  // Пустое продолжение в дерево пункта не входит: пункт ищется от конца строки выше; перед маркером — от самого маркера.
  const где = пусто ? строка.from - 1 : передМаркером ? строка.from + маркерСтрокиКурсора!.отступ + маркерСтрокиКурсора!.текст.length : главное.from;
  const найдено = пунктУ(state, где);
  if (найдено === null || найдено.вЦитате || найдено.пункт.parent === null) return false;
  if (!главное.empty) {
    const конец = пунктУ(state, главное.to);
    if (конец === null || конец.пункт.from !== найдено.пункт.from || state.doc.lineAt(главное.to).number !== строка.number) return false;
  }

  const т = построчно(state.doc.toString());
  const границы = границыСтрок(т.строки);
  const с = список(т, найдено.пункт.parent, границы, строка.number - 1);
  const п = с?.пункты.find((x) => x.узел.from === найдено.пункт.from) ?? null;
  if (с === null || п === null) return false;
  const м = п.маркер;
  const индекс = строка.number - 1;
  if (индекс < п.от || индекс > п.до + (пусто ? 1 : 0)) return false;
  // Пустой пункт — штатной команде: выход из списка или уровень выше.
  if (индекс === п.от && строка.text.slice(м.колонка).trim() === '') return false;

  // Разбор ещё не дошёл до конца списка: пункт вставляется, а уплотнять нечего.
  const дерево = syntaxTree(state);
  const уплотнять = дерево.length >= state.doc.length || с.узел.to < дерево.length;
  const гр = уплотнять ? группа(с, т, границы) : [с];
  const всеПросты = гр.every((л) => простой(л, т));
  const k = гр.flatMap((л) => л.пункты).indexOf(п);
  // Знак — свой у списка, где стоит курсор: сосед другого знака входит в группу и получает его.
  const знак = с.пункты[0].маркер.знак;
  const маркер = (номер: number): string => `${' '.repeat(м.отступ)}${с.вид === 'числа' ? `${номер}${знак}` : знак} `;

  const changes: Замена[] = [];
  // Курсор считается от начала своей замены в новом тексте: конец замены слился бы с удалением зазора.
  let курсор: (изменения: ChangeSet) => number;
  let сдвигПосле: number;
  if (индекс === п.от && передМаркером) {
    const вставка = `${маркер(номерНового(гр, k - 1))}\n`;
    changes.push({from: строка.from, to: строка.from, insert: вставка});
    курсор = (изменения) => изменения.mapPos(строка.from, -1) + вставка.length + колонкаКурсора;
    сдвигПосле = k - 1;
  } else {
    let from = главное.from;
    let to = главное.to;
    if (пусто || (индекс > п.от && строка.text.slice(0, колонкаКурсора).trim() === '')) {
      // Перед курсором на строке-продолжении пусто: разбиение идёт от конца строки выше, отступ продолжения уходит.
      const выше = state.doc.line(строка.number - 1);
      from = выше.to - (косая(выше.text) ? 1 : 0);
      to = Math.max(to, строка.from + /^\s*/.exec(строка.text)![0].length);
    } else {
      const край = строка.from + (индекс === п.от ? м.колонка : 0);
      while (from > край && /\s/.test(строка.text.charAt(from - строка.from - 1))) from -= 1;
    }
    const вставка = `\n${маркер(номерНового(гр, k))}`;
    const начало = from;
    changes.push({from, to, insert: вставка});
    курсор = (изменения) => изменения.mapPos(начало, -1) + вставка.length;
    сдвигПосле = k;
  }
  if (уплотнять) changes.push(...уплотнение(т, гр, знак, () => всеПросты, косая, сдвигПосле));
  const изменения = state.changes(слить(changes));
  // Структурное действие — отдельная запись истории: набор до и после него в неё не склеивается.
  view.dispatch({changes: изменения, selection: {anchor: курсор(изменения)}, scrollIntoView: true, userEvent: 'input', annotations: isolateHistory.of('full')});
  return true;
};

/** Штатное завершение списка на пустом пункте; в цитате штатная команда ведёт список целиком. */
const штатное = insertNewlineContinueMarkupCommand({nonTightLists: false});
const завершениеПункта: Command = (view) => {
  const state = view.state;
  const главное = state.selection.main;
  if (state.readOnly || !главное.empty) return false;
  const найдено = пунктУ(state, главное.from);
  if (найдено === null) return false;
  if (найдено.вЦитате) return штатное(view);
  const строка = state.doc.lineAt(главное.from);
  const м = маркерСтроки(строка.text);
  const пустой = м !== null && state.doc.lineAt(найдено.пункт.from).number === строка.number && строка.text.slice(м.колонка).trim() === '';
  return пустой ? штатное(view) : false;
};

/**
 * Зазор между двумя пунктами одного списка (или соседних списков того же вида) у позиции удаления:
 * `Backspace` в начале нижнего пункта и `Delete` в конце верхнего убирают ровно пустые строки между
 * ними, не склеивая маркер со словами. `null` — у позиции не такой зазор, удаляет штатная команда.
 */
export function зазорМеждуПунктами(state: EditorState, pos: number, вперёд: boolean): {changes: Замена; anchor: number} | null {
  const doc = state.doc;
  const строка = doc.lineAt(pos);
  // Перед скрытой косой переноса курсор стоит на знак раньше конца строки: это тот же конец пункта.
  const конец = строка.to - (косая(строка.text) ? 1 : 0);
  if (вперёд ? pos !== строка.to && pos !== конец : pos !== строка.from) return null;
  let n = строка.number + (вперёд ? 1 : -1);
  while (n >= 1 && n <= doc.lines && doc.line(n).text.trim() === '') n += вперёд ? 1 : -1;
  if (n < 1 || n > doc.lines || Math.abs(n - строка.number) < 2) return null;
  const выше = вперёд ? строка : doc.line(n);
  const ниже = вперёд ? doc.line(n) : строка;
  const маркер = маркерСтроки(ниже.text);
  if (маркер === null || выше.text.trim() === '') return null;
  const нижний = пунктУ(state, ниже.from + маркер.отступ + маркер.текст.length);
  if (нижний === null || doc.lineAt(нижний.пункт.from).number !== ниже.number) return null;
  const списокНижнего = нижний.пункт.parent;
  if (списокНижнего === null) return null;
  // Строка выше может кончать вложенный пункт: подходит любой её пункт-предок в том же списке
  // или в списке-соседе того же вида прямо перед нижним.
  const тотЖе = (список: SyntaxNode | null): boolean =>
    список !== null && (список === списокНижнего || (список.nextSibling === списокНижнего && видУзла(список) === видУзла(списокНижнего)));
  let верхний: SyntaxNode | null = пунктУ(state, выше.to)?.пункт ?? null;
  while (верхний !== null && !тотЖе(верхний.parent)) {
    верхний = верхний.parent;
    while (верхний !== null && верхний.name !== 'ListItem') верхний = верхний.parent;
  }
  if (верхний === null) return null;
  const т = построчно(doc.toString());
  const changes = удалениеЗазора(т, выше.number - 1, ниже.number - 1, косая);
  return {changes, anchor: вперёд ? changes.from : changes.from + 1};
}

function команда(правило: (текст: string, где: Selection) => Edit | null): Command {
  return (view) => {
    if (view.state.readOnly) return false;

    const {from, to} = view.state.selection.main;
    const текст = view.state.doc.toString();
    const правка = правило(текст, {from, to});

    // Двигать некуда (первый пункт списка, левый край), но курсор стоит в списке: клавишу забираем
    // себе и текст не трогаем. Иначе `Tab` увёл бы фокус из текста посреди набора списка.
    // Вне списка правило молчит, и `Tab` работает как работал.
    if (!правка) return вСписке(текст, {from, to});

    view.dispatch({
      changes: {from: правка.from, to: правка.to, insert: правка.insert},
      selection: правка.select
        ? {anchor: правка.from + правка.select.from, head: правка.from + правка.select.to}
        : {anchor: правка.from + (правка.caret ?? 0)},
      scrollIntoView: true,
      userEvent: 'input.indent',
    });
    return true;
  };
}

export const уровеньСписка: KeyBinding[] = [
  {key: 'Enter', run: следующийПункт},
  {key: 'Enter', run: завершениеПункта},
  {key: 'Backspace', run: deleteMarkupBackward},
  {key: 'Tab', run: команда(вложить)},
  {key: 'Shift-Tab', run: команда(поднять)},
];

export function клавишиСписка() {
  return keymap.of(уровеньСписка);
}
