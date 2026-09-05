// Имя каждого теста повторяет формулировку правила.
// Ролик на поверхности редактора: блок целиком, скрытый импорт, курсору туда хода нет; удаление
// блока забирает свой импорт только тогда, когда переменная больше никому не нужна; отмена возвращает всё.
import {describe, expect, it} from 'vitest';
import {EditorSelection, EditorState, Text, type TransactionSpec} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {ensureSyntaxTree} from '@codemirror/language';
import {markdown} from '@codemirror/lang-markdown';
import {history, undo} from '@codemirror/commands';
import {блокВ, картаПоверхности, обычныйТекст, поверхностьРедактирования} from '../src/ui/editor/structureGuard';
import {клавишиПоверхности} from '../src/ui/editor/surfaceKeys';
import type {ОписаниеБлока} from '../src/ui/types';

const БЛОКИ: Record<string, ОписаниеБлока> = {ProductCard: {подпись: 'Товар', поля: []}, YouTube: {подпись: 'Видео', поля: []}};
const ИМЕНА = new Set(Object.keys(БЛОКИ));

const ИМПОРТ = "import sofaVideo from './img/sofa-parameters.webm';";
const ТЕГ = [
  "<video controls muted loop playsInline style={{width: '100%', height: 'auto'}} aria-label=\"Диван\">",
  '  <source src={sofaVideo} type="video/webm" />',
  '</video>',
].join('\n');
const СТАТЬЯ = `${ИМПОРТ}\n\nАбзац до.\n\n${ТЕГ}\n\n*Подпись под роликом.*\n\nАбзац после.`;
const КАРТОЧКА = "import productPreview from './product.jpg';\n\n<ProductCard\n  name=\"Кресла\"\n  image={productPreview}\n/>";

const карта = (текст: string) => картаПоверхности(Text.of(текст.split('\n')), ИМЕНА);
const границы = (текст: string) => ({from: текст.indexOf('<video'), to: текст.indexOf('</video>') + '</video>'.length});

function состояние(текст: string, курсор: number, конец = курсор): EditorState {
  const state = EditorState.create({
    doc: текст,
    selection: EditorSelection.single(курсор, конец),
    extensions: [markdown(), history(), поверхностьРедактирования(БЛОКИ)],
  });
  ensureSyntaxTree(state, state.doc.length, 1_000);
  return state;
}

/** Нажатие клавиши на настоящем состоянии: транзакция применяется как в окне, отдаётся новое состояние. */
function нажать(клавиша: string, state: EditorState): EditorState {
  const правило = клавишиПоверхности.find((b) => b.key === клавиша);
  if (!правило?.run) throw new Error(`клавиша ${клавиша} не назначена`);
  let итог = state;
  правило.run({state, dispatch: (spec: TransactionSpec) => { итог = state.update(spec).state; }} as unknown as EditorView);
  return итог;
}

