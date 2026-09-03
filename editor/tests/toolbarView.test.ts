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
    for (const слово of ['Примечание', 'Совет', 'Информация', 'Предупреждение', 'Опасность']) expect(по(слово)).toEqual({знак: слово});
  });

  it('у каждой кнопки подпись из настроек остаётся её названием и подсказкой', () => {
    for (const item of кнопки) expect(item.подпись.trim()).not.toBe('');
  });
});
