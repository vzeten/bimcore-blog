// Имя каждого теста повторяет формулировку правила.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {requestJson} from '../src/ui/api';
import {породаКартинки, uploadReplacement, вставитьКартинку} from '../src/ui/editor/images';
import {setLabels} from '../src/ui/labels';

setLabels({
  ошибкаСети: 'сервер не отвечает',
  ошибкаЗапроса: 'запрос не удался',
  ошибкаКартинки: 'картинку вставить не удалось',
  тяжёлаяКартинка: 'картинка тяжёлая: {килобайт} КБ',
});

afterEach(() => vi.unstubAllGlobals());

function stubFetch(value: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(value));
}

describe('запросы интерфейса к серверу', () => {
  it('успешный ответ возвращает разобранный JSON', async () => {
    stubFetch({ok: true, json: async () => ({привет: 1})});
    await expect(requestJson('/api/x')).resolves.toEqual({привет: 1});
  });

  it('ответ-ошибка берёт понятный текст из поля error сервера', async () => {
    stubFetch({ok: false, json: async () => ({error: 'нет такой статьи'})});
    await expect(requestJson('/api/x')).rejects.toThrow('нет такой статьи');
  });

  it('ответ-ошибка без текста даёт общий понятный текст', async () => {
    stubFetch({ok: false, json: async () => { throw new Error('не json'); }});
    await expect(requestJson('/api/x')).rejects.toThrow('запрос не удался');
  });

  it('недоступная сеть даёт понятную ошибку, а не молчаливый провал', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    await expect(requestJson('/api/x')).rejects.toThrow('сервер не отвечает');
  });
});

describe('вставка картинки', () => {
  const fakeView = (текст = 'Первый абзац.') => ({
    state: {
      doc: {toString: () => текст},
      selection: {main: {from: 3, to: 3}},
    },
    dom: {isConnected: true},
    dispatch: vi.fn(),
    focus: vi.fn(),
  });
  const fakeFile = {type: 'image/png', arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer} as unknown as File;

  /** Ответы сервера по адресам: у вставки два шага и отдельная отмена. */
  function stubПоАдресам(ответы: Record<string, unknown>) {
    const вызовы: string[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      вызовы.push(url);
      return {ok: true, json: async () => ответы[url] ?? {}};
    }));
    return вызовы;
  }

  it('без жетона от сервера картинка не вставляется и второй шаг не начинается', async () => {
    const вызовы = stubПоАдресам({'/api/asset/prepare': {}});
    const view = fakeView();

    await expect(вставитьКартинку(fakeFile, 'docs/a/index.mdx', view as never))
      .rejects.toThrow('картинку вставить не удалось');
    expect(view.dispatch).not.toHaveBeenCalled();
    expect(вызовы).toEqual(['/api/asset/prepare']);
  });

  it('без адреса от сервера картинка не вставляется как ![](undefined)', async () => {
    stubПоАдресам({'/api/asset/prepare': {жетон: 'ж1.png'}, '/api/asset/place': {}});
    const view = fakeView();

    await expect(вставитьКартинку(fakeFile, 'docs/a/index.mdx', view as never))
      .rejects.toThrow('картинку вставить не удалось');
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('с адресом от сервера картинка вставляется в текст отдельным блоком', async () => {
    stubПоАдресам({'/api/asset/prepare': {жетон: 'ж1.png'}, '/api/asset/place': {src: './img-01.png'}});
    const view = fakeView();

    const готово = await вставитьКартинку(fakeFile, 'docs/a/index.mdx', view as never);

    expect(view.dispatch).toHaveBeenCalledTimes(1);
    const правка = view.dispatch.mock.calls[0][0];
    expect(правка.changes.insert).toContain('![](./img-01.png)');
    // Ничего не заменяется: диапазон правки нулевой, выделенный текст остаётся на месте.
    expect(правка.changes.from).toBe(правка.changes.to);
    expect(готово).toEqual({src: './img-01.png', узелОт: expect.any(Number), узелДо: expect.any(Number)});
  });

  it('человек ушёл в другую статью до укладки — картинка рядом со статьёй не появляется', async () => {
    // Файл остаётся только в служебном карантине, и уборка унесёт его сама.
    const вызовы = stubПоАдресам({'/api/asset/prepare': {жетон: 'ж1.png'}});
    const view = fakeView();

    const готово = await вставитьКартинку(fakeFile, 'docs/a/index.mdx', view as never, () => false);

    expect(готово).toBeNull();
    expect(view.dispatch).not.toHaveBeenCalled();
    expect(вызовы).toEqual(['/api/asset/prepare']);
  });

  it('человек ушёл в просмотр версии после укладки — картинка забирается обратно', async () => {
    // Иначе она осталась бы в папке статьи бесхозной и уехала бы в публикацию, а дописывать
    // ссылку в рабочий текст во время просмотра версии нельзя (правило В1-13).
    let ушёл = false;
    const вызовы = stubПоАдресам({
      '/api/asset/prepare': {жетон: 'ж1.png'},
      '/api/asset/place': {src: './img-01.png'},
      '/api/asset/withdraw': {withdrawn: true},
    });
    const view = fakeView();

    const готово = await вставитьКартинку(fakeFile, 'docs/a/index.mdx', view as never, () => {
      // Первая проверка проходит (файл ещё едет), вторая — уже нет.
      const было = ушёл;
      ушёл = true;
      return !было;
    });

    expect(готово).toBeNull();
    expect(view.dispatch).not.toHaveBeenCalled();
    expect(вызовы).toEqual(['/api/asset/prepare', '/api/asset/place', '/api/asset/withdraw']);
  });
});

