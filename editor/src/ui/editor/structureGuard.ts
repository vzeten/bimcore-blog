// Карта поверхности: обычный текст — состояние по умолчанию, в карте только исключения; отвечает лишь о границах.

import {Decoration, EditorView, type DecorationSet} from '@codemirror/view';
import {EditorState, Facet, RangeSet, RangeValue, StateField, type Extension, type Line, type Range, type Text} from '@codemirror/state';
import {советы} from '../../core/tipBlock';
import {ВЫРАЖЕНИЕ, импортСтатьи, тегиТекста} from '../../core/jsxTag.mjs';
import {видеоТекста} from '../../core/videoFile.mjs';
import type {Блок} from '../../core/jsxBlocks';
import {КАРТИНКА_В_СТРОКЕ, внутриОграды, переносыАбзацев, пунктСписка, строкаТолькоКартинка} from '../livePreview/softBreak';
import type {ОписаниеБлока} from '../types';

export type Диапазон = {from: number; to: number};

export interface Область extends Диапазон {
  вид: 'скрытый' | 'разделитель' | 'блок' | 'контейнер';
  тело?: Диапазон; // у контейнера — строки между границами, где текст правится как обычный
}

/** Пустая строка — разделитель, если к ней примыкает строка текста, закрытие контейнера сверху или
 * его открытие снизу; внутри контейнера у границ, рядом с пустыми, в самом конце статьи под
 * закрытием и после жёсткого переноса она — пустой абзац. */
export function картаПоверхности(doc: Text, имена: ReadonlySet<string>): Область[] {
  const текст = doc.toString();
  const строки = текст.split('\n');
  const строка = (i: number): Line => doc.line(i + 1);
  const номер = (место: number): number => doc.lineAt(место).number - 1;
  const код = внутриОграды(строки);
  const открытия = new Set<number>();
  const закрытия = new Set<number>();
  const карта: Область[] = [];

  for (const {открытие, закрытие} of советы(строки, код)) {
    открытия.add(открытие);
    закрытия.add(закрытие);
    const тело = {from: строка(открытие + 1).from, to: Math.max(строка(открытие + 1).from, строка(закрытие - 1).to)};
    карта.push({вид: 'контейнер', from: строка(открытие).from, to: строка(закрытие).to, тело});
  }

  let карточка = false;
  for (const тег of тегиТекста(текст) as (Блок & {от: number; до: number})[]) {
    if (!имена.has(тег.имя) || код[номер(тег.от)]) continue;
    карта.push({вид: 'блок', from: тег.от, to: тег.до});
    if (тег.свойства.some((свойство) => свойство.выражение)) карточка = true;
  }

  // Скрытые импорты: картинка карточки и файл каждого понятного ролика. Строка прячется вместе
  // со своей пустой строкой ниже и ровно один раз, сколько бы блоков на неё ни ссылалось.
  const импорты = new Set<number>();
  const импорт = импортСтатьи(текст, ВЫРАЖЕНИЕ.имя) as {от: number} | null;
  if (импорт !== null && карточка) импорты.add(импорт.от);
  for (const видео of видеоТекста(текст) as {от: number; до: number; импорт: {от: number}}[]) {
    if (код[номер(видео.от)]) continue;
    карта.push({вид: 'блок', from: видео.от, to: видео.до});
    импорты.add(видео.импорт.от);
  }
  for (const от of импорты) {
    const i = номер(от);
    if (код[i]) continue;
    const пустаяНиже = i + 1 < строки.length && строки[i + 1].trim() === '';
    карта.push({вид: 'скрытый', from: строка(i).from, to: строка(пустаяНиже ? i + 1 : i).to});
  }

  const {жёсткие} = переносыАбзацев(строки);
  for (const i of жёсткие) карта.push({вид: 'скрытый', from: строка(i).to - 1, to: строка(i + 1).from});
  const текстом = (j: number): boolean =>
    j >= 0 && j < строки.length && строки[j].trim() !== '' && !открытия.has(j) && !закрытия.has(j);

  for (let i = 0; i < строки.length; i += 1) {
    if (код[i]) continue;
    if (строки[i].trim() === '') {
      const уГраницы = (закрытия.has(i - 1) && i + 1 < строки.length) || открытия.has(i + 1);
      if (!жёсткие.includes(i - 1) && (текстом(i - 1) || текстом(i + 1) || уГраницы)) {
        карта.push({вид: 'разделитель', from: строка(i).from, to: строка(i).to});
      }
    } else if (строкаТолькоКартинка(строки[i])) {
      карта.push({вид: 'блок', from: строка(i).from, to: строка(i).to});
    } else {
      for (const м of строки[i].matchAll(КАРТИНКА_В_СТРОКЕ)) {
        карта.push({вид: 'блок', from: строка(i).from + м.index, to: строка(i).from + м.index + м[0].length});
      }
    }
  }

  return карта.sort((а, б) => а.from - б.from || а.to - б.to);
}

