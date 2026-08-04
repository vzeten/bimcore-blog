import {describe, expect, it} from 'vitest';
import {colorize, type Layer} from '../src/core/colorize';

function kindOf(text: string, layers: Layer[], fragment: string): string | undefined {
  const at = text.indexOf(fragment);
  const {segments} = colorize(layers);
  return segments.find((segment) => at >= segment.from && at < segment.to)?.kind;
}

describe('слои изменений', () => {
  it('нетронутый текст помечен как «на сайте»', () => {
    const layers: Layer[] = [
      {text: 'Первый абзац. Второй абзац.', kind: 'site'},
      {text: 'Первый абзац. Второй абзац.', kind: 'current'},
    ];
    expect(kindOf('Первый абзац. Второй абзац.', layers, 'Первый')).toBe('site');
  });

  it('различает мои прошлые правки, правки ИИ и текущие', () => {
    const site = 'Стены соединяются. Материалы разные.';
    const afterHuman = 'Стены соединяются. Материалы разные. Добавил вчера.';
    const afterAi = 'Стены соединяются. Материалы разные. Добавил вчера. Уточнение ИИ.';
    const now = 'Стены соединяются. Материалы разные. Добавил вчера. Уточнение ИИ. Пишу сейчас.';

    const layers: Layer[] = [
      {text: site, kind: 'site'},
      {text: afterHuman, kind: 'prevHuman'},
      {text: afterAi, kind: 'prevAi'},
      {text: now, kind: 'current'},
    ];

    expect(kindOf(now, layers, 'Стены')).toBe('site');
    expect(kindOf(now, layers, 'вчера')).toBe('prevHuman');
    expect(kindOf(now, layers, 'ИИ.')).toBe('prevAi');
    expect(kindOf(now, layers, 'сейчас')).toBe('current');
  });

  it('удалённое не остаётся в тексте, а попадает в список удалений', () => {
    const layers: Layer[] = [
      {text: 'Начало. Лишнее предложение. Конец.', kind: 'site'},
      {text: 'Начало. Конец.', kind: 'current'},
    ];
    const {segments, deletions} = colorize(layers);

    expect(deletions).toHaveLength(1);
    expect(deletions[0].text).toContain('Лишнее предложение.');
    expect(deletions[0].kind).toBe('current');
    expect(segments.every((segment) => segment.kind === 'site')).toBe(true);
  });

  it('замена слова красит только новое слово', () => {
    const now = 'Стены из разных материалов на плане.';
    const layers: Layer[] = [
      {text: 'Стены из различных материалов на плане.', kind: 'site'},
      {text: now, kind: 'current'},
    ];

    expect(kindOf(now, layers, 'Стены')).toBe('site');
    expect(kindOf(now, layers, 'разных')).toBe('current');
    expect(kindOf(now, layers, 'плане')).toBe('site');
  });

  it('разные переводы строк не считаются изменением', () => {
    const {segments, deletions} = colorize([
      {text: 'Первая строка.\r\nВторая строка.\r\n', kind: 'site'},
      {text: 'Первая строка.\nВторая строка.\n', kind: 'current'},
    ]);

    expect(deletions).toHaveLength(0);
    expect(segments.every((segment) => segment.kind === 'site')).toBe(true);
  });

  it('дописанный символ не выглядит как удаление слова', () => {
    const now = 'Правьте, как угодно.';
    const layers: Layer[] = [
      {text: 'Правьте как угодно.', kind: 'site'},
      {text: now, kind: 'current'},
    ];
    const {deletions} = colorize(layers);

    expect(deletions).toHaveLength(0);
    expect(kindOf(now, layers, 'Правьте')).toBe('site');
    expect(kindOf(now, layers, ',')).toBe('current');
  });

  it('удаление одних пробелов не попадает в список', () => {
    const {deletions} = colorize([
      {text: 'Слово   ещё слово', kind: 'site'},
      {text: 'Слово ещё слово', kind: 'current'},
    ]);

    expect(deletions).toHaveLength(0);
  });

  it('отрезки покрывают весь текст без дыр', () => {
    const now = 'Один. Два. Три.';
    const {segments} = colorize([
      {text: 'Один. Три.', kind: 'site'},
      {text: now, kind: 'current'},
    ]);

    expect(segments[0].from).toBe(0);
    expect(segments.at(-1)?.to).toBe(now.length);
    for (let i = 1; i < segments.length; i += 1) expect(segments[i].from).toBe(segments[i - 1].to);
  });
});
