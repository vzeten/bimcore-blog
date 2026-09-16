// Имя каждого теста повторяет формулировку правила.
// Ручка обложки при публикации: кладёт только новый `cover.*` рядом со статьёй и отвечает адресом;
// текст статьи не пишет; сделать обложку нельзя — публикация не останавливается никогда: остаётся общая
// обложка сайта, а техническая неудача называется предупреждением.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {publishCoverRoute} from '../src/adapters/publishCoverRoute.mjs';
import {EN, GIF, НАСТРОЙКИ, jpg, png, подставнаяБиблиотека, репозиторий, сБиблиотекой, снимокДиска} from './refineHarness.mjs';

const ПАПКА = path.posix.dirname(EN);
const ШАПКА = '---\ntitle: "Проба"\nslug: /lessons/proba\ndescription: "Про пробу."\n';
const СТАТЬЯ = (тело = '![](./img-01.png)', ещё = '') => `${ШАПКА}${ещё}---\n\n${тело}\n`;
const РЕЗУЛЬТАТ = png(1000, 667, 8);
/** Исходник шире страницы: обработка обязательна, результатом становится лёгкий PNG. */
const ЛЕГЧЕ_PNG = (тронуть = null) => подставнаяБиблиотека({png: РЕЗУЛЬТАТ, jpg: jpg(1000, 667, 400), ширина: 1200, высота: 800, тронуть});

/** Один запрос к ручке. Возвращает код ответа и разобранный JSON. */
async function запрос({repo}, тело) {
  const ответ = {};
  const взято = await publishCoverRoute({
    req: {method: 'POST'},
    res: {},
    url: {pathname: '/api/publish/cover'},
    repo,
    settings: НАСТРОЙКИ,
    тело: async () => тело,
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, code, data) => Object.assign(ответ, {code, data}),
  });
  return {взято, ...ответ};
}

const файл = (среда, имя) => path.join(среда.repo, ПАПКА, имя);
const статья = (среда) => fs.readFileSync(path.join(среда.repo, EN), 'utf8');

