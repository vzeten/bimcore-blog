// Имя каждого теста повторяет формулировку правила.
// Замена файла у одного ролика: свой импорт правится на месте, общий остаётся соседу; тег сверяется
// после ответа сервера; окно сменилось — файл забран обратно и текст не тронут; отмена возвращает прежний.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {EditorSelection, EditorState, type TransactionSpec} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {history, undo} from '@codemirror/commands';
import {поверхностьРедактирования} from '../src/ui/editor/structureGuard';
import {видеоТекста} from '../src/core/videoFile.mjs';
import {заменитьВидеофайл, имяФайлаРолика, правкиЗамены} from '../src/ui/editor/videoReplace';
import type {ПравилоВидео} from '../src/ui/editor/videoInsert';
import {WEBM} from './webmFixture.mjs';

const ИМПОРТ = "import sofaVideo from './img/sofa-parameters.webm';";
const ТЕГ = (ярлык = ' aria-label="Диван"') => [
  `<video controls muted loop playsInline style={{width: '100%', height: 'auto'}}${ярлык}>`,
  '  <source src={sofaVideo} type="video/webm" />',
  '</video>',
].join('\n');
const ОДИН = `${ИМПОРТ}\n\nАбзац до.\n\n${ТЕГ()}\n\nАбзац после.`;
const ДВА = `${ОДИН}\n\n${ТЕГ('')}\n\nКонец.`;
const ПРАВИЛО: ПравилоВидео = {пределМегабайт: 10, отказВес: 'вес', отказТип: 'тип'};

const границы = (текст: string, номер = 0) => {
  const в = видеоТекста(текст)[номер] as {от: number; до: number};
  return {from: в.от, to: в.до, текст: текст.slice(в.от, в.до)};
};

function состояние(текст: string): EditorState {
  return EditorState.create({doc: текст, selection: EditorSelection.single(0), extensions: [history(), поверхностьРедактирования({})]});
}

/** Окно с настоящим состоянием редактора: правка проходит сторожа поверхности, как в окне. */
function окно(текст: string) {
  const view = {
    state: состояние(текст),
    dom: {isConnected: true},
    dispatch(tr: {state: EditorState} | TransactionSpec) {
      view.state = 'state' in tr && tr.state instanceof EditorState ? tr.state : view.state.update(tr as TransactionSpec).state;
    },
    focus: vi.fn(),
  };
  return view as unknown as EditorView & {state: EditorState};
}

function файл(bytes: Buffer = WEBM): File {
  return {
    type: 'video/webm', size: bytes.length,
    slice: () => ({arrayBuffer: async () => new Uint8Array(bytes).buffer}),
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  } as unknown as File;
}

function сервер(src = './img/img-02.webm') {
  const вызовы: {url: string; body: Record<string, unknown>}[] = [];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init: {body: string}) => {
    вызовы.push({url, body: JSON.parse(init.body)});
    const ответы: Record<string, unknown> = {'/api/asset/prepare': {жетон: 'ж.webm'}, '/api/asset/place': {src}, '/api/asset/withdraw': {}};
    return {ok: true, json: async () => ответы[url] ?? {}};
  }));
  return вызовы;
}

afterEach(() => vi.unstubAllGlobals());

