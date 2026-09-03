// Имя каждого теста повторяет формулировку правила.
// Карта поверхности: обычный текст — состояние по умолчанию, карта хранит только исключения, и по ней
// живут курсор, разделители и последняя защита служебного синтаксиса.
import {describe, expect, it} from 'vitest';
import {EditorSelection, EditorState, Text} from '@codemirror/state';
import {markdown} from '@codemirror/lang-markdown';
import {блокВ, картаПоверхности, контейнерКурсора, обычныйТекст, поверхностьРедактирования, портитСлужебное} from '../src/ui/editor/structureGuard';
import {вставкаБлока} from '../src/core/jsxBlocks';
import type {ОписаниеБлока} from '../src/ui/types';

const БЛОКИ: Record<string, ОписаниеБлока> = {
  ProductCard: {подпись: 'Товар', поля: []},
  YouTube: {подпись: 'Видео', поля: []},
  CTA: {подпись: 'Призыв', поля: []},
};
const ИМЕНА = new Set(Object.keys(БЛОКИ));

const КАРТОЧКА = [
  "import productPreview from './product.jpg';",
  '',
  '',
  'Текст.',
  '',
  '<ProductCard',
  '  name="Кресла"',
  '  image={productPreview}',
  '/>',
  '',
  'После.',
].join('\n');

const карта = (текст: string) => картаПоверхности(Text.of(текст.split('\n')), ИМЕНА);

function состояние(текст: string, курсор = 0): EditorState {
  return EditorState.create({
    doc: текст,
    selection: EditorSelection.single(курсор),
    extensions: [markdown(), поверхностьРедактирования(БЛОКИ)],
  });
}

/** Куда встаёт курсор, если поставить его в это место, придя из `откуда`. */
function курсор(текст: string, куда: number, откуда = 0): number {
  return состояние(текст, откуда).update({selection: {anchor: куда}}).newSelection.main.head;
}

describe('карта хранит только исключения из обычного текста', () => {
  it('у заголовка и двух абзацев в карте только разделители — пустые строки рядом с текстом', () => {
    const текст = '# Заголовок\n\nАбзац первый,\nвторая строка.\n\nВторой абзац.';
    const вторая = текст.indexOf('\n\nВторой') + 1;
    expect(карта(текст)).toEqual([{вид: 'разделитель', from: 12, to: 12}, {вид: 'разделитель', from: вторая, to: вторая}]);
  });

  it('пустая рядом только с пустыми, границей совета или краем документа — редактируемый пустой абзац', () => {
    expect(карта('А\n\n\n\nБ').map((о) => о.from)).toEqual([2, 4]);
    expect(карта(':::tip\n\n:::').filter((о) => о.вид === 'разделитель')).toEqual([]);
    expect(карта(':::tip\nТекст\n\n\n:::').filter((о) => о.вид === 'разделитель').map((о) => о.from)).toEqual([13]);
    expect(карта('А\n\n').map((о) => о.from)).toEqual([2]);
    // Снаружи граница совета — как текст: пустая под закрытием и над открытием — разделитель.
    expect(карта(':::tip\nТ\n:::\n\n\nПосле.').filter((о) => о.вид === 'разделитель').map((о) => о.from)).toEqual([13, 14]);
    expect(карта('До.\n\n\n:::tip\nТ\n:::').filter((о) => о.вид === 'разделитель').map((о) => о.from)).toEqual([4, 5]);
  });

  it('косая жёсткого переноса скрыта вместе с переводом строки, а пустая строка за ней — продолжение абзаца', () => {
    expect(карта('Строка\\\n\nДальше.')).toEqual([{вид: 'скрытый', from: 6, to: 8}]);
  });

  it('совет — контейнер: границы целиком, тело — строки между ними', () => {
    const текст = 'До.\n\n:::tip[Совет]\nПервый.\n\nВторой.\n:::\n\nПосле.';
    expect(карта(текст).find((о) => о.вид === 'контейнер')).toEqual({
      вид: 'контейнер',
      from: текст.indexOf(':::tip'),
      to: текст.indexOf('\n:::\n') + 4,
      тело: {from: текст.indexOf('Первый.'), to: текст.indexOf('Второй.') + 'Второй.'.length},
    });
    expect(карта(':::tip\n\n:::')[0].тело).toEqual({from: 7, to: 7});
  });

  it('картинка на своей строке — блок всей строкой; картинка и тег в тексте — ровно своим узлом', () => {
    const текст = 'До.\n\n![a](./a.png)\n\nТекст ![b](./b.png) и ![c](./c.png).\n\n<YouTube id="x" />\n\nСлово <CTA type="guide" /> рядом.';
    const узел = (кусок: string) => ({вид: 'блок', from: текст.indexOf(кусок), to: текст.indexOf(кусок) + кусок.length});
    expect(карта(текст).filter((о) => о.вид === 'блок')).toEqual([
      узел('![a](./a.png)'), узел('![b](./b.png)'), узел('![c](./c.png)'), узел('<YouTube id="x" />'), узел('<CTA type="guide" />'),
    ]);
  });

  it('импорт карточки скрыт вместе со своей пустой строкой; импорт без карточки — обычный текст', () => {
    expect(карта(КАРТОЧКА).find((о) => о.вид === 'скрытый'))
      .toEqual({вид: 'скрытый', from: 0, to: "import productPreview from './product.jpg';\n".length});
    expect(карта("import productPreview from './p.jpg';\n\nАбзац.").map((о) => о.вид)).toEqual(['разделитель']);
  });

  it('внутри огороженного кода и у незнакомого тега исключений нет', () => {
    expect(карта('```\n:::tip\n![a](./a.png)\n\n<YouTube id="x" />\n:::\n```')).toEqual([]);
    expect(карта('<Unknown x="1" />')).toEqual([]);
  });
});