describe('обложка при публикации', () => {
  it('поле обложки заполнено — ручка ничего не создаёт и отвечает, что писать нечего', async () => {
    const среда = репозиторий({[EN]: СТАТЬЯ('![](./img-01.png)', 'image: ./своя.png\n'), [`${ПАПКА}/img-01.png`]: png(1200, 800)});
    const до = снимокДиска(среда.repo);

    const {взято, code, data} = await запрос(среда, {path: EN});

    expect(взято).toBe(true);
    expect([code, data.нужна]).toEqual([200, null]);
    expect(снимокДиска(среда.repo)).toBe(до);
  });

  it('картинок в тексте нет — обложке взяться неоткуда, и это не препятствие публикации', async () => {
    const среда = репозиторий({[EN]: СТАТЬЯ('Текст без картинок.')});

    const {code, data} = await запрос(среда, {path: EN});

    expect([code, data.нужна]).toEqual([200, null]);
  });

  it('первая картинка тела становится новым cover того рода, что дали итоговые байты; текст статьи не трогается', async () => {
    const среда = репозиторий({[EN]: СТАТЬЯ(), [`${ПАПКА}/img-01.png`]: png(1200, 800)});
    сБиблиотекой(ЛЕГЧЕ_PNG());
    const текстДо = статья(среда);

    const {code, data} = await запрос(среда, {path: EN});

    expect(code).toBe(200);
    expect(data).toMatchObject({нужна: './cover.png', создана: true});
    expect(fs.readFileSync(файл(среда, 'cover.png'))).toEqual(РЕЗУЛЬТАТ);
    // Картинка тела осталась на месте, а поле пишет окно своим сохранением.
    expect(fs.readFileSync(файл(среда, 'img-01.png'))).toEqual(png(1200, 800));
    expect(статья(среда)).toBe(текстДо);
  });

  it('cover уже лежит рядом, а поле пусто — ответом будет его адрес, второй файл не создаётся', async () => {
    const среда = репозиторий({[EN]: СТАТЬЯ(), [`${ПАПКА}/img-01.png`]: png(1200, 800), [`${ПАПКА}/cover.jpg`]: jpg(1200, 630)});
    сБиблиотекой(null);
    const до = снимокДиска(среда.repo);

    const {code, data} = await запрос(среда, {path: EN});

    expect(code).toBe(200);
    expect(data).toMatchObject({нужна: './cover.jpg', создана: false});
    expect(снимокДиска(среда.repo)).toBe(до);
  });

  it('годный cover рядом вписывается и без картинок в тексте, негодный без картинок публикацию не держит', async () => {
    const годный = репозиторий({[EN]: СТАТЬЯ('Текст без картинок.'), [`${ПАПКА}/cover.png`]: png(1200, 630)});
    const негодный = репозиторий({[EN]: СТАТЬЯ('Текст без картинок.'), [`${ПАПКА}/cover.png`]: 'не картинка'});

    expect((await запрос(годный, {path: EN})).data).toMatchObject({нужна: './cover.png', создана: false});
    expect((await запрос(негодный, {path: EN})).data.нужна).toBe(null);
  });

  it('cover рядом, но внутри не PNG и не JPG либо расширение лжёт — остаётся общая обложка и предупреждение', async () => {
    const среда = репозиторий({[EN]: СТАТЬЯ(), [`${ПАПКА}/img-01.png`]: png(1200, 800), [`${ПАПКА}/cover.png`]: jpg(1200, 630)});

    const {code, data} = await запрос(среда, {path: EN});

    expect(code).toBe(200);
    expect(data).toMatchObject({нужна: null, предупреждение: 'обложкаНеГодна'});
    expect(НАСТРОЙКИ['подготовка']['находки']['обложкаНеГодна']).toBeTruthy();
  });

  it('в тексте только анимация — обложку сделать невозможно: общая обложка сайта, без предупреждения', async () => {
    const среда = репозиторий({[EN]: СТАТЬЯ('![](./img-01.gif)'), [`${ПАПКА}/img-01.gif`]: GIF});
    const до = снимокДиска(среда.repo);

    const {code, data} = await запрос(среда, {path: EN});

    expect(code).toBe(200);
    expect(data).toMatchObject({нужна: null, предупреждение: null});
    expect(снимокДиска(среда.repo)).toBe(до);
  });

  it('картинка не обработалась — предупреждение, общая обложка и ни одного нового файла', async () => {
    const среда = репозиторий({[EN]: СТАТЬЯ(), [`${ПАПКА}/img-01.png`]: png(1200, 800)});
    сБиблиотекой(ЛЕГЧЕ_PNG(() => {
      throw new Error('картинка повреждена');
    }));
    const до = снимокДиска(среда.repo);

    const {code, data} = await запрос(среда, {path: EN});

    expect(code).toBe(200);
    expect(data).toMatchObject({нужна: null, предупреждение: 'обложкаНеОбработалась'});
    expect(снимокДиска(среда.repo)).toBe(до);
  });

  it('библиотеки обработки нет — публикация не держится: предупреждение, файлы не меняются', async () => {
    const среда = репозиторий({[EN]: СТАТЬЯ(), [`${ПАПКА}/img-01.png`]: png(1200, 800)});
    сБиблиотекой(null);
    const до = снимокДиска(среда.repo);

    const {code, data} = await запрос(среда, {path: EN});

    expect(code).toBe(200);
    expect(data).toMatchObject({нужна: null, предупреждение: 'обложкаНеОбработалась'});
    expect(снимокДиска(среда.repo)).toBe(до);
  });

  it('cover появился во время обработки — поверх не пишется, ответом становится адрес появившегося', async () => {
    const среда = репозиторий({[EN]: СТАТЬЯ(), [`${ПАПКА}/img-01.png`]: png(1200, 800)});
    const чужой = png(1200, 630, 3);
    сБиблиотекой(ЛЕГЧЕ_PNG(() => fs.writeFileSync(файл(среда, 'cover.png'), чужой)));

    const {code, data} = await запрос(среда, {path: EN});

    expect(code).toBe(200);
    expect(data).toMatchObject({нужна: './cover.png', создана: false});
    expect(fs.readFileSync(файл(среда, 'cover.png'))).toEqual(чужой);
  });

  it('поле обложки записано в несколько строк — предупреждение до создания файла: окно его строкой не перепишет', async () => {
    const среда = репозиторий({[EN]: СТАТЬЯ('![](./img-01.png)', 'image:\n  ""\n'), [`${ПАПКА}/img-01.png`]: png(1200, 800)});
    const до = снимокДиска(среда.repo);

    const {code, data} = await запрос(среда, {path: EN});

    expect(code).toBe(200);
    expect(data).toMatchObject({нужна: null, предупреждение: 'обложкаНеВписана'});
    expect(снимокДиска(среда.repo)).toBe(до);
  });

  it('у корневой страницы папка не уезжает с ней — обложка не создаётся, чтобы поле не указало в пустоту', async () => {
    const КОРЕНЬ = 'docs/intro.mdx';
    const среда = репозиторий({[КОРЕНЬ]: '---\ntitle: "Главная"\nslug: /\n---\n\n![](./img-01.png)\n', 'docs/img-01.png': png(1200, 800)});
    сБиблиотекой(ЛЕГЧЕ_PNG());
    const до = снимокДиска(среда.repo);

    const {code, data} = await запрос(среда, {path: КОРЕНЬ});

    expect([code, data.нужна]).toEqual([200, null]);
    expect(снимокДиска(среда.repo)).toBe(до);
  });

  it('путь не статьи сайта — 400 до всякого чтения файлов', async () => {
    const среда = репозиторий({[EN]: СТАТЬЯ(), 'editor/заметка.mdx': СТАТЬЯ()});

    expect((await запрос(среда, {path: 'editor/заметка.mdx'})).code).toBe(400);
    expect((await запрос(среда, {})).code).toBe(400);
  });
});
