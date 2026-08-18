// Что делает каждая кнопка панели. Чистые правила: на входе текст и выделение,
// на выходе — новый текст и куда поставить курсор. Ни редактора, ни интерфейса здесь нет.

export interface Selection {
  from: number;
  to: number;
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

function lineBounds(text: string, at: Selection): Selection {
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

/** Превращает выделенные строки в список. Повторное нажатие снимает список. */
export function list(text: string, at: Selection, kind: 'точки' | 'числа'): Edit {
  const bounds = lineBounds(text, at);
  const lines = text.slice(bounds.from, bounds.to).split('\n');
  const already = lines.every((line) => (kind === 'точки' ? /^-\s+/.test(line) : /^\d+\.\s+/.test(line)));

  const changed = lines.map((line, index) => {
    const bare = line.replace(/^(-|\d+\.)\s+/, '');
    if (already) return bare;
    return kind === 'точки' ? `- ${bare}` : `${index + 1}. ${bare}`;
  });

  const insert = changed.join('\n');
  return {from: bounds.from, to: bounds.to, insert, caret: insert.length};
}

/** Оборачивает выделенное в знаки разметки. Без выделения — ставит знаки и курсор между ними. */
export function wrap(text: string, at: Selection, sign: string): Edit {
  const chosen = text.slice(at.from, at.to);
  if (chosen === '') {
    return {from: at.from, to: at.to, insert: `${sign}${sign}`, caret: sign.length};
  }
  return {from: at.from, to: at.to, insert: `${sign}${chosen}${sign}`, caret: sign.length + chosen.length + sign.length};
}

/**
 * Оборачивает выделенное слово в ссылку и выделяет место под адрес.
 * Обе видимые человеку заглушки приходят из настроек: своих строк в ядре нет.
 */
export function link(text: string, at: Selection, заглушки: {адрес: string; текст: string}): Edit {
  const chosen = text.slice(at.from, at.to) || заглушки.текст;
  const insert = `[${chosen}](${заглушки.адрес})`;
  const start = chosen.length + 3;
  return {from: at.from, to: at.to, insert, select: {from: start, to: start + заглушки.адрес.length}};
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
