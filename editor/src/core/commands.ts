// Что делает каждая кнопка панели. Чистые правила: на входе текст и выделение,
// на выходе — новый текст и куда поставить курсор. Ни редактора, ни интерфейса здесь нет.
import {знакиПары, парыЗнаков, type Пара} from './emphasisPairs';

export interface Selection {
  from: number;
  to: number;
}

export interface Button {
  группа: string;
  подпись: string;
  команда: string;
  уровень?: number;
  /** Вид списка у кнопки списка: точками или числами. */
  вид?: 'точки' | 'числа';
  знак?: string;
  столбцов?: number;
  строк?: number;
  текст?: string;
  блок?: string;
}

export interface Edit {
  /** Что вставить вместо выделенного куска. */
  insert: string;
  /** Границы замены — могут быть шире выделения, если правим строки целиком. */
  from: number;
  to: number;
  /** Куда поставить курсор после правки, считая от начала вставки. */
  caret?: number;
  /** Что выделить после правки, считая от начала вставки. */
  select?: Selection;
}

export function lineBounds(text: string, at: Selection): Selection {
  const from = text.lastIndexOf('\n', at.from - 1) + 1;
  const found = text.indexOf('\n', at.to);
  return {from, to: found === -1 ? text.length : found};
}

/** Превращает выделенные строки в заголовок нужного уровня. Повторное нажатие снимает заголовок. */
export function heading(text: string, at: Selection, level: number): Edit {
  const bounds = lineBounds(text, at);
  const marks = '#'.repeat(level);

  const lines = text.slice(bounds.from, bounds.to).split('\n').map((line) => {
    const bare = line.replace(/^#{1,6}\s+/, '');
    return line.startsWith(`${marks} `) ? bare : `${marks} ${bare}`;
  });

  const insert = lines.join('\n');
  return {from: bounds.from, to: bounds.to, insert, caret: insert.length};
}

/** Выделение без пробелов по краям: знаки разметки к пробелу не липнут, иначе пара не закроется. */
function безКраёв(text: string, at: Selection): Selection {
  let from = at.from;
  let to = at.to;
  while (from < to && /\s/.test(text[from])) from += 1;
  while (to > from && /\s/.test(text[to - 1])) to -= 1;
  return {from, to};
}

/** Текст области без знаков задетых пар: то, что человек видит в окне. */
function безЗнаков(text: string, область: Selection, пары: Пара[]): string {
  const знаки = пары.flatMap(знакиПары);
  let итог = '';
  for (let at = область.from; at < область.to; at += 1) {
    if (знаки.some((знак) => at >= знак.from && at < знак.to)) continue;
    итог += text[at];
  }
  return итог;
}

/**
 * Вся ли область уже оформлена этим знаком: каждая буква либо внутри пары, либо это её знак.
 * Пробел между двумя оформленными кусками счёт не портит — на вид человека такой кусок жирный
 * целиком, и повторное нажатие обязано снять оформление, а не поставить его заново.
 */
function ужеОформлено(text: string, область: Selection, пары: Пара[]): boolean {
  if (пары.length === 0) return false;
  for (let at = область.from; at < область.to; at += 1) {
    const внутри = пары.some((пара) => at >= пара.from && at < пара.to);
    if (внутри || /\s/.test(text[at])) continue;
    return false;
  }
  return true;
}

/**
 * Знаки разметки на выделенном куске: нажатие ставит их, повторное нажатие на уже оформленном
 * куске — снимает ровно свою обёртку и оставляет текст. Одна кнопка обоих действий, потому что в
 * окне служебных знаков не видно: человек видит только жирный или наклонный вид и нажимает ту же
 * кнопку, чтобы его убрать.
 *
 * Область правки шире выделения, когда выделение задело чужие знаки: наполовину снятая пара
 * оставила бы в тексте одинокую звёздочку. Смешанный кусок (часть уже оформлена) сначала теряет
 * внутренние знаки и оформляется целиком — вложенных пар одного вида в markdown не бывает.
 * Без выделения знаки просто ставятся, а курсор встаёт между ними.
 */
export function wrap(text: string, at: Selection, sign: string): Edit {
  const кусок = безКраёв(text, at);
  if (кусок.from === кусок.to) {
    return {from: at.from, to: at.from, insert: `${sign}${sign}`, caret: sign.length};
  }

  const задетые = парыЗнаков(text, lineBounds(text, кусок), sign)
    .filter((пара) => пара.to > кусок.from && пара.from < кусок.to);
  const область = {
    from: Math.min(кусок.from, ...задетые.map((пара) => пара.from)),
    to: Math.max(кусок.to, ...задетые.map((пара) => пара.to)),
  };
  const голый = безЗнаков(text, область, задетые);

  if (ужеОформлено(text, область, задетые)) {
    return {from: область.from, to: область.to, insert: голый, select: {from: 0, to: голый.length}};
  }
  return {
    from: область.from,
    to: область.to,
    insert: `${sign}${голый}${sign}`,
    caret: sign.length + голый.length + sign.length,
  };
}

/**
 * Оборачивает выделенное слово в ссылку с пустым адресом: курсор встаёт между скобок, и адрес из
 * буфера ложится туда одной вставкой — стирать заглушку не нужно. Без выделения текстом ссылки
 * становится заглушка из настроек, выделенная целиком под набор; адрес и тогда пуст.
 */
export function link(text: string, at: Selection, заглушки: {текст: string}): Edit {
  const chosen = text.slice(at.from, at.to);
  const label = chosen || заглушки.текст;
  const insert = `[${label}]()`;
  if (chosen) return {from: at.from, to: at.to, insert, caret: label.length + 3};
  return {from: at.from, to: at.to, insert, select: {from: 1, to: 1 + label.length}};
}

/**
 * Готовая таблица нужного размера: шапка и пустые строки.
 * Подпись столбца — шаблон из настроек с меткой `{номер}`, а не строка в коде.
 */
export function table(text: string, at: Selection, columns: number, rows: number, шаблонСтолбца: string): Edit {
  const head = `| ${Array.from({length: columns}, (_, i) => шаблонСтолбца.replace('{номер}', String(i + 1))).join(' | ')} |`;
  const rule = `|${Array.from({length: columns}, () => '---').join('|')}|`;
  const body = Array.from({length: rows}, () => `| ${Array.from({length: columns}, () => ' ').join('| ')}|`);

  const before = at.from > 0 && text[at.from - 1] !== '\n' ? '\n\n' : '';
  const insert = `${before}${[head, rule, ...body].join('\n')}\n`;

  return {from: at.from, to: at.to, insert, caret: insert.length};
}

/** Добавляет строку таблицы под текущей — по числу столбцов в этой же таблице. */
export function tableRow(text: string, at: Selection): Edit | null {
  const bounds = lineBounds(text, at);
  const line = text.slice(bounds.from, bounds.to);
  if (!line.trim().startsWith('|')) return null;

  const columns = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').length;
  const insert = `\n| ${Array.from({length: columns}, () => ' ').join('| ')}|`;

  return {from: bounds.to, to: bounds.to, insert, caret: 3};
}

/**
 * Разбор картинки в границах узла, который нашло синтаксическое дерево редактора.
 * Своего обхода текста здесь нет — правило работает только с текстом готового узла,
 * иначе появился бы второй разборщик markdown рядом со штатным.
 */
export const РАЗБОР_КАРТИНКИ = /^!\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)/;