describe('курсор на служебной строке переставляется на ближайшее законное место', () => {
  const текст = 'До.\n\n![a](./a.png)\n\nПосле.';

  it('с разделителя и строки картинки — вперёд в начало следующего текста, назад в конец предыдущего', () => {
    const пустая = текст.indexOf('\n\n![a]') + 1;
    expect(курсор(текст, пустая, 0)).toBe(текст.indexOf('После.'));
    expect(курсор(текст, пустая, текст.length)).toBe(3);
    expect(курсор(текст, текст.indexOf('![a]') + 2, 0)).toBe(текст.indexOf('После.'));
  });

  it('в конце текста, в его начале и в пустом абзаце курсор остаётся', () => {
    expect(курсор(текст, 3)).toBe(3);
    expect(курсор(текст, текст.indexOf('После.'))).toBe(текст.indexOf('После.'));
    expect(курсор('А\n\n\n\nБ', 3)).toBe(3);
  });

  it('программный курсор внутри картинки или тега в строке выталкивается целиком, и ввод блок не портит', () => {
    const строка = 'Текст ![b](./b.png) и <CTA type="guide" /> дальше.';
    for (const [узел, вперёд] of [['![b](./b.png)', true], ['<CTA type="guide" />', false]] as [string, boolean][]) {
      const от = строка.indexOf(узел);
      const внутри = состояние(строка, вперёд ? 0 : строка.length).update({selection: {anchor: от + 3}}).state;
      expect(внутри.selection.main.head).toBe(вперёд ? от + узел.length : от);
      const ввод = внутри.update({changes: {from: внутри.selection.main.head, insert: 'X'}, selection: {anchor: внутри.selection.main.head + 1}, userEvent: 'input.type'});
      expect(ввод.newDoc.toString()).toContain(узел);
    }
  });

  it('пустая строка над примечанием курсору не даётся: он уходит в его текст', () => {
    expect(курсор('До.\n\n\n:::tip\nТекст\n:::', 5)).toBe(13);
  });

  it('пустая строка в начале и в конце документа курсору не даётся', () => {
    expect(курсор('\nТекст', 0)).toBe(1);
    expect(курсор('Текст\n', 6, 0)).toBe(5);
  });

  it('служебные строки совета и импорта курсору не даются', () => {
    expect(курсор(':::tip\nТ\n:::', 2)).toBe(7);
    expect(курсор(':::tip\nТ\n:::', 11, 7)).toBe(8);
    expect(курсор(КАРТОЧКА, 3)).toBe(КАРТОЧКА.indexOf('Текст.'));
  });
});

