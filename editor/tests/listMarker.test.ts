// Имя каждого теста повторяет формулировку правила.
// Маркер пункта списка в окне рисуется по уровню вложенности, как его рисует браузер на сайте.
import {describe, expect, it} from 'vitest';
import {знакМаркера, уровеньСписка, type Узел} from '../src/ui/livePreview/listMarker';

/** Дерево от корня вниз: последний узел — тот, про который спрашиваем. */
function дерево(...имена: string[]): Узел {
  let узел: Узел | null = null;
  for (const name of имена) узел = {name, parent: узел};
  return узел!;
}

describe('знак маркера по уровню', () => {
  it('верхний уровень — сплошная точка', () => {
    expect(знакМаркера(1)).toBe('•');
  });

  it('второй уровень — пустой круг', () => {
    expect(знакМаркера(2)).toBe('◦');
  });

  it('третий уровень — квадрат', () => {
    expect(знакМаркера(3)).toBe('▪');
  });

  it('глубже третьего браузер знак не меняет — окно тоже', () => {
    expect(знакМаркера(4)).toBe('▪');
    expect(знакМаркера(9)).toBe('▪');
  });

  it('уровень вне списка знака не придумывает и даёт верхний', () => {
    expect(знакМаркера(0)).toBe('•');
  });
});

describe('уровень пункта по дереву', () => {
  it('пункт в одном списке — первый уровень', () => {
    expect(уровеньСписка(дерево('Document', 'BulletList', 'ListItem', 'ListMark'))).toBe(1);
  });

  it('пункт во вложенном списке — второй уровень', () => {
    expect(уровеньСписка(дерево('Document', 'BulletList', 'ListItem', 'BulletList', 'ListItem', 'ListMark'))).toBe(2);
  });

  it('уровень считается по спискам обеих пород, а не по одним маркированным', () => {
    expect(уровеньСписка(дерево('Document', 'OrderedList', 'ListItem', 'BulletList', 'ListItem', 'ListMark'))).toBe(2);
  });

  it('третий уровень считается тремя списками над пунктом', () => {
    const узел = дерево(
      'Document',
      'BulletList', 'ListItem',
      'BulletList', 'ListItem',
      'BulletList', 'ListItem', 'ListMark',
    );
    expect(уровеньСписка(узел)).toBe(3);
  });

  it('узла нет — уровня нет', () => {
    expect(уровеньСписка(null)).toBe(0);
  });

  it('цитата и абзац между списками уровень не набирают', () => {
    const узел = дерево('Document', 'Blockquote', 'Paragraph', 'BulletList', 'ListItem', 'ListMark');
    expect(уровеньСписка(узел)).toBe(1);
  });
});
