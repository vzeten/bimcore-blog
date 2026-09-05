// Имя каждого теста повторяет формулировку правила.
// Вставка ролика из окна: заслон до отправки, два шага сервера, две правки одной транзакцией,
// смена окна — ничего не дописывается.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {видеоТекста} from '../src/core/videoFile.mjs';
import {вставитьВидеофайл, отказВидеофайла, правкиВидео, правилоВидео, type ПравилоВидео} from '../src/ui/editor/videoInsert';
import {WEBM} from './webmFixture.mjs';
import {ГИФ} from './gifFixture.mjs';

const МЕГАБАЙТ = 1024 * 1024;
const ПРАВИЛО: ПравилоВидео = {
  пределМегабайт: 10,
  отказВес: 'WebM больше {мегабайт} МБ',
  отказТип: 'видео статьи может быть только файлом WebM',
};

/** Файл в браузере: начало байтов, вес и тип от имени, которому программа не верит. */
function файл(bytes: Buffer, size = bytes.length, type = 'video/webm'): File {
  return {
    type,
    size,
    slice: () => ({arrayBuffer: async () => new Uint8Array(bytes).buffer}),
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  } as unknown as File;
}

/** Окно с живым текстом: правка применяется, как в редакторе, если её не велено отвергать. */
const fakeView = (текст = 'Первый абзац.\n\nВторой абзац.', курсор = 5, отвергать = false) => {
  let живой = текст;
  return {
    state: {doc: {toString: () => живой}, selection: {main: {from: курсор, to: курсор}}},
    dom: {isConnected: true},
    dispatch: vi.fn((spec: {changes: {from: number; to: number; insert: string}[]}) => {
      if (!отвергать) живой = применить(живой, spec.changes);
    }),
    focus: vi.fn(),
  };
};

/** Ответы сервера по адресам и тела запросов к нему. */
function stubПоАдресам(ответы: Record<string, unknown>) {
  const вызовы: {url: string; body: unknown}[] = [];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init: {body: string}) => {
    вызовы.push({url, body: JSON.parse(init.body)});
    return {ok: true, json: async () => ответы[url] ?? {}};
  }));
  return вызовы;
}

/** Текст после правок одной транзакции: применяются по позициям исходного текста. */
function применить(текст: string, правки: {from: number; to: number; insert: string}[]): string {
  let итог = текст;
  for (const правка of [...правки].sort((a, b) => b.from - a.from)) {
    итог = итог.slice(0, правка.from) + правка.insert + итог.slice(правка.to);
  }
  return итог;
}

afterEach(() => vi.unstubAllGlobals());

describe('заслон окна перед отправкой ролика', () => {
  it('не WebM по содержимому — отказ словами о видео, файл не читается целиком и не отправляется', async () => {
    await expect(отказВидеофайла(файл(ГИФ, 100, 'video/webm'), ПРАВИЛО)).resolves.toBe(ПРАВИЛО.отказТип);
  });

  it('WebM тяжелее предела — отказ с числом предела; ровно в предел проходит', async () => {
    await expect(отказВидеофайла(файл(WEBM, 10 * МЕГАБАЙТ + 1), ПРАВИЛО)).resolves.toBe('WebM больше 10 МБ');
    await expect(отказВидеофайла(файл(WEBM, 10 * МЕГАБАЙТ), ПРАВИЛО)).resolves.toBeNull();
  });

  it('правило берётся из настроек целиком: предел и оба текста отказа; без настроек правила нет', () => {
    const settings = {
      картинки: {пределГифМегабайт: 5, пределWebmМегабайт: 10},
      ошибкиСервера: {webmБольшеПредела: 'вес', неверныйТипВидео: 'тип'},
    };
    expect(правилоВидео(settings as never)).toEqual({пределМегабайт: 10, отказВес: 'вес', отказТип: 'тип'});
    expect(правилоВидео(null)).toBeNull();
  });
});

describe('что дописывается в статью', () => {
  it('импорт у начала текста и тег на месте курсора отдельным блоком; курсор — под блоком', () => {
    const текст = 'Первый абзац.\n\nВторой абзац.';
    const {правки, курсор} = правкиВидео(текст, {from: 13, to: 13}, './img-01.webm', 'Диван');
    const итог = применить(текст, правки);

    expect(итог).toBe([
      "import img01Video from './img-01.webm';",
      '',
      'Первый абзац.',
      '',
      "<video controls muted loop playsInline style={{width: '100%', height: 'auto'}} aria-label=\"Диван\">",
      '  <source src={img01Video} type="video/webm" />',
      '</video>',
      '',
      'Второй абзац.',
    ].join('\n'));
    expect(итог.slice(0, курсор).endsWith('</video>\n')).toBe(true);
    expect(видеоТекста(итог)).toMatchObject([{переменная: 'img01Video', адрес: './img-01.webm'}]);
  });

  it('второй ролик получает свободную переменную и встаёт импортом под первым, не внутрь его скрытого куска', () => {
    const текст = "import img01Video from './img-01.webm';\n\nАбзац.";
    const итог = применить(текст, правкиВидео(текст, {from: текст.length, to: текст.length}, './img-02.webm', '').правки);

    expect(итог.startsWith("import img01Video from './img-01.webm';\n\nimport img02Video from './img-02.webm';\n\nАбзац.")).toBe(true);
    expect(итог).toContain('<source src={img02Video} type="video/webm" />');
    expect(итог).not.toContain('aria-label');
  });

  it('импорт не уходит ниже тега: курсор в начале статьи даёт одну правку — импорт и тег подряд', () => {
    const текст = '\n\nАбзац.';
    const {правки, курсор} = правкиВидео(текст, {from: 0, to: 0}, './img-01.webm', '');
    const итог = применить(текст, правки);

    expect(правки).toHaveLength(1);
    expect(итог.indexOf('import ')).toBeLessThan(итог.indexOf('<video'));
    expect(итог.slice(0, курсор).endsWith('</video>\n')).toBe(true);
    expect(видеоТекста(итог)).toHaveLength(1);
  });
});

