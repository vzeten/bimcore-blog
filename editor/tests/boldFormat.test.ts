// Имя каждого теста повторяет формулировку правила.
// Жирное форматирование целиком: что кнопка пишет в файл, что окно показывает и каким слоем
// помечает. Три части одного результата проверяются вместе — расхождение между ними и было бедой.
import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {commonmarkLanguage} from '@codemirror/lang-markdown';
import type {SyntaxNode} from '@lezer/common';
import {colorize, type Layer, type LayerKind} from '../src/core/colorize';
import type {Button, Edit, Selection} from '../src/core/commands';
import {EditorSelection, EditorState} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {markdown} from '@codemirror/lang-markdown';
import {внутристрочныеЗнаки} from '../src/ui/livePreview/inline';
import {decideEdit} from '../src/ui/editor/SelectionToolbar';

const settings = JSON.parse(readFileSync(fileURLToPath(new URL('../settings.json', import.meta.url)), 'utf8')) as {
  вставки: Button[];
};
const ЖИРНЫЙ = settings.вставки.find((item) => item.подпись === 'Жирный')!;

/** Нажатие кнопки «Жирный» из настроек: новый текст и место курсора после правки. */
function нажать(text: string, at: Selection): {текст: string; курсор: number} {
  const edit = decideEdit(ЖИРНЫЙ, text, at, {settings: {} as never, articlePath: ''}) as Edit;
  return {
    текст: `${text.slice(0, edit.from)}${edit.insert}${text.slice(edit.to)}`,
    курсор: edit.from + (edit.caret ?? edit.insert.length),
  };
}

/** Границы жирных кусков по штатному разбору markdown — тому же, каким живёт окно. */
function жирныеКуски(text: string): {from: number; to: number; знаки: Selection[]}[] {
  const куски: {from: number; to: number; знаки: Selection[]}[] = [];
  commonmarkLanguage.parser.parse(text).iterate({
    enter: (node) => {
      if (node.name !== 'EmphasisMark') return;
      const кусок: SyntaxNode | null = node.node.parent;
      if (кусок?.name !== 'StrongEmphasis') return;
      const свой = куски.find((item) => item.from === кусок.from);
      const знак = {from: node.from, to: node.to};
      if (свой) свой.знаки.push(знак);
      else куски.push({from: кусок.from, to: кусок.to, знаки: [знак]});
    },
  });
  return куски;
}

/**
 * Что человек видит в окне при таком курсоре: текст без кусков, которые спрятал слой показа.
 * Декорации спрашиваются у самого слоя, а не пересказываются здесь (SPEC 5.2.1); спрятанное — это
 * замена пустотой, у пометки есть класс, у виджета — свой вид.
 */
function видно(text: string, курсор: Selection): string {
  const state = EditorState.create({
    doc: text,
    selection: EditorSelection.range(курсор.from, курсор.to),
    extensions: [markdown({addKeymap: false})],
  });
  ensureSyntaxTree(state, state.doc.length, 5_000);

  // Видимая область — весь текст: в тесте окна нет, а прокрутка к правилу показа отношения не имеет.
  const view = {state, visibleRanges: [{from: 0, to: state.doc.length}]} as unknown as EditorView;
  const спрятано: Selection[] = [];
  внутристрочныеЗнаки(view, '').between(0, state.doc.length, (from, to, deco) => {
    if (to > from && deco.spec.class === undefined && deco.spec.widget === undefined) спрятано.push({from, to});
  });
  return [...text].filter((_, at) => !спрятано.some((к) => at >= к.from && at < к.to)).join('');
}

/** Каким слоем помечен кусок текста в готовой цепочке. */
function слой(слои: Layer[], кусок: string): LayerKind | undefined {
  const текст = слои.at(-1)?.text ?? '';
  const at = текст.indexOf(кусок);
  return colorize(слои).segments.find((s) => s.from <= at && at < s.to)?.kind;
}

