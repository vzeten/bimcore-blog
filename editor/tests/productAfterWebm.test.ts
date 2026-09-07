// Имя каждого теста повторяет формулировку правила.
// Вставка карточки товара в статью, где уже стоит ролик WebM: импорт картинки встаёт под скрытым
// импортом ролика, а не внутрь него; правку, которую не пропустила поверхность, программа не считает
// вставкой — уложенная картинка забирается обратно, статья остаётся прежней.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {EditorSelection, EditorState} from '@codemirror/state';
import {markdown} from '@codemirror/lang-markdown';
import {поверхностьРедактирования} from '../src/ui/editor/structureGuard';
import {вставитьТовар, вставкаКарточки, type Товар} from '../src/ui/editor/products';
import {видеоТекста} from '../src/core/videoFile.mjs';
import {импортСтатьи, тегиТекста} from '../src/core/jsxTag.mjs';
import type {ОписаниеБлока} from '../src/ui/types';

const БЛОКИ: Record<string, ОписаниеБлока> = {ProductCard: {подпись: 'Товар', поля: []}};

const ИМПОРТ_РОЛИКА = "import sofaVideo from './img/sofa-parameters.webm';";
const ТЕГ_РОЛИКА = [
  "<video controls muted loop playsInline style={{width: '100%', height: 'auto'}} aria-label=\"Диван\">",
  '  <source src={sofaVideo} type="video/webm" />',
  '</video>',
].join('\n');
/** Копия статьи с действующим роликом: импорт спрятан показом, тег — блок. */
const СТАТЬЯ = [ИМПОРТ_РОЛИКА, '', 'Первый абзац.', '', ТЕГ_РОЛИКА, '', 'Второй абзац.'].join('\n');
/** Курсор — в конце второго абзаца, куда человек и вставляет карточку. */
const КУРСОР = СТАТЬЯ.length;

const ТОВАР: Товар = {
  id: '577113367',
  названия: {ru: 'Кресла для Revit'},
  адрес: 'https://bimcore.one/products/armchair-revit-families',
  картинка: 'https://cdn/armchair.jpg',
  категория: {ru: 'Семейства Revit'},
  sku: 'BC-1',
};

function состояние(текст: string, курсор: number): EditorState {
  return EditorState.create({
    doc: текст,
    selection: EditorSelection.single(курсор),
    extensions: [markdown(), поверхностьРедактирования(БЛОКИ)],
  });
}

/** Окно на настоящем состоянии редактора: правки проходят через фильтр поверхности, как в программе. */
function живоеОкно(текст: string, курсор: number) {
  let state = состояние(текст, курсор);
  const view = {
    get state() {
      return state;
    },
    dom: {isConnected: true},
    dispatch: vi.fn((spec: Parameters<EditorState['update']>[0]) => {
      state = state.update(spec).state;
    }),
    focus: vi.fn(),
  };
  return view;
}

function stubПоАдресам(ответы: Record<string, unknown>) {
  const вызовы: {url: string; body: unknown}[] = [];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init: {body: string}) => {
    вызовы.push({url, body: JSON.parse(init.body)});
    return {ok: true, json: async () => ответы[url] ?? {}};
  }));
  return вызовы;
}

const ОТВЕТЫ = {
  '/api/product/image': {жетон: 'ж1.jpg'},
  '/api/asset/place': {src: './img-02.jpg'},
  '/api/asset/withdraw': {withdrawn: true},
};