export function целойСтрокой(doc: Text, о: Диапазон): boolean {
  return doc.lineAt(о.from).from === о.from && doc.lineAt(о.to).to === о.to;
}

function непроходимые(doc: Text, карта: Область[]): Диапазон[] {
  const край = (о: Диапазон): Диапазон => ({from: Math.max(0, о.from - 1), to: Math.min(doc.length, о.to + 1)});
  const сырые = карта.flatMap((о): Диапазон[] => {
    if (о.вид === 'контейнер' && о.тело !== undefined) {
      return [{from: Math.max(0, о.from - 1), to: о.тело.from}, {from: о.тело.to, to: Math.min(doc.length, о.to + 1)}];
    }
    return [о.вид === 'разделитель' || целойСтрокой(doc, о) ? край(о) : {from: о.from, to: о.to}];
  }).sort((а, б) => а.from - б.from);

  const слитые: Диапазон[] = [];
  for (const о of сырые) {
    const последняя = слитые[слитые.length - 1];
    if (последняя !== undefined && о.from < последняя.to) последняя.to = Math.max(последняя.to, о.to);
    else слитые.push({...о});
  }
  return слитые;
}

function служебная(doc: Text, карта: Область[], строка: Line): boolean {
  return карта.some((о) => {
    if (о.вид === 'контейнер') return строка.from === о.from || строка.to === о.to;
    if (о.вид === 'разделитель') return о.from === строка.from;
    return целойСтрокой(doc, о) && о.from <= строка.from && о.to >= строка.to;
  });
}

function допустимаяПозиция(doc: Text, карта: Область[], области: Диапазон[], pos: number, вперёд: boolean): number {
  const внутри = области.find((о) => о.from < pos && pos < о.to);
  if (внутри !== undefined) pos = вперёд ? внутри.to : внутри.from;

  const строка = doc.lineAt(pos);
  if (!служебная(doc, карта, строка)) return pos;
  for (const шаг of вперёд ? [1, -1] : [-1, 1]) {
    for (let n = строка.number + шаг; n >= 1 && n <= doc.lines; n += шаг) {
      const соседняя = doc.line(n);
      if (!служебная(doc, карта, соседняя)) return шаг > 0 ? соседняя.from : соседняя.to;
    }
  }
  return pos;
}

export function портитСлужебное(doc: Text, карта: Область[], from: number, to: number): boolean {
  const задевает = (о: Диапазон, сНачала = false): boolean =>
    (from < о.to && to > о.from) || (from === to && from < о.to && (from > о.from || (сНачала && from === о.from)));
  const покрывает = (о: Диапазон): boolean => from <= о.from && to >= о.to;

  return карта.some((о) => {
    if (о.вид === 'контейнер' && о.тело !== undefined) {
      return (задевает({from: о.from, to: о.тело.from}) || задевает({from: о.тело.to, to: о.to})) && !покрывает(о);
    }
    return о.вид === 'скрытый' && задевает(о, целойСтрокой(doc, о)) && !покрывает(о);
  });
}

class Атом extends RangeValue {}
const АТОМ = new Атом();
const РАЗДЕЛИТЕЛЬ = Decoration.line({class: 'md-sep'});
const СТРОКА_БЛОКА = Decoration.line({class: 'md-block-line'});

function построить(doc: Text, имена: ReadonlySet<string>) {
  const карта = картаПоверхности(doc, имена);
  const области = непроходимые(doc, карта);
  const декорации: Range<Decoration>[] = [];
  for (const о of карта) {
    if (о.вид === 'разделитель') декорации.push(РАЗДЕЛИТЕЛЬ.range(о.from));
    else if (о.вид === 'блок' && целойСтрокой(doc, о)) декорации.push(СТРОКА_БЛОКА.range(о.from));
  }
  const атомы = RangeSet.of(области.map((о) => АТОМ.range(о.from, о.to)), true);
  return {карта, области, атомы, декорации: Decoration.set(декорации, true)};
}

const имена = Facet.define<ReadonlySet<string>, ReadonlySet<string>>({combine: (значения) => значения[0] ?? new Set()});

export const поверхность = StateField.define<{карта: Область[]; области: Диапазон[]; атомы: RangeSet<Атом>; декорации: DecorationSet}>({
  create: (state) => построить(state.doc, state.facet(имена)),
  update: (значение, tr) => (tr.docChanged ? построить(tr.newDoc, tr.startState.facet(имена)) : значение),
  provide: (поле) => [
    EditorView.decorations.from(поле, (значение) => значение.декорации),
    EditorView.atomicRanges.from(поле, (значение) => () => значение.атомы),
  ],
});

export function блокВ(state: EditorState, pos: number): Область | null {
  return state.field(поверхность).карта.find((о) => о.вид === 'блок' && о.from <= pos && pos <= о.to) ?? null;
}