describe('вставка ролика: два шага сервера и смена окна', () => {
  it('файл едет дверью видео; без жетона от сервера ничего не вставляется и второй шаг не начинается', async () => {
    const вызовы = stubПоАдресам({'/api/asset/prepare': {}});
    const view = fakeView();

    await expect(вставитьВидеофайл(файл(WEBM), 'docs/a/index.mdx', view as never, ПРАВИЛО, 'Диван'))
      .rejects.toThrow('ошибкаВидео');
    expect(view.dispatch).not.toHaveBeenCalled();
    expect(вызовы.map((в) => в.url)).toEqual(['/api/asset/prepare']);
    expect(вызовы[0].body).toMatchObject({article: 'docs/a/index.mdx', род: 'видео'});
  });

  it('с адресом от сервера в текст ложатся импорт и тег одной транзакцией, выделенный текст остаётся', async () => {
    stubПоАдресам({'/api/asset/prepare': {жетон: 'ж1.webm'}, '/api/asset/place': {src: './img-01.webm'}});
    const view = fakeView();

    const готово = await вставитьВидеофайл(файл(WEBM), 'docs/a/index.mdx', view as never, ПРАВИЛО, 'Диван');

    expect(готово).toEqual({src: './img-01.webm'});
    expect(view.dispatch).toHaveBeenCalledTimes(1);
    const правка = view.dispatch.mock.calls[0][0];
    expect(правка.changes).toHaveLength(2);
    expect(правка.changes.every((п: {from: number; to: number}) => п.from === п.to)).toBe(true);
    expect(применить(view.state.doc.toString(), правка.changes)).toContain("import img01Video from './img-01.webm';");
  });

  it('человек ушёл в другую статью до укладки — ролик рядом со статьёй не появляется', async () => {
    const вызовы = stubПоАдресам({'/api/asset/prepare': {жетон: 'ж1.webm'}});
    const view = fakeView();

    const готово = await вставитьВидеофайл(файл(WEBM), 'docs/a/index.mdx', view as never, ПРАВИЛО, '', () => false);

    expect(готово).toBeNull();
    expect(view.dispatch).not.toHaveBeenCalled();
    expect(вызовы.map((в) => в.url)).toEqual(['/api/asset/prepare']);
  });

  it('человек ушёл в просмотр версии после укладки — ролик забирается обратно, текст не меняется', async () => {
    let ушёл = false;
    const вызовы = stubПоАдресам({
      '/api/asset/prepare': {жетон: 'ж1.webm'},
      '/api/asset/place': {src: './img-01.webm'},
      '/api/asset/withdraw': {withdrawn: true},
    });
    const view = fakeView();

    const готово = await вставитьВидеофайл(файл(WEBM), 'docs/a/index.mdx', view as never, ПРАВИЛО, '', () => {
      const было = ушёл;
      ушёл = true;
      return !было;
    });

    expect(готово).toBeNull();
    expect(view.dispatch).not.toHaveBeenCalled();
    expect(вызовы.map((в) => в.url)).toEqual(['/api/asset/prepare', '/api/asset/place', '/api/asset/withdraw']);
  });

  it('правку не пропустила поверхность редактора — уложенный ролик забирается обратно, ошибка словами', async () => {
    const вызовы = stubПоАдресам({
      '/api/asset/prepare': {жетон: 'ж1.webm'},
      '/api/asset/place': {src: './img-01.webm'},
      '/api/asset/withdraw': {withdrawn: true},
    });
    const view = fakeView(undefined, undefined, true);

    await expect(вставитьВидеофайл(файл(WEBM), 'docs/a/index.mdx', view as never, ПРАВИЛО, '')).rejects.toThrow('ошибкаВидео');
    expect(вызовы.map((в) => в.url)).toEqual(['/api/asset/prepare', '/api/asset/place', '/api/asset/withdraw']);
    expect(вызовы[2].body).toMatchObject({src: './img-01.webm'});
  });

  it('отказ заслона не доходит до сервера вовсе', async () => {
    const вызовы = stubПоАдресам({});
    const view = fakeView();

    await expect(вставитьВидеофайл(файл(ГИФ), 'docs/a/index.mdx', view as never, ПРАВИЛО, '')).rejects.toThrow(ПРАВИЛО.отказТип);
    expect(вызовы).toEqual([]);
    expect(view.dispatch).not.toHaveBeenCalled();
  });
});
