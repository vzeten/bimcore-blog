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
import {знакиЖирногоВидны} from '../src/ui/livePreview/boldMarks';
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

/** Что видно человеку: текст без тех знаков, которые окно прячет при таком выделении. */
function видно(text: string, места: Selection[]): string {
  const спрятать = жирныеКуски(text)
    .filter((кусок) => !знакиЖирногоВидны(кусок, места))
    .flatMap((кусок) => кусок.знаки);
  return [...text]
    .filter((_, at) => !спрятать.some((знак) => at >= знак.from && at < знак.to))
    .join('');
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

describe('знаки жирного в окне', () => {
  const {текст, курсор} = нажать(ФАЙЛ, СЛОВО);

  it('после кнопки «Жирный» курсор стоит за куском и служебные знаки не показываются', () => {
    expect(видно(текст, [{from: курсор, to: курсор}])).toBe(ФАЙЛ);
  });

  it('существующая жирность открывается без видимых знаков и без правки самого файла', () => {
    expect(видно(текст, [{from: 0, to: 0}])).toBe(ФАЙЛ);
    expect(текст).toBe('Параметр **Ушки по бокам** включаются к любому изголовью.\n');
  });

  it('курсор внутри куска открывает знаки — там их правят руками', () => {
    expect(видно(текст, [{from: 13, to: 13}])).toBe(текст);
  });

  it('знаки соседнего курсива по-прежнему живут своим правилом строки, жирное их не трогает', () => {
    const курсивом = 'Параметр *Ушки* включаются.\n';
    expect(видно(курсивом, [{from: 0, to: 0}])).toBe(курсивом);
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