const ФАЙЛ = 'Параметр Ушки по бокам включаются к любому изголовью.\n';
const СЛОВО: Selection = {from: 9, to: 22};

describe('кнопка «Жирный» пишет в файл ровно `**выделенное**`', () => {
  it('выделенный текст оборачивается парой знаков без удвоения и утечки в видимый текст', () => {
    const {текст} = нажать(ФАЙЛ, СЛОВО);
    expect(текст).toBe('Параметр **Ушки по бокам** включаются к любому изголовью.\n');
    expect(текст.replace(/\*\*/g, '')).toBe(ФАЙЛ);
  });

  it('повторное применение к тому же куску снимает жирность и возвращает файл байт в байт', () => {
    // Знаков в окне не видно, и та же кнопка — единственный способ убрать оформление. Подробный
    // разбор снятия для обеих кнопок — `wrapToggle.test.ts`; здесь важно, что пара не удваивается.
    const {текст} = нажать(нажать(ФАЙЛ, СЛОВО).текст, {from: 11, to: 24});
    expect(текст).toBe(ФАЙЛ);
    expect(жирныеКуски(текст)).toEqual([]);
  });

  it('ошибка или отказ команды не меняет текст: без выделения буквы остаются на месте', () => {
    const {текст} = нажать(ФАЙЛ, {from: 9, to: 9});
    expect(текст.replace(/\*\*/g, '')).toBe(ФАЙЛ);
  });
});

describe('знаки разметки открываются активным абзацем, одинаково у жирного и курсива', () => {
  // Два абзаца: первый из двух строк через мягкий перенос, второй за пустой строкой.
  const ТЕКСТ = [
    'Первый **жирный** и *курсив* тут.',
    'Вторая строка с **парой**.',
    '',
    'Второй абзац с **жирным** и *курсивом*.',
    '',
  ].join('\n');
  const БЕЗ_ЗНАКОВ = ТЕКСТ.replace(/\*/g, '');
  const место = (кусок: string): Selection => {
    const from = ТЕКСТ.indexOf(кусок);
    return {from, to: from + кусок.length};
  };
  /** Тот же текст, но знаки убраны только в названных строках. */
  const безЗнаковВ = (...строки: number[]): string => ТЕКСТ.split('\n')
    .map((строка, i) => (строки.includes(i) ? строка.replace(/\*/g, '') : строка))
    .join('\n');

  it('курсор в абзаце открывает знаки ВСЕХ его кусков, а не только слова под курсором', () => {
    const {from} = место('Первый');
    // Жирный и курсив первой строки и жирный второй — весь абзац сразу; второй абзац закрыт.
    expect(видно(ТЕКСТ, {from, to: from})).toBe(безЗнаковВ(3));
  });

  it('соседний абзац знаков не открывает: ушёл из абзаца — остаётся готовый вид', () => {
    const {from} = место('Второй абзац');
    expect(видно(ТЕКСТ, {from, to: from})).toBe(безЗнаковВ(0, 1));
  });

  it('вне абзацев знаки закрыты у всех кусков', () => {
    const пустая = ТЕКСТ.indexOf('\n\n') + 1;
    expect(видно(ТЕКСТ, {from: пустая, to: пустая})).toBe(БЕЗ_ЗНАКОВ);
  });

  it('курсор сразу за закрывающими знаками жирного открывает их: там их и правят руками', () => {
    const за = ТЕКСТ.indexOf('**жирный**') + '**жирный**'.length;
    expect(ТЕКСТ.slice(за - 2, за)).toBe('**');
    expect(видно(ТЕКСТ, {from: за, to: за})).toBe(безЗнаковВ(3));
  });

  it('курсор у курсива открывает и жирное того же абзаца: правило у них одно', () => {
    const за = ТЕКСТ.indexOf('*курсив*') + '*курсив*'.length;
    expect(видно(ТЕКСТ, {from: за, to: за})).toBe(безЗнаковВ(3));
  });

  it('выделение через оба абзаца открывает знаки обоих', () => {
    expect(видно(ТЕКСТ, {from: место('Первый').from, to: место('Второй абзац').to})).toBe(ТЕКСТ);
  });

  it('заголовок над абзацем своих знаков не открывает: он абзацу не продолжение', () => {
    // Заодно видно, что правило у всей разметки одно: закрыты и `**` заголовка, и его собственные `##`.
    const текст = '## Раздел с **жирным**\n\nАбзац с **жирным**.\n';
    const from = текст.indexOf('Абзац');
    expect(видно(текст, {from, to: from})).toBe('Раздел с жирным\n\nАбзац с **жирным**.\n');
  });

  it('поставленная кнопкой жирность открыта, пока курсор в абзаце, и закрывается при уходе', () => {
    const {текст, курсор} = нажать(ФАЙЛ, СЛОВО);
    expect(видно(текст, {from: курсор, to: курсор})).toBe(текст);
    const другой = `${текст}\nВторой абзац.\n`;
    const вне = другой.indexOf('Второй абзац');
    expect(видно(другой, {from: вне, to: вне})).toBe(ФАЙЛ.replace('\n', '') + '\n\nВторой абзац.\n');
  });
});

