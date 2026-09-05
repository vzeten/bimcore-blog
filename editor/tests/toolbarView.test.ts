// Имя каждого теста повторяет формулировку правила.
// Панель «Форматировать»: короткие кнопки объясняют себя, слова остаются словами.
import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {видКнопки} from '../src/ui/editor/SelectionToolbar';
import type {Button} from '../src/core/commands';

const settings = JSON.parse(readFileSync(fileURLToPath(new URL('../settings.json', import.meta.url)), 'utf8')) as {вставки: Button[]};
const кнопки = settings.вставки.filter((item) => item.группа !== 'Блоки');

describe('вид кнопок панели форматирования', () => {
  it('заголовки показаны как H2, H3, H4 — H1 не предлагается, им является название статьи', () => {
    const заголовки = кнопки.filter((item) => item.команда === 'заголовок').map((item) => видКнопки(item).знак);
    expect(заголовки).toEqual(['H2', 'H3', 'H4']);
  });

  it('жирный и курсив — B и I, ссылка и оба списка — пиктограммы, примечания — словами', () => {
    const по = (подпись: string) => видКнопки(кнопки.find((item) => item.подпись === подпись)!);
    expect(по('Жирный')).toEqual({знак: 'B'});
    expect(по('Курсив')).toEqual({знак: 'I'});
    expect(по('Ссылка').пиктограмма).toBe('ссылка');
    expect(по('Точками').пиктограмма).toBe('точки');
    expect(по('Числами').пиктограмма).toBe('числа');
    expect(кнопки.filter((item) => item.команда === 'список').map((item) => item.группа)).toEqual(['Список', 'Список']);
    for (const слово of ['Примечание', 'Совет', 'Информация', 'Предупреждение', 'Опасность']) expect(по(слово)).toEqual({знак: слово});
  });

  it('у каждой кнопки подпись из настроек остаётся её названием и подсказкой', () => {
    for (const item of кнопки) expect(item.подпись.trim()).not.toBe('');
  });
});

// Положение панели считается по настоящим размерам панели, выделения и видимой области.
import {положениеПанели} from '../src/ui/editor/SelectionToolbar';

describe('положение панели относительно выделения', () => {
  const окно = {ширина: 1440, высота: 900};
  const область = {top: 120, bottom: 880};
  const панель = {ширина: 300, высота: 36};
  const пересекает = (место: {left: number; top: number}, spot: {left: number; right: number; top: number; bottom: number}) =>
    место.left < spot.right && место.left + панель.ширина > spot.left && место.top < spot.bottom && место.top + панель.высота > spot.top;

  it('над выделением, когда сверху есть место, и без пересечения с ним', () => {
    const spot = {left: 400, right: 520, top: 300, bottom: 330, область};
    const место = положениеПанели(spot, панель, окно);
    expect(место.top + панель.высота).toBeLessThanOrEqual(spot.top);
    expect(место.left).toBe(400);
    expect(пересекает(место, spot)).toBe(false);
  });

  it('под выделением у верхнего края видимой области — по настоящей высоте панели, не по запасу', () => {
    const spot = {left: 400, right: 520, top: 150, bottom: 180, область};
    const место = положениеПанели(spot, panelHigh(80), окно);
    expect(место.top).toBeGreaterThanOrEqual(spot.bottom);
    // Панель пониже над тем же выделением помещается сверху.
    expect(положениеПанели(spot, panelHigh(20), окно).top + 20).toBeLessThanOrEqual(spot.top);
  });

  it('у правого края окна панель сдвигается влево на свою ширину, а не на условные 720', () => {
    const spot = {left: 1300, right: 1400, top: 300, bottom: 330, область};
    const место = положениеПанели(spot, {ширина: 700, высота: 36}, окно);
    expect(место.left + 700).toBeLessThanOrEqual(окно.ширина - 8);
    expect(место.left).toBeGreaterThanOrEqual(8);
  });

  it('многострочное выделение во всю видимую область: панель у верха окна, а не за его пределами', () => {
    const spot = {left: 200, right: 1200, top: 100, bottom: 900, область};
    const место = положениеПанели(spot, панель, окно);
    expect(место.top).toBeGreaterThanOrEqual(8);
    expect(место.top + панель.высота).toBeLessThanOrEqual(окно.высота);
  });

  function panelHigh(высота: number) {
    return {ширина: 300, высота};
  }
});
