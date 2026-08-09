// Имя каждого теста повторяет формулировку правила.
// Обложка статьи: загрузка файла в папку статьи, показ поля и запись пути в шапку.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {makeCoverUpload, uploadCover} from '../src/ui/editor/images';
import {buildFrontmatter, parseFrontmatter, полеПослеЗагрузки, показанныеПоля, порядокПолей} from '../src/ui/headFields';
import type {Settings} from '../src/ui/types';
import {setLabels} from '../src/ui/labels';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8')) as Settings;
const КОРНИ = НАСТРОЙКИ.контент;
const DOCS = 'docs/help/foo/index.mdx';

setLabels({
  ошибкаСети: 'сервер не отвечает',
  ошибкаЗапроса: 'запрос не удался',
  ошибкаКартинки: 'картинку вставить не удалось',
  тяжёлаяКартинка: 'картинка тяжёлая: {килобайт} КБ',
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(value: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(value));
}

const fakeFile = {type: 'image/png', arrayBuffer: async () => new Uint8Array([1]).buffer} as unknown as File;


describe('запись пути обложки в шапку', () => {
  const поля = () => [{key: 'image', raw: '', kind: 'plain', display: ''}];

  it('в поле обложки попадает путь от сервера, а не имя выбранного файла', async () => {
    // Имя файлу даёт программа: кириллица и пробелы в имени роняют сборку сайта (SPEC 2.2).
    const next = await полеПослеЗагрузки(поля, 'image', fakeFile, async () => './cover.png', false);
    expect(next?.[0].display).toBe('./cover.png');
  });

  it('сервер не подтвердил загрузку — поле обложки не меняется', async () => {
    const next = await полеПослеЗагрузки(поля, 'image', fakeFile, async () => null, false);
    expect(next).toBeNull();
  });

  it('пока идёт загрузка, второй выбранный файл ничего не запускает', async () => {
    const загрузчик = vi.fn().mockResolvedValue('./cover.jpg');
    const next = await полеПослеЗагрузки(поля, 'image', fakeFile, загрузчик, true);

    expect(next).toBeNull();
    expect(загрузчик).not.toHaveBeenCalled();
  });

  it('файл не выбран — загрузка не начинается', async () => {
    const загрузчик = vi.fn().mockResolvedValue('./cover.png');
    const next = await полеПослеЗагрузки(поля, 'image', undefined, загрузчик, false);

    expect(next).toBeNull();
    expect(загрузчик).not.toHaveBeenCalled();
  });

  it('соседние поля шапки при загрузке обложки не трогаются', async () => {
    const исходные = [
      {key: 'title', raw: '', kind: 'text', display: 'Заголовок'},
      {key: 'image', raw: '', kind: 'plain', display: ''},
    ];
    const next = await полеПослеЗагрузки(() => исходные, 'image', fakeFile, async () => './cover.png', false);

    expect(next?.[0]).toEqual(исходные[0]);
  });

  it('правка соседнего поля во время загрузки обложки не откатывается', async () => {
    // Пока шёл запрос, человек дописывал описание. Снимок полей, взятый при выборе файла, стёр бы
    // набранное — это тихая потеря текста.
    let текущие = [
      {key: 'title', raw: '', kind: 'text', display: 'Заголовок'},
      {key: 'image', raw: '', kind: 'plain', display: ''},
    ];
    const загрузчик = async (): Promise<string> => {
      текущие = [{...текущие[0], display: 'Заголовок дописан'}, текущие[1]];
      return './cover.png';
    };

    const next = await полеПослеЗагрузки(() => текущие, 'image', fakeFile, загрузчик, false);

    expect(next?.[0].display).toBe('Заголовок дописан');
    expect(next?.[1].display).toBe('./cover.png');
  });

  it('поля обложки в шапке уже нет — писать некуда, шапка не меняется', async () => {
    const без = () => [{key: 'title', raw: '', kind: 'text', display: 'Заголовок'}];
    const next = await полеПослеЗагрузки(без, 'image', fakeFile, async () => './cover.png', false);

    expect(next).toBeNull();
  });

  it('загруженная обложка попадает в шапку статьи, где поля image не было', async () => {
    // Полный путь правила: показанное поле → путь от сервера → строка в шапке на своём месте.
    const порядок = порядокПолей(НАСТРОЙКИ, DOCS);
    const шапка = 'title: "Проба"\nslug: /help/foo\nunlisted: true';
    const показанные = показанныеПоля(parseFrontmatter(шапка, DOCS, КОРНИ), порядок);

    const next = await полеПослеЗагрузки(() => показанные, 'image', fakeFile, async () => './cover.png', false);

    expect(buildFrontmatter(шапка, next!, DOCS, КОРНИ, порядок))
      .toBe('title: "Проба"\nslug: /help/foo\nimage: ./cover.png\nunlisted: true');
  });
});

describe('загрузка файла обложки', () => {
  /** Загрузка, у которой окно меняется ровно в тот момент, пока идёт запрос к серверу. */
  const загрузкаСоСменойОкна = (смена?: (окно: {статья: {current: string | null}; заход: {current: number}; просмотр: {current: boolean}}) => void) => {
    const окно = {
      статья: {current: 'docs/a/index.mdx' as string | null},
      заход: {current: 1},
      просмотр: {current: false},
    };
    return makeCoverUpload({
      runSafe: async (action) => { await action(); смена?.(окно); return true; },
      ...окно,
    });
  };

  it('обложка грузится своей ручкой, а не ручкой картинок тела статьи', async () => {
    // У обложки постоянное имя и строгая проверка типа; забытый признак у общей ручки молча дал бы
    // обложке имя картинки тела.
    const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({src: './cover.png'})});
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadCover('docs/a/index.mdx', fakeFile)).resolves.toMatchObject({src: './cover.png'});
    expect(fetchMock.mock.calls[0][0]).toBe('/api/asset/cover');
  });

  it('расширение файла серверу не отправляется: тип решает содержимое', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({src: './cover.png'})});
    vi.stubGlobal('fetch', fetchMock);

    await uploadCover('docs/a/index.mdx', fakeFile);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).not.toHaveProperty('ext');
  });

  it('сервер не вернул адрес — загрузка обложки считается провалом, а не пустым путём', async () => {
    // Пустой `image` роняет сборку всего сайта (SPEC 2.1).
    stubFetch({ok: true, json: async () => ({})});
    await expect(uploadCover('docs/a/index.mdx', fakeFile)).rejects.toThrow('картинку вставить не удалось');
  });

  it('человек ушёл в другую статью — путь обложки не попадает в чужую шапку', async () => {
    // Картинка лежит рядом со своей статьёй, путь у неё относительный: в чужой шапке он указал бы
    // в пустоту, а битая ссылка роняет сборку сайта.
    stubFetch({ok: true, json: async () => ({src: './cover.png'})});
    const загрузка = загрузкаСоСменойОкна((окно) => { окно.статья.current = 'docs/b/index.mdx'; });

    await expect(загрузка(fakeFile)).resolves.toBeNull();
  });

  it('человек ушёл в просмотр старой версии — обложка не правит шапку во время чтения', async () => {
    // Просмотр версии — только чтение: правка шапки там завела бы автосохранение.
    stubFetch({ok: true, json: async () => ({src: './cover.png'})});
    const загрузка = загрузкаСоСменойОкна((окно) => { окно.просмотр.current = true; });

    await expect(загрузка(fakeFile)).resolves.toBeNull();
  });

  it('статью закрыли и открыли заново — обложка не попадает в новый заход', async () => {
    // Тот же путь, но окно другое: текст в нём перечитан с диска, и правка прошлого захода чужая.
    stubFetch({ok: true, json: async () => ({src: './cover.png'})});
    const загрузка = загрузкаСоСменойОкна((окно) => { окно.заход.current = 2; });

    await expect(загрузка(fakeFile)).resolves.toBeNull();
  });

  it('окно не менялось — путь обложки возвращается для шапки', async () => {
    stubFetch({ok: true, json: async () => ({src: './cover.png'})});
    await expect(загрузкаСоСменойОкна()(fakeFile)).resolves.toBe('./cover.png');
  });

  it('обложка тяжелее предела — человек предупреждён так же, как при вставке в тело', async () => {
    stubFetch({ok: true, json: async () => ({src: './cover.png', тяжёлая: true, килобайт: 900})});
    const alert = vi.fn();
    vi.stubGlobal('window', {alert});

    // Предупреждение — не отказ: файл уже лежит на месте, и путь всё равно попадает в шапку.
    await expect(загрузкаСоСменойОкна()(fakeFile)).resolves.toBe('./cover.png');
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('окно сменилось — про тяжёлую картинку не говорится: на этом экране её никто не выбирал', async () => {
    stubFetch({ok: true, json: async () => ({src: './cover.png', тяжёлая: true, килобайт: 900})});
    const alert = vi.fn();
    vi.stubGlobal('window', {alert});

    const загрузка = загрузкаСоСменойОкна((окно) => { окно.просмотр.current = true; });

    await expect(загрузка(fakeFile)).resolves.toBeNull();
    expect(alert).not.toHaveBeenCalled();
  });

  it('сервер ответил ошибкой — путь не возвращается, применять нечего', async () => {
    stubFetch({ok: false, json: async () => ({error: 'нет папки статьи'})});
    const загрузка = makeCoverUpload({
      runSafe: async (action) => { try { await action(); return true; } catch { return false; } },
      статья: {current: 'docs/a/index.mdx'},
      заход: {current: 1},
      просмотр: {current: false},
    });

    await expect(загрузка(fakeFile)).resolves.toBeNull();
  });

  it('сервер ответил ошибкой, а человек уже ушёл — про чужую беду ему не говорят', async () => {
    // Ошибка ведёт себя как удачный путь: на экране, где картинку никто не выбирал, о ней молчат.
    // Иначе человек читает старую версию и вдруг видит «Не удалось поставить обложку».
    const окно = {
      статья: {current: 'docs/a/index.mdx' as string | null},
      заход: {current: 1},
      просмотр: {current: false},
    };
    vi.stubGlobal('fetch', vi.fn(async () => {
      окно.просмотр.current = true; // ушёл в просмотр версии, пока шёл запрос
      return {ok: false, json: async () => ({error: 'нет папки статьи'})};
    }));

    let показано = false;
    const загрузка = makeCoverUpload({
      runSafe: async (action) => {
        try {
          await action();
          return true;
        } catch {
          показано = true;
          return false;
        }
      },
      ...окно,
    });

    await expect(загрузка(fakeFile)).resolves.toBeNull();
    expect(показано).toBe(false);
  });

  it('статья не открыта — обложку класть некуда, загрузка не начинается', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const загрузка = makeCoverUpload({
      runSafe: async () => true,
      статья: {current: null},
      заход: {current: 0},
      просмотр: {current: false},
    });

    await expect(загрузка(fakeFile)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