describe('какие правки даёт замена', () => {
  it('импорт принадлежит только этому тегу — меняется адрес в строке импорта, тег остаётся как был', () => {
    const state = состояние(ОДИН);
    const правки = правкиЗамены(state, границы(ОДИН), './img/img-02.webm');
    const стало = state.update({changes: правки ?? []}).state.doc.toString();

    expect(стало).toBe(ОДИН.replace('./img/sofa-parameters.webm', './img/img-02.webm'));
    expect(стало).toContain(ТЕГ());
    expect(видеоТекста(стало)).toMatchObject([{переменная: 'sofaVideo', адрес: './img/img-02.webm'}]);
  });

  it('правка накрывает скрытую строку импорта целиком: поверхность редактора её пропускает', () => {
    const state = состояние(ОДИН);
    const tr = state.update({changes: правкиЗамены(state, границы(ОДИН), './img/img-02.webm') ?? []});
    expect(tr.docChanged).toBe(true);
    // Правка внутрь скрытого (только адрес) поверхность отвергла бы.
    const адрес = ОДИН.indexOf('./img/sofa-parameters.webm');
    expect(state.update({changes: {from: адрес, to: адрес + 3, insert: 'x'}}).docChanged).toBe(false);
  });

  it('два тега на один импорт — меняется только выбранный: свой импорт со свободной переменной, сосед не тронут', () => {
    const state = состояние(ДВА);
    const второй = границы(ДВА, 1);
    const стало = state.update({changes: правкиЗамены(state, второй, './img/img-02.webm') ?? []}).state.doc.toString();

    expect(стало).toContain(ИМПОРТ);
    expect(стало).toContain("import img02Video from './img/img-02.webm';");
    expect(стало).toContain(ТЕГ());
    expect(стало).toContain('<source src={img02Video} type="video/webm" />');
    expect(видеоТекста(стало).map((в) => (в as {адрес: string}).адрес)).toEqual(['./img/sofa-parameters.webm', './img/img-02.webm']);
    expect(стало.indexOf('import img02Video')).toBeLessThan(стало.indexOf('Абзац до.'));
  });

  it('на границах нет понятного ролика — правок нет', () => {
    expect(правкиЗамены(состояние(ОДИН), {from: 0, to: 5}, './img/img-02.webm')).toBeNull();
    expect(имяФайлаРолика(состояние(ОДИН), границы(ОДИН))).toBe('sofa-parameters.webm');
    expect(имяФайлаРолика(состояние(ОДИН), {from: 0, to: 5})).toBeNull();
  });
});

describe('замена в окне', () => {
  it('файл едет дорогой вставки (карантин видео, укладка), текст меняется одной транзакцией, границы тега отдаются новые', async () => {
    const вызовы = сервер();
    const view = окно(ДВА);
    const второй = границы(ДВА, 1);
    let своя = 0;

    const итог = await заменитьВидеофайл(файл(), 'editor/sandbox/x/index.mdx', view, ПРАВИЛО, второй, () => true, () => { своя += 1; });

    expect(вызовы.map((в) => в.url)).toEqual(['/api/asset/prepare', '/api/asset/place']);
    expect(вызовы[0].body).toMatchObject({род: 'видео', article: 'editor/sandbox/x/index.mdx'});
    expect(своя).toBe(1);
    expect(итог?.src).toBe('./img/img-02.webm');
    expect(итог?.имяФайла).toBe('img-02.webm');
    expect(view.state.sliceDoc(итог?.узел.from, итог?.узел.to)).toBe(итог?.узел.текст);
    expect(итог?.узел.текст).toContain('src={img02Video}');
    // Отмена возвращает прежний текст целиком: старый файл на диске не тронут, ролик снова прежний.
    undo(view);
    expect(view.state.doc.toString()).toBe(ДВА);
  });

  it('тег под панелью изменился или удалён, пока файл ехал, — уложенный файл забирается обратно, текст не тронут', async () => {
    const вызовы = сервер();
    const view = окно(ОДИН);
    const узел = {...границы(ОДИН), текст: 'уже не тот'};

    await expect(заменитьВидеофайл(файл(), 'a', view, ПРАВИЛО, узел, () => true, () => {})).rejects.toThrow();
    expect(вызовы.map((в) => в.url)).toEqual(['/api/asset/prepare', '/api/asset/place', '/api/asset/withdraw']);
    expect(вызовы[2].body).toMatchObject({src: './img/img-02.webm'});
    expect(view.state.doc.toString()).toBe(ОДИН);
  });

  it('окно сменилось, пока файл ехал, — замены нет, текст не тронут', async () => {
    const вызовы = сервер();
    const view = окно(ОДИН);

    await expect(заменитьВидеофайл(файл(), 'a', view, ПРАВИЛО, границы(ОДИН), () => false, () => {})).resolves.toBeNull();
    expect(вызовы.map((в) => в.url)).toEqual(['/api/asset/prepare']);
    expect(view.state.doc.toString()).toBe(ОДИН);
  });

  it('не WebM или тяжелее предела — отказ до отправки, ничего не едет и не меняется', async () => {
    const вызовы = сервер();
    const view = окно(ОДИН);
    const чужой = {...файл(Buffer.from('GIF89a')), size: 10};

    await expect(заменитьВидеофайл(чужой as File, 'a', view, ПРАВИЛО, границы(ОДИН), () => true, () => {})).rejects.toThrow('тип');
    expect(вызовы).toEqual([]);
    expect(view.state.doc.toString()).toBe(ОДИН);
  });
});