describe('пустая строка, куда правка поставила курсор, становится абзацем между разделителями', () => {
  /** Правка окна: перевод строки в конце строки и курсор на новой строке — как `Enter` штатной команды. */
  function перевод(текст: string, где: number) {
    const итог = состояние(текст, где).update({changes: {from: где, insert: '\n'}, selection: {anchor: где + 1}, userEvent: 'input'}).state;
    return {текст: итог.doc.toString(), курсор: итог.selection.main.head};
  }

  it('после таблицы, огороженного кода и завершённого списка появляется место для абзаца', () => {
    expect(перевод('| а | б |\n|---|---|\n## Заголовок', 19)).toEqual({текст: '| а | б |\n|---|---|\n\n\n\n## Заголовок', курсор: 21});
    expect(перевод('```\nкод\n```\nДальше.', 11)).toEqual({текст: '```\nкод\n```\n\n\n\nДальше.', курсор: 13});
    expect(перевод('- пункт\n\nДальше.', 8)).toEqual({текст: '- пункт\n\n\n\nДальше.', курсор: 9});
  });

  it('вставка блока оставляет курсор на своей строке под ним', () => {
    const текст = 'Абзац.\n\nЕщё.';
    const правка = вставкаБлока(текст, {from: 6, to: 6}, '<YouTube id="x" />');
    const итог = состояние(текст, 6).update({changes: {from: правка.from, insert: правка.insert}, selection: {anchor: правка.from + правка.caret!}}).state;
    expect(итог.doc.toString()).toBe('Абзац.\n\n<YouTube id="x" />\n\n\n\nЕщё.');
    expect(итог.selection.main.head).toBe(итог.doc.toString().indexOf('\n\n\n\nЕщё.') + 2);
    // Панель свойств находит вставленный тег по карте от знака `<` перед курсором — без хвоста переводов строк.
    const начало = итог.doc.toString().lastIndexOf('<', итог.selection.main.head);
    expect(блокВ(итог, начало)).toEqual({вид: 'блок', from: начало, to: начало + '<YouTube id="x" />'.length});
  });

  it('отмена возвращает прежний текст без добавленных разделителей', () => {
    const было = состояние('Абзац.', 6).update({changes: {from: 6, insert: '\n\n'}, selection: {anchor: 8}, userEvent: 'input'}).state;
    expect(было.update({changes: {from: 6, to: 8}, selection: {anchor: 6}, userEvent: 'undo'}).state.doc.toString()).toBe('Абзац.');
  });
});

describe('последняя защита: частичная порча служебного синтаксиса не проходит', () => {
  const совет = 'До.\n\n:::tip\nТекст\n:::\n\nПосле.';

  it('удаление одной границы совета не проходит, совета целиком — проходит', () => {
    const закрытие = совет.indexOf('\n:::');
    expect(состояние(совет).update({changes: {from: закрытие, to: закрытие + 4}}).docChanged).toBe(false);
    expect(состояние(совет).update({changes: {from: 5, to: совет.indexOf('\n\nПосле')}}).docChanged).toBe(true);
    expect(портитСлужебное(Text.of(совет.split('\n')), карта(совет), 0, совет.length)).toBe(false);
  });

  it('набор внутри тела совета и рядом с ним проходит', () => {
    const тело = совет.indexOf('Текст') + 2;
    expect(состояние(совет, тело).update({changes: {from: тело, insert: 'X'}, selection: {anchor: тело + 1}}).newDoc.toString()).toContain('ТеXкст');
    expect(состояние(совет).update({changes: {from: 3, insert: '!'}}).docChanged).toBe(true);
  });

  it('вставка знака внутрь и в начало скрытого импорта не проходит, его удаление целиком — проходит', () => {
    expect(состояние(КАРТОЧКА).update({changes: {from: 3, insert: 'x'}}).docChanged).toBe(false);
    expect(состояние(КАРТОЧКА).update({changes: {from: 0, insert: 'x'}}).docChanged).toBe(false);
    expect(состояние(КАРТОЧКА).update({changes: {from: 0, to: КАРТОЧКА.indexOf('/>') + 2}}).docChanged).toBe(true);
  });
});

describe('обычный текст для команд выделения', () => {
  it('выделение внутри абзацев и тела совета — обычный текст; задевшее блок, импорт или границу — нет', () => {
    const текст = 'До.\n\n![a](./a.png)\n\n:::tip\nТело совета\n:::\n\nПосле.';
    const с = состояние(текст);
    expect(обычныйТекст(с, 0, 3)).toBe(true);
    expect(обычныйТекст(с, текст.indexOf('Тело') + 1, текст.indexOf('Тело') + 4)).toBe(true);
    expect(обычныйТекст(с, 0, текст.length)).toBe(false);
    expect(обычныйТекст(с, 1, текст.indexOf('![a]') + 2)).toBe(false);
    expect(обычныйТекст(с, текст.indexOf('Тело'), текст.indexOf('После.'))).toBe(false);
    expect(обычныйТекст(состояние(КАРТОЧКА), 0, 5)).toBe(false);
  });
});

describe('запросы карты по позиции', () => {
  it('блок находится по любой позиции внутри и на краях, контейнер — по позиции в теле', () => {
    const текст = 'До.\n\n![a](./a.png)\n\n:::tip\nТело\n:::';
    const с = состояние(текст);
    expect(блокВ(с, текст.indexOf('![a]') + 3)?.from).toBe(текст.indexOf('![a]'));
    expect(блокВ(с, 1)).toBeNull();
    expect(контейнерКурсора(с, текст.indexOf('Тело') + 2)?.вид).toBe('контейнер');
    expect(контейнерКурсора(с, 1)).toBeNull();
  });
});