describe('замена картинки', () => {
  const fakeFile = {type: 'image/png', arrayBuffer: async () => new Uint8Array([1]).buffer} as unknown as File;

  it('провал замены бросает ошибку — вызывающему нечего перезагружать', async () => {
    stubFetch({ok: false, json: async () => ({error: 'нет такой картинки'})});
    await expect(uploadReplacement('docs/a/index.mdx', './img-01.png', fakeFile)).rejects.toThrow('нет такой картинки');
  });

  it('успешная замена возвращает ответ сервера — в нём вес для предупреждения', async () => {
    stubFetch({ok: true, json: async () => ({replaced: true, тяжёлая: false, килобайт: 12})});
    await expect(uploadReplacement('docs/a/index.mdx', './img-01.png', fakeFile))
      .resolves.toEqual({replaced: true, тяжёлая: false, килобайт: 12});
  });
});

describe('порода выбранного файла', () => {
  /** Файл в браузере: байты и тип, который браузер взял из имени. */
  const файл = (bytes: number[], type: string) => ({
    type,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  } as unknown as File);

  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    0x49, 0x44, 0x41, 0x54, 1, 2, 0x49, 0x45, 0x4e, 0x44];
  const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0xff, 0xda, 1, 2, 0xff, 0xd9];
  const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 2, 0, 2, 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff,
    0x2c, 0, 0, 0, 0, 2, 0, 2, 0, 0, 2, 2, 0x44, 1, 0, 0x3b];

  it('порода решается содержимым файла, а не именем и не типом от браузера', async () => {
    // Иначе JPEG с именем `.png` ушёл бы не по той дороге замены, а человеку показали бы не тот формат.
    await expect(породаКартинки(файл(JPEG, 'image/png'))).resolves.toBe('jpg');
    await expect(породаКартинки(файл(GIF, 'image/jpeg'))).resolves.toBe('gif');
    await expect(породаКартинки(файл(PNG, 'image/gif'))).resolves.toBe('png');
  });

  it('пустой тип от браузера породу не отменяет', async () => {
    await expect(породаКартинки(файл(GIF, ''))).resolves.toBe('gif');
  });

  it('файл не той породы не выдаётся за картинку', async () => {
    await expect(породаКартинки(файл([1, 2, 3, 4], 'image/png'))).resolves.toBeNull();
  });
});