/** Выделение целиком в обычном тексте: не задевает блок, скрытую строку и границы контейнера. */
export function обычныйТекст(state: EditorState, from: number, to: number): boolean {
  const задевает = (о: Диапазон): boolean => from < о.to && to > о.from;
  return !state.field(поверхность).карта.some((о) => {
    if (о.вид === 'контейнер') return о.тело !== undefined && (задевает({from: о.from, to: о.тело.from}) || задевает({from: о.тело.to, to: о.to}));
    return о.вид === 'блок' ? задевает(о) : о.вид === 'скрытый' && целойСтрокой(state.doc, о) && задевает(о);
  });
}

export function контейнерКурсора(state: EditorState, pos: number): Область | null {
  return state.field(поверхность).карта
    .find((о) => о.вид === 'контейнер' && о.тело !== undefined && о.тело.from <= pos && pos <= о.тело.to) ?? null;
}

export function поверхностьРедактирования(блоки: Record<string, ОписаниеБлока>): Extension {
  const известные: ReadonlySet<string> = new Set(Object.keys(блоки));
  return [
    имена.of(известные),
    поверхность,
    EditorState.transactionFilter.of((tr) => {
      const своя = !tr.isUserEvent('undo') && !tr.isUserEvent('redo');
      if (tr.docChanged && своя) {
        const {карта} = tr.startState.field(поверхность);
        let портит = false;
        tr.changes.iterChangedRanges((from, to) => {
          if (портитСлужебное(tr.startState.doc, карта, from, to)) портит = true;
        });
        if (портит) return [];
      }
      const новая = tr.docChanged ? построить(tr.newDoc, известные) : tr.startState.field(поверхность);
      // Набранный маркер списка под строкой с жёстким переносом делает её косую буквой: сайт показал бы
      // слеш. Только тогда косая уходит той же транзакцией, что и маркер, — отмена возвращает обе.
      // Другие начала блоков и вставка из буфера косую не трогают.
      if (tr.docChanged && своя && tr.isUserEvent('input.type')) {
        const набрано: Диапазон[] = [];
        tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => набрано.push({from: fromB, to: toB}));
        const мёртвые = tr.startState.field(поверхность).карта
          .filter((о) => о.вид === 'скрытый' && !целойСтрокой(tr.startState.doc, о))
          .map((о) => tr.changes.mapPos(о.from, -1))
          .filter((p) => {
            if (tr.newDoc.sliceString(p, p + 2) !== '\\\n' || новая.карта.some((о) => о.вид === 'скрытый' && о.from === p)) return false;
            const ниже = tr.newDoc.lineAt(p + 2);
            return пунктСписка(ниже.text) && набрано.some((н) => н.from >= ниже.from && н.to <= ниже.to);
          });
        if (мёртвые.length > 0) return [tr, {changes: мёртвые.map((p) => ({from: p, to: p + 1})), sequential: true}];
      }
      if (tr.selection === undefined || !tr.newSelection.main.empty) return tr;
      const {карта, области} = новая;
      const head = tr.newSelection.main.head;
      // Пустая строка, куда правка поставила курсор (конец списка, `Enter` после таблицы, вставка блока), становится абзацем.
      const строка = tr.newDoc.lineAt(head);
      if (tr.docChanged && своя && !tr.isUserEvent('delete') && строка.text === '' && служебная(tr.newDoc, карта, строка)) {
        const doc = tr.newDoc;
        const есть = (n: number): boolean => n >= 1 && n <= doc.lines;
        // Рядом уже есть пустой абзац (конец статьи, край примечания): курсор уходит в него, второй не заводится.
        const свободная = [строка.number + 1, строка.number - 1].find((n) => есть(n) && doc.line(n).text === '' && !служебная(doc, карта, doc.line(n)));
        if (свободная !== undefined) return [tr, {selection: {anchor: doc.line(свободная).from}, sequential: true}];
        // У границы своего примечания разделитель не нужен: пустая строка там была бы не разделителем, а абзацем.
        const своё = карта.find((о) => о.вид === 'контейнер' && о.тело !== undefined && о.тело.from <= строка.from && строка.to <= о.тело.to);
        const граница = (n: number): boolean => своё !== undefined && (doc.line(n).from === своё.from || doc.line(n).to === своё.to);
        const сосед = (n: number): boolean => есть(n) && doc.line(n).text.trim() !== '' && !граница(n);
        const до = сосед(строка.number - 1) ? '\n' : '';
        const после = сосед(строка.number + 1) ? '\n' : '';
        return [tr, {changes: [{from: строка.from, insert: до}, {from: строка.to, insert: после}], selection: {anchor: строка.from + до.length}, sequential: true}];
      }
      const куда = допустимаяПозиция(tr.newDoc, карта, области, head, head >= tr.startState.selection.main.head);
      return куда === head ? tr : [tr, {selection: {anchor: куда}, sequential: true}];
    }),
  ];
}