describe('ролик на карте поверхности', () => {
  it('понятный ролик — блок целиком, все три строки; его импорт — скрытый вместе с пустой строкой ниже', () => {
    const {from, to} = границы(СТАТЬЯ);
    expect(карта(СТАТЬЯ).filter((о) => о.вид === 'блок')).toEqual([{вид: 'блок', from, to}]);
    expect(карта(СТАТЬЯ).filter((о) => о.вид === 'скрытый')).toEqual([{вид: 'скрытый', from: 0, to: ИМПОРТ.length + 1}]);
  });

  it('импорт прячется один раз, сколько бы роликов на него ни ссылалось', () => {
    const два = `${СТАТЬЯ}\n\n${ТЕГ}`;
    expect(карта(два).filter((о) => о.вид === 'блок')).toHaveLength(2);
    expect(карта(два).filter((о) => о.вид === 'скрытый')).toHaveLength(1);
  });

  it('тег без импорта, чужой тег и ролик внутри огороженного кода остаются обычным текстом', () => {
    expect(карта(СТАТЬЯ.replace(`${ИМПОРТ}\n\n`, '')).filter((о) => о.вид !== 'разделитель')).toEqual([]);
    expect(карта(СТАТЬЯ.replace('<source', '<track')).filter((о) => о.вид !== 'разделитель')).toEqual([]);
    expect(карта(`${ИМПОРТ}\n\n\`\`\`mdx\n${ТЕГ}\n\`\`\``).filter((о) => о.вид !== 'разделитель')).toEqual([]);
  });

  it('импорт и строки тега курсору не даются: поставленный внутрь курсор уходит к соседнему тексту', () => {
    const {from, to} = границы(СТАТЬЯ);
    const курсор = (куда: number, откуда = 0) => состояние(СТАТЬЯ, откуда).update({selection: {anchor: куда}}).newSelection.main.head;
    expect(курсор(5)).toBe(ИМПОРТ.length + 2);
    // Курсор уходит в сторону движения: сверху вниз — под ролик, снизу вверх — над него.
    expect(курсор(from + 10, from - 5)).toBe(to + 2);
    expect(курсор(to - 3, to + 3)).toBe(from - 2);
    expect(блокВ(состояние(СТАТЬЯ, 0), from + 1)).toEqual({вид: 'блок', from, to});
  });

  it('набор знака внутрь скрытого импорта не проходит, текст остаётся прежним', () => {
    // Тег ролика от набора бережёт сам курсор: внутрь блока он не встаёт (проверка выше), как и у карточки.
    const state = состояние(СТАТЬЯ, 0);
    expect(state.update({changes: {from: 3, insert: 'x'}, userEvent: 'input.type'}).state.doc.toString()).toBe(СТАТЬЯ);
  });

  it('выделение, задевшее ролик или его импорт, обычным текстом не считается — панели форматирования там нет', () => {
    const {from} = границы(СТАТЬЯ);
    const state = состояние(СТАТЬЯ, 0);
    expect(обычныйТекст(state, from - 6, from + 5)).toBe(false);
    expect(обычныйТекст(state, 0, 4)).toBe(false);
    expect(обычныйТекст(state, СТАТЬЯ.indexOf('Абзац до'), СТАТЬЯ.indexOf('Абзац до') + 5)).toBe(true);
  });
});

describe('удаление ролика целым блоком', () => {
  it('Backspace у края ролика сначала выделяет его целиком, второй — убирает вместе с импортом', () => {
    const {from, to} = границы(СТАТЬЯ);
    const выделено = нажать('Backspace', состояние(СТАТЬЯ, to + 2));
    expect([выделено.selection.main.from, выделено.selection.main.to]).toEqual([from, to]);

    const удалено = нажать('Backspace', выделено);
    expect(удалено.doc.toString()).toBe('Абзац до.\n\n*Подпись под роликом.*\n\nАбзац после.');
  });

  it('импорт, на который ссылается ещё один ролик, вместе с одним блоком не удаляется', () => {
    const два = `${СТАТЬЯ}\n\n${ТЕГ}`;
    const {from, to} = границы(два);
    const удалено = нажать('Delete', состояние(два, from, to)).doc.toString();
    expect(удалено.startsWith(`${ИМПОРТ}\n\n`)).toBe(true);
    expect(удалено.match(/<video/g)).toHaveLength(1);
  });

  it('единственная карточка товара забирает свой импорт, а импорт ролика рядом оставляет', () => {
    const текст = `${КАРТОЧКА}\n\n${СТАТЬЯ}`;
    const карточка = {from: текст.indexOf('<ProductCard'), to: текст.indexOf('/>') + 2};
    const удалено = нажать('Backspace', состояние(текст, карточка.from, карточка.to)).doc.toString();
    expect(удалено).not.toContain('productPreview');
    expect(удалено).toContain(ИМПОРТ);
    expect(удалено).toContain('<video');
  });

  it('удаление ролика — одна запись истории: отмена возвращает и тег, и импорт', () => {
    const {from, to} = границы(СТАТЬЯ);
    const удалено = нажать('Delete', состояние(СТАТЬЯ, from, to));
    expect(удалено.doc.toString()).not.toContain('sofaVideo');

    let возвращено = удалено;
    undo({state: удалено, dispatch: (spec: TransactionSpec) => { возвращено = удалено.update(spec).state; }} as unknown as EditorView);
    expect(возвращено.doc.toString()).toBe(СТАТЬЯ);
  });

  it('Enter и набор в абзаце рядом с роликом работают как в обычном тексте', () => {
    const конец = СТАТЬЯ.indexOf('Абзац до.') + 'Абзац до.'.length;
    const state = состояние(СТАТЬЯ, конец);
    expect(нажать('Enter', state).doc.toString()).toBe(СТАТЬЯ.replace('Абзац до.\n\n', 'Абзац до.\n\n\n\n'));
    expect(state.update({changes: {from: конец, insert: '!'}, userEvent: 'input.type'}).state.doc.toString()).toBe(СТАТЬЯ.replace('Абзац до.', 'Абзац до.!'));
  });
});
