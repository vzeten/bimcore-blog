// Имя каждого теста повторяет формулировку правила.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {requestJson} from '../src/ui/api';
import {pasteImage, uploadReplacement} from '../src/ui/editor/images';
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
  const fakeView = () => ({
    state: {selection: {main: {from: 0, to: 0}}},
    dispatch: vi.fn(),
    focus: vi.fn(),
  });
  const fakeFile = {type: 'image/png', arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer} as unknown as File;

  it('без адреса от сервера картинка не вставляется как ![](undefined)', async () => {
    stubFetch({ok: true, json: async () => ({})}); // сервер не вернул src
    const view = fakeView();

    await expect(pasteImage(fakeFile, 'docs/a/index.mdx', view as never)).rejects.toThrow('картинку вставить не удалось');
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('с адресом от сервера картинка вставляется в текст', async () => {
    stubFetch({ok: true, json: async () => ({src: './img-01.png'})});
    const view = fakeView();

    await pasteImage(fakeFile, 'docs/a/index.mdx', view as never);
    expect(view.dispatch).toHaveBeenCalledTimes(1);
  });

  it('человек ушёл в другую статью — разметка не уезжает в чужой редактор', async () => {
    // Старый редактор к этому моменту уничтожен, а его текст уже не принадлежит открытой статье.
    stubFetch({ok: true, json: async () => ({src: './img-01.png'})});
    const view = fakeView();

    await pasteImage(fakeFile, 'docs/a/index.mdx', view as never, () => false);

    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('человек ушёл в просмотр версии — рабочий текст не дописывается', async () => {
    // Иначе ответ вставки меняет рабочий текст, а это заводит автосохранение и пишет черновик
    // прямо во время чтения старой версии (правило В1-13).
    stubFetch({ok: true, json: async () => ({src: './img-01.png'})});
    const view = fakeView();

    await pasteImage(fakeFile, 'docs/a/index.mdx', view as never, () => false);

    expect(view.dispatch).not.toHaveBeenCalled();
    expect(view.focus).not.toHaveBeenCalled();
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
