// Имя каждого теста повторяет формулировку правила.
// Проверяется результат применения правки к тексту, а не устройство функции.
import {describe, expect, it} from 'vitest';
import {heading, list, wrap, link, table, tableRow, type Edit, type Selection} from '../src/core/commands';

/** Применяет правку к тексту так же, как это делает редактор. */
function apply(text: string, edit: Edit): string {
  return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
}

const всё = (text: string): Selection => ({from: 0, to: text.length});
const ЗАГЛУШКИ = {адрес: 'вставьте ссылку', текст: 'текст ссылки'};
const ШАБЛОН = 'Столбец {номер}';

describe('команды правки текста', () => {
  it('заголовок ставится на выделенную строку', () => {
    const text = 'Раздел';
    expect(apply(text, heading(text, всё(text), 2))).toBe('## Раздел');
  });

  it('повторный заголовок того же уровня снимается', () => {
    const text = '## Раздел';
    expect(apply(text, heading(text, всё(text), 2))).toBe('Раздел');
  });

  it('заголовок меняет уровень, а не задваивает решётки', () => {
    const text = '## Раздел';
    expect(apply(text, heading(text, всё(text), 3))).toBe('### Раздел');
  });

  it('список точками ставится на выделенные строки', () => {
    const text = 'один\nдва';
    expect(apply(text, list(text, всё(text), 'точки'))).toBe('- один\n- два');
  });

  it('повторный список точками снимается', () => {
    const text = '- один\n- два';
    expect(apply(text, list(text, всё(text), 'точки'))).toBe('один\nдва');
  });

  it('нумерованный список нумерует строки по порядку', () => {
    const text = 'один\nдва\nтри';
    expect(apply(text, list(text, всё(text), 'числа'))).toBe('1. один\n2. два\n3. три');
  });

  it('жирный оборачивает выделение в двойные звёздочки', () => {
    const text = 'слово';
    expect(apply(text, wrap(text, всё(text), '**'))).toBe('**слово**');
  });

  it('курсив оборачивает выделение в одну звёздочку', () => {
    const text = 'слово';
    expect(apply(text, wrap(text, всё(text), '*'))).toBe('*слово*');
  });

  it('код оборачивает выделение в обратные кавычки', () => {
    const text = 'слово';
    expect(apply(text, wrap(text, всё(text), '`'))).toBe('`слово`');
  });

  it('оборачивание без выделения ставит пустые знаки и курсор между ними', () => {
    const edit = wrap('', {from: 0, to: 0}, '**');
    expect(apply('', edit)).toBe('****');
    expect(edit.caret).toBe(2);
  });

  it('ссылка вставляется с адресом-заглушкой из настроек', () => {
    const text = 'сайт';
    const edit = link(text, всё(text), ЗАГЛУШКИ);
    expect(apply(text, edit)).toBe('[сайт](вставьте ссылку)');
    // Курсор выделяет именно адрес, чтобы его сразу заменить.
    expect(edit.insert.slice(edit.select!.from, edit.select!.to)).toBe(ЗАГЛУШКИ.адрес);
  });

  it('ссылка без выделения берёт текст-заглушку из настроек', () => {
    const edit = link('', {from: 0, to: 0}, ЗАГЛУШКИ);
    expect(apply('', edit)).toBe('[текст ссылки](вставьте ссылку)');
  });

  it('таблица создаётся с заголовком-шаблоном из настроек', () => {
    const edit = table('', {from: 0, to: 0}, 3, 2, ШАБЛОН);
    expect(edit.insert).toContain('| Столбец 1 | Столбец 2 | Столбец 3 |');
    // Разделитель шапки и две пустые строки тела — всего четыре строки таблицы.
    expect(edit.insert.trim().split('\n')).toHaveLength(4);
  });

  it('строка таблицы добавляется по числу столбцов текущей строки', () => {
    const text = '| а | б | в |';
    const edit = tableRow(text, {from: 0, to: text.length})!;
    expect(edit).not.toBeNull();
    // Новая строка на три столбца — четыре разделителя.
    expect((edit.insert.match(/\|/g) ?? []).length).toBe(4);
  });

  it('строка таблицы вне таблицы не добавляется и текст не портится', () => {
    const text = 'обычный абзац, не таблица';
    expect(tableRow(text, {from: 0, to: text.length})).toBeNull();
  });
});