/**
 * Правка подписи (alt) картинки: меняется ровно диапазон подписи, остальной узел не трогается.
 * `null` — правки нет: узел перестал быть этой картинкой (текст сдвинулся, `src` другой)
 * либо подпись не изменилась. Неизменённая подпись обязана давать `null`, а не пустую правку:
 * текст статьи не переписывается без действия человека.
 */
export function imageAlt(nodeText: string, nodeFrom: number, alt: string, ожидаемыйSrc: string): Edit | null {
  const found = РАЗБОР_КАРТИНКИ.exec(nodeText);
  if (!found || found[2] !== ожидаемыйSrc) return null;

  const insert = alt.replace(/\r?\n/g, ' ').replace(/[\\\]]/g, '\\$&');
  if (insert === found[1]) return null;

  return {from: nodeFrom + 2, to: nodeFrom + 2 + found[1].length, insert};
}

/** Подпись картинки для показа человеку: без знаков экранирования, которыми она записана в файле. */
export function shownAlt(raw: string): string {
  return raw.replace(/\\([\\\]])/g, '$1');
}

/**
 * Правка адреса картинки в узле после смены формата файла: меняется ровно диапазон адреса,
 * подпись и остальной узел не трогаются. `null` — узел не та картинка, которую меняли
 * (текст сдвинулся или адрес уже другой): править наугад нельзя.
 */
export function imageSrc(nodeText: string, nodeFrom: number, старыйSrc: string, новыйSrc: string): Edit | null {
  const found = РАЗБОР_КАРТИНКИ.exec(nodeText);
  if (!found || found[2] !== старыйSrc) return null;

  const start = nodeFrom + 2 + found[1].length + 2;
  return {from: start, to: start + found[2].length, insert: новыйSrc};
}