function вход(view: ReturnType<typeof живоеОкно>) {
  return {
    article: 'editor/sandbox/proba/index.mdx',
    view: view as never,
    товар: ТОВАР,
    название: 'Кресла для Revit',
    описание: '',
    локаль: 'ru',
    кнопки: {buyLabel: 'Купить', shopLabel: 'В магазин'},
    актуально: () => true,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('карточка товара в статье с роликом WebM', () => {
  it('правки карточки проходят поверхность редактора: импорт картинки не попадает в скрытый импорт ролика', () => {
    const правки = вставкаКарточки({
      текст: СТАТЬЯ, at: {from: КУРСОР, to: КУРСОР}, товар: ТОВАР, название: 'Кресла для Revit',
      описание: '', локаль: 'ru', src: './img-02.jpg', кнопки: {},
    });
    expect(правки).not.toBeNull();

    const после = состояние(СТАТЬЯ, КУРСОР).update({changes: правки!.правки}).state.doc.toString();
    expect(после).not.toBe(СТАТЬЯ);
    expect(после.indexOf(ИМПОРТ_РОЛИКА)).toBeLessThan(после.indexOf('import productPreview'));
  });

  it('успех: ровно одна картинка, один импорт и одна карточка; импорт и тег ролика — байт в байт прежние', async () => {
    const вызовы = stubПоАдресам(ОТВЕТЫ);
    const view = живоеОкно(СТАТЬЯ, КУРСОР);

    await expect(вставитьТовар(вход(view))).resolves.toBe(true);

    const текст = view.state.doc.toString();
    expect(вызовы.map((в) => в.url)).toEqual(['/api/product/image', '/api/asset/place']);
    expect(текст.match(/^import productPreview from '\.\/img-02\.jpg';$/gm)).toHaveLength(1);
    expect(тегиТекста(текст).filter((т: {имя: string}) => т.имя === 'ProductCard')).toHaveLength(1);
    expect(текст).toContain(ИМПОРТ_РОЛИКА);
    expect(текст).toContain(ТЕГ_РОЛИКА);
    expect(видеоТекста(текст)).toMatchObject([{переменная: 'sofaVideo', адрес: './img/sofa-parameters.webm'}]);
    expect(импортСтатьи(текст, 'sofaVideo')).toMatchObject({от: 0});
    // Ролик стоит там же, где стоял: ниже ничего, кроме новой карточки, не сдвинулось.
    expect(текст.indexOf(ТЕГ_РОЛИКА)).toBe(СТАТЬЯ.indexOf(ТЕГ_РОЛИКА) + "import productPreview from './img-02.jpg';\n\n".length);
  });

  it('отказ после укладки: правку не пропустила поверхность — картинка забирается обратно, текст прежний, причина словами', async () => {
    const вызовы = stubПоАдресам(ОТВЕТЫ);
    const view = живоеОкно(СТАТЬЯ, КУРСОР);
    // Отказ поверхности: фильтр отбрасывает транзакцию целиком, текст остаётся прежним без слова об этом.
    view.dispatch.mockImplementationOnce(() => undefined);

    await expect(вставитьТовар(вход(view))).rejects.toThrow('карточкаНеСобралась');

    expect(view.state.doc.toString()).toBe(СТАТЬЯ);
    expect(вызовы.map((в) => в.url)).toEqual(['/api/product/image', '/api/asset/place', '/api/asset/withdraw']);
    expect(вызовы[2].body).toMatchObject({article: 'editor/sandbox/proba/index.mdx', src: './img-02.jpg'});
  });

  it('исключение при самой правке после укладки — картинка забирается обратно, ошибка доходит до человека', async () => {
    const вызовы = stubПоАдресам(ОТВЕТЫ);
    const view = живоеОкно(СТАТЬЯ, КУРСОР);
    view.dispatch.mockImplementationOnce(() => {
      throw new RangeError('Selection points outside of document');
    });

    await expect(вставитьТовар(вход(view))).rejects.toThrow('Selection points outside of document');

    expect(view.state.doc.toString()).toBe(СТАТЬЯ);
    expect(вызовы.map((в) => в.url)).toEqual(['/api/product/image', '/api/asset/place', '/api/asset/withdraw']);
    expect(вызовы[2].body).toMatchObject({src: './img-02.jpg'});
  });

  it('без ролика карточка встаёт как раньше: импорт в самом начале текста', async () => {
    stubПоАдресам(ОТВЕТЫ);
    const текст = 'Первый абзац.\n\nВторой абзац.';
    const view = живоеОкно(текст, текст.length);

    await expect(вставитьТовар(вход(view))).resolves.toBe(true);
    expect(view.state.doc.toString().startsWith("import productPreview from './img-02.jpg';\n\nПервый абзац.")).toBe(true);
  });
});
