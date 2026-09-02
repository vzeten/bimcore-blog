// Карта поверхности редактирования: обычный текст — состояние по умолчанию, карта хранит только
// исключения. Собирается из существующих разборов и отвечает лишь о границах, не о содержимом.

import {Decoration, EditorView, type DecorationSet} from '@codemirror/view';
import {
  Annotation, EditorState, Facet, RangeSet, RangeValue, StateField, type Extension, type Line, type Range, type Text,
} from '@codemirror/state';
import {советы} from '../../core/tipBlock';
import {ВЫРАЖЕНИЕ, импортСтатьи, тегиТекста} from '../../core/jsxTag.mjs';
import type {Блок} from '../../core/jsxBlocks';
import {КАРТИНКА_В_СТРОКЕ, внутриОграды, переносыАбзацев, строкаТолькоКартинка} from '../livePreview/softBreak';
import type {ОписаниеБлока} from '../types';

export type Диапазон = {from: number; to: number};

export interface Область extends Диапазон {
  вид: 'скрытый' | 'разделитель' | 'блок' | 'контейнер';
  /** У контейнера — строки между границами: там текст правится как обычный. */
  тело?: Диапазон;
}

/** Правка самой поверхности (удаление блока с его импортом): последняя защита её пропускает. */
export const правкаПоверхности = Annotation.define<boolean>();

/** Пустая строка — разделитель, если к ней примыкает строка текста (не граница контейнера); рядом
 * только с пустыми, границами или краем документа она — пустой абзац; после жёсткого переноса —
 * продолжение абзаца. */
export function картаПоверхности(doc: Text, имена: ReadonlySet<string>): Область[] {
  const текст = doc.toString();
  const строки = текст.split('\n');
  const строка = (i: number): Line => doc.line(i + 1);
  const номер = (место: number): number => doc.lineAt(место).number - 1;
  const код = внутриОграды(строки);
  const граница = new Set<number>();
  const карта: Область[] = [];

  for (const {открытие, закрытие} of советы(строки, код)) {
    граница.add(открытие).add(закрытие);
    const тело = {from: строка(открытие + 1).from, to: Math.max(строка(открытие + 1).from, строка(закрытие - 1).to)};
    карта.push({вид: 'контейнер', from: строка(открытие).from, to: строка(закрытие).to, тело});
  }

  let карточка = false;
  for (const тег of тегиТекста(текст) as (Блок & {от: number; до: number})[]) {
    if (!имена.has(тег.имя) || код[номер(тег.от)]) continue;
    карта.push({вид: 'блок', from: тег.от, to: тег.до});
    if (тег.свойства.some((свойство) => свойство.выражение)) карточка = true;
  }

  // Строка импорта прячется вместе со своей пустой строкой — ровно так же, как её прячет показ.
  const импорт = импортСтатьи(текст, ВЫРАЖЕНИЕ.имя) as {от: number} | null;
  if (импорт !== null && карточка && !код[номер(импорт.от)]) {
    const i = номер(импорт.от);
    const пустаяНиже = i + 1 < строки.length && строки[i + 1].trim() === '';
    карта.push({вид: 'скрытый', from: строка(i).from, to: строка(пустаяНиже ? i + 1 : i).to});
  }

  const {жёсткие} = переносыАбзацев(строки);
  for (const i of жёсткие) карта.push({вид: 'скрытый', from: строка(i).to - 1, to: строка(i + 1).from});
  const текстом = (j: number): boolean => j >= 0 && j < строки.length && строки[j].trim() !== '' && !граница.has(j);

  for (let i = 0; i < строки.length; i += 1) {
    if (код[i]) continue;
    if (строки[i].trim() === '') {
      if (!жёсткие.includes(i - 1) && (текстом(i - 1) || текстом(i + 1))) {
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

/** Непроходимые для курсора области; занимающая строки целиком забирает и переводы строк вокруг
 * себя — иначе на её краях оставались бы пустые карманы. */
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

/** Строка, куда курсору вставать некуда: разделитель, граница контейнера, целиком блок или импорт. */
function служебная(doc: Text, карта: Область[], строка: Line): boolean {
  return карта.some((о) => {
    if (о.вид === 'контейнер') return строка.from === о.from || строка.to === о.to;
    if (о.вид === 'разделитель') return о.from === строка.from;
    return целойСтрокой(doc, о) && о.from <= строка.from && о.to >= строка.to;
  });
}

/** Ближайшая позиция, где курсор законен: вне непроходимой области и на редактируемой строке. */
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

/** Правка портит служебный синтаксис: задевает скрытое или границу контейнера, не покрыв их целиком. */
export function портитСлужебное(карта: Область[], from: number, to: number): boolean {
  const задевает = (о: Диапазон): boolean => (from < о.to && to > о.from) || (from === to && from > о.from && from < о.to);
  const покрывает = (о: Диапазон): boolean => from <= о.from && to >= о.to;

  return карта.some((о) => {
    if (о.вид === 'контейнер' && о.тело !== undefined) {
      return (задевает({from: о.from, to: о.тело.from}) || задевает({from: о.тело.to, to: о.to})) && !покрывает(о);
    }
    return о.вид === 'скрытый' && задевает(о) && !покрывает(о);
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
      // Последняя защита: частичная порча скрытого не проходит; отмена и возврат восстанавливают законное.
      if (tr.docChanged && tr.annotation(правкаПоверхности) !== true && !tr.isUserEvent('undo') && !tr.isUserEvent('redo')) {
        const {карта} = tr.startState.field(поверхность);
        let портит = false;
        tr.changes.iterChangedRanges((from, to) => {
          if (портитСлужебное(карта, from, to)) портит = true;
        });
        if (портит) return [];
      }
      if (tr.selection === undefined || !tr.newSelection.main.empty) return tr;
      const {карта, области} = tr.docChanged ? построить(tr.newDoc, известные) : tr.startState.field(поверхность);
      const head = tr.newSelection.main.head;
      const куда = допустимаяПозиция(tr.newDoc, карта, области, head, head >= tr.startState.selection.main.head);
      return куда === head ? tr : [tr, {selection: {anchor: куда}, sequential: true}];
    }),
  ];
}