describe('слой правки жирности', () => {
  const {текст} = нажать(ФАЙЛ, СЛОВО);
  const правки = [{fromA: СЛОВО.from, toA: СЛОВО.to, fromB: СЛОВО.from, toB: СЛОВО.to + 4}];

  it('изменение только жирности целиком относится к слою «Сейчас»', () => {
    const слои: Layer[] = [{text: ФАЙЛ, kind: 'site'}, {text: текст, kind: 'current', правки}];
    expect(слой(слои, 'Ушки по бокам')).toBe('current');
    expect(слой(слои, 'Параметр')).toBe('site');
    expect(слой(слои, 'включаются')).toBe('site');
  });

  it('в смешанном старом и уже изменённом тексте новая жирность красит словосочетание целиком', () => {
    const сайт = 'Параметр Ушки по бокам включаются.\n';
    const файл = 'Параметр Ушки по краям включаются.\n';
    const окно = 'Параметр **Ушки по краям** включаются.\n';
    const слои: Layer[] = [{text: сайт, kind: 'site'}, {text: файл, kind: 'prevHuman'},
      {text: окно, kind: 'current', правки: [{fromA: 9, toA: 22, fromB: 9, toB: 26}]}];

    expect(слой(слои, 'Ушки по')).toBe('current');
    expect(слой(слои, 'краям')).toBe('current');
  });

  it('после сохранения и повторного открытия жирность остаётся правкой того, кто её поставил', () => {
    // Слои сравниваются целиком, без известных границ правок: так статья и открывается заново.
    const слои: Layer[] = [{text: ФАЙЛ, kind: 'site'}, {text: текст, kind: 'prevHuman'}];
    expect(слой(слои, 'Ушки по бокам')).toBe('prevHuman');
    expect(слой(слои, 'Параметр')).toBe('site');
  });

  it('существующая жирность прошлого слоя сама собой не перекрашивается в новую', () => {
    const слои: Layer[] = [{text: текст, kind: 'site'}, {text: текст, kind: 'prevAi'},
      {text: текст, kind: 'current'}];
    expect(слой(слои, 'Ушки по бокам')).toBe('site');
    expect(слой(слои, '**')).toBe('site');
  });

  it('незакрытая пара знаков не утягивает окраску на остальной текст', () => {
    const начало = 'Раз два.\nТри четыре.\n';
    const окно = 'Раз **два.\nТри четыре.\n';
    const слои: Layer[] = [{text: начало, kind: 'site'}, {text: окно, kind: 'current'}];
    expect(слой(слои, 'Три четыре')).toBe('site');
  });
});
