// Имя каждого теста повторяет формулировку правила.
// Ручки «Доработать»: план только читает, применение сверяет снимок дважды, пишет одну локаль и её файлы.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {ПО_УМОЛЧАНИЮ} from '../src/core/refine.mjs';
import {
  EN, RU, НАСТРОЙКИ, gitСВеткой, jpg, png, запрос, подставнаяБиблиотека, репозиторий, сБиблиотекой, снимокДиска,
} from './refineHarness.mjs';

const ТЕКСТ = '---\ntitle: "Розетки"\nslug: /lessons/proba\ndescription: "Описание"\n---\n\n![](./img/photo.jpg)\n';
const ПАПКА = path.posix.dirname(RU);
const ФАЙЛЫ = () => ({
  [RU]: ТЕКСТ,
  [`${ПАПКА}/img/photo.jpg`]: jpg(1200, 800),
  [`${ПАПКА}/_state.json`]: '{"готовность":"Готова к публикации","опубликованныйКоммит":null,"нити":[]}\n',
  [EN]: ТЕКСТ,
  [`${path.posix.dirname(EN)}/img/photo.jpg`]: jpg(1200, 800),
});
const РЕЗУЛЬТАТ = png(1000, 667, 8);
/** Умолчание без обложки: набор проверяет саму операцию, а обложка проверяется своими наборами. */
const БЕЗ_ОБЛОЖКИ = ПО_УМОЛЧАНИЮ.filter((код) => код !== 'обложка');
/**
 * Подставная библиотека, у которой PNG легче JPEG: результатом становится `РЕЗУЛЬТАТ`. Исходник шире
 * страницы (1200 px), поэтому обработка обязательна и порог выигрыша не вмешивается.
 */
const ЛЕГЧЕ_PNG = (тронуть = null) => подставнаяБиблиотека({
  png: РЕЗУЛЬТАТ, jpg: jpg(1000, 667, 400), ширина: 1200, высота: 800, тронуть,
});
const история = (среда) => path.join(среда.editorDir, НАСТРОЙКИ['хранение']['папкаСнимков']);
const снимков = (среда) => (fs.existsSync(история(среда)) ? fs.readdirSync(история(среда)).flatMap((п) => fs.readdirSync(path.join(история(среда), п))) : []);

describe('план доработки', () => {
  it('план отдаёт перечень обработчиков из реестра с умолчаниями и не пишет ни байта', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    const до = снимокДиска(среда.repo);
    const {взято, code, data} = await запрос(среда, '/api/refine/plan', {path: RU});

    expect(взято).toBe(true);
    expect(code).toBe(200);
    expect(data.обработчики.map((з) => [з.код, з.выбран])).toEqual([
      ['подписиМедиа', true], ['поляШапки', true], ['медиа', true], ['переименование', false], ['обложка', true],
    ]);
    expect(typeof data.отпечаток).toBe('string');
    expect(снимокДиска(среда.repo)).toBe(до);
  });

  it('план с явным набором показывает зависимые обработчики по этому набору', async () => {
    const {data} = await запрос(репозиторий(ФАЙЛЫ()), '/api/refine/plan', {path: RU, выбранные: ['переименование']});
    const переименование = data.обработчики.find((з) => з.код === 'переименование');
    expect(переименование.выбран).toBe(true);
    expect(переименование.изменено).toEqual([{что: 'img/photo.jpg', было: 'img/photo.jpg', стало: 'img/img-01.jpg'}]);
  });

  it('неизвестный путь — 404, тело без пути — 400', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    expect((await запрос(среда, '/api/refine/plan', {path: 'docs/нет/index.mdx'})).code).toBe(404);
    expect((await запрос(среда, '/api/refine/plan', {})).code).toBe(400);
  });
});

describe('применение доработки', () => {
  it('выбранные действия применяются одной операцией: версия до и после в истории, состояние, порог черновика', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    сБиблиотекой(ЛЕГЧЕ_PNG());
    const settings = НАСТРОЙКИ;
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU}, settings);
    const {code, data, последняяПравка} = await запрос(среда, '/api/refine/apply', {path: RU, выбранные: БЕЗ_ОБЛОЖКИ, отпечаток: план.отпечаток}, settings);

    expect(code).toBe(200);
    expect(data).toMatchObject({применено: true, предупреждения: []});
    expect(fs.readFileSync(path.join(среда.repo, RU), 'utf8'))
      .toBe('---\ntitle: "Розетки"\nslug: /lessons/proba\nsidebar_label: "Розетки"\ndescription: "Описание"\n---\n\n![Розетки: изображение 1](./img/photo.png)\n');
    expect(fs.readFileSync(path.join(среда.repo, ПАПКА, 'img', 'photo.png'))).toEqual(РЕЗУЛЬТАТ);
    expect(fs.existsSync(path.join(среда.repo, ПАПКА, 'img', 'photo.jpg'))).toBe(false);
    expect(data.обработчики.find((з) => з.код === 'медиа').изменено[0].стало).toBe('img/photo.png: 1000×667, PNG, 0 КБ');
    // Две версии: текст до операции и текст после; готовность в черновике; порог свежести выставлен.
    const версии = снимков(среда).sort();
    expect(версии).toHaveLength(2);
    const папкаИстории = path.join(история(среда), fs.readdirSync(история(среда))[0]);
    expect(fs.readFileSync(path.join(папкаИстории, версии[0]), 'utf8')).toBe(ТЕКСТ);
    expect(fs.readFileSync(path.join(среда.repo, ПАПКА, '_state.json'), 'utf8')).toContain('"готовность": "Черновик"');
    expect(последняяПравка.has(RU)).toBe(true);

    // Оригиналы легли до записи: исходная картинка и текст статьи побайтно, манифест с отпечатком после.
    const папкаОригиналов = path.join(среда.editorDir, НАСТРОЙКИ['хранение']['папкаОригиналов']);
    const [статья] = fs.readdirSync(папкаОригиналов);
    const [операция] = fs.readdirSync(path.join(папкаОригиналов, статья));
    const место = path.join(папкаОригиналов, статья, операция);
    expect(fs.readFileSync(path.join(место, 'files', 'img', 'photo.jpg'))).toEqual(jpg(1200, 800));
    expect(fs.readFileSync(path.join(место, 'article.mdx'), 'utf8')).toBe(ТЕКСТ);
    const манифест = JSON.parse(fs.readFileSync(path.join(место, 'manifest.json'), 'utf8'));
    expect(манифест.статья).toBe(RU);
    expect(манифест.было.map((з) => з.имя)).toEqual(['img/photo.jpg']);
    expect(манифест.стало.map((з) => з.имя).sort()).toEqual(['img/photo.jpg', 'img/photo.png']);
    expect(typeof манифест.отпечатокПосле).toBe('string');
  });

  it('меняется только открытая локаль и её файлы: соседняя версия побайтово прежняя', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    сБиблиотекой(ЛЕГЧЕ_PNG());
    const settings = НАСТРОЙКИ;
    const en = path.join(среда.repo, path.dirname(EN));
    const до = JSON.stringify([fs.readFileSync(path.join(среда.repo, EN), 'utf8'), fs.readFileSync(path.join(en, 'img', 'photo.jpg')).toString('base64')]);
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU}, settings);
    await запрос(среда, '/api/refine/apply', {path: RU, выбранные: ПО_УМОЛЧАНИЮ, отпечаток: план.отпечаток}, settings);

    expect(JSON.stringify([fs.readFileSync(path.join(среда.repo, EN), 'utf8'), fs.readFileSync(path.join(en, 'img', 'photo.jpg')).toString('base64')])).toBe(до);
    expect(fs.readdirSync(path.join(en, 'img'))).toEqual(['photo.jpg']);
  });

  it('устаревший снимок (файл изменился после плана) — 409 и ни одного байта на диске', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU});
    fs.writeFileSync(path.join(среда.repo, ПАПКА, 'img', 'photo.jpg'), jpg(5, 5));
    const до = снимокДиска(среда.repo);

    const {code, data} = await запрос(среда, '/api/refine/apply', {path: RU, выбранные: ПО_УМОЛЧАНИЮ, отпечаток: план.отпечаток});
    expect(code).toBe(409);
    expect(data.error).toBe(НАСТРОЙКИ['ошибкиСервера']['доработкаСнимокУстарел']);
    expect(снимокДиска(среда.repo)).toBe(до);
    expect((await запрос(среда, '/api/refine/apply', {path: RU, выбранные: []})).code).toBe(400);
  });

  for (const [что, файл, байты] of [
    ['статья', RU, Buffer.from(`${ТЕКСТ}\nПравка во время скрипта.\n`)],
    ['исходное медиа', `${ПАПКА}/img/photo.jpg`, jpg(7, 7)],
  ]) {
    it(`правка (${что}) во время обработки картинок — отказ без постоянных записей, включая историю и оригиналы`, async () => {
      const среда = репозиторий(ФАЙЛЫ());
      const settings = НАСТРОЙКИ;
      const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU}, settings);
      сБиблиотекой(ЛЕГЧЕ_PNG(() => fs.writeFileSync(path.join(среда.repo, файл), байты)));
      const {code, data} = await запрос(среда, '/api/refine/apply', {path: RU, выбранные: ПО_УМОЛЧАНИЮ, отпечаток: план.отпечаток}, settings);
      expect(code).toBe(409);
      expect(data.error).toBe(НАСТРОЙКИ['ошибкиСервера']['доработкаСнимокУстарел']);
      // На диске ровно внешняя правка и ничего от операции: ни png, ни истории, ни состояния, ни оригиналов.
      expect(fs.readFileSync(path.join(среда.repo, файл))).toEqual(байты);
      expect(fs.readdirSync(path.join(среда.repo, ПАПКА, 'img'))).toEqual(['photo.jpg']);
      expect(снимков(среда)).toEqual([]);
      expect(fs.readFileSync(path.join(среда.repo, ПАПКА, '_state.json'), 'utf8')).toContain('Готова к публикации');
      expect(fs.existsSync(path.join(среда.editorDir, НАСТРОЙКИ['хранение']['папкаОригиналов']))).toBe(false);
    });
  }

  it('правка статьи во время чтения автора из git (последний await) — отказ без записей и истории', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU});
    // Про сайт этот git отвечает как обычный: иначе факты сайта разошлись бы с планом, ручка
    // отказала бы раньше по другой причине, и гонка на последнем `await` осталась бы непроверенной.
    // Правку в файл вносит только чтение автора — тот самый последний `await`.
    const обычный = gitСВеткой();
    const git = {
      ...обычный,
      raw: async (аргументы) => {
        // Правку вносит только чтение автора — тот самый последний `await`. Вопросы про сайт
        // (обмен с сервером и перечень дерева) идут обычным путём: иначе факты сайта разошлись бы
        // с планом, ручка отказала бы раньше по другой причине, и гонка осталась бы непроверенной.
        if (!Array.isArray(аргументы) || !аргументы.includes('config')) return обычный.raw(аргументы);
        fs.appendFileSync(path.join(среда.repo, RU), '\nПравка во время git.\n');
        return 'Проверка';
      },
    };
    const {code} = await запрос(среда, '/api/refine/apply', {path: RU, выбранные: ['подписиМедиа'], отпечаток: план.отпечаток}, НАСТРОЙКИ, git);
    expect(code).toBe(409);
    expect(fs.readFileSync(path.join(среда.repo, RU), 'utf8')).toBe(`${ТЕКСТ}\nПравка во время git.\n`);
    expect(снимков(среда)).toEqual([]);
  });

  it('картинка, лежащая на сайте, не трогается применением: байты на диске остаются прежними', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    const наСайте = `${ПАПКА}/img/photo.jpg`;
    сБиблиотекой(ЛЕГЧЕ_PNG());
    const settings = НАСТРОЙКИ;
    const git = gitСВеткой([наСайте]);
    const до = снимокДиска(среда.repo);
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU}, settings, git);

    expect(план.обработчики.find((з) => з.код === 'медиа').оставлено)
      .toEqual([{что: 'img/photo.jpg', причина: 'наСайте'}]);

    const {code, data} = await запрос(
      среда,
      '/api/refine/apply',
      {path: RU, выбранные: ['медиа'], отпечаток: план.отпечаток},
      settings,
      git,
    );

    expect(code).toBe(200);
    expect(data.применено).toBe(false);
    expect(снимокДиска(среда.repo)).toBe(до);
  });

  it('сайт стал известен между планом и применением — отказ: человек соглашался на другое', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    сБиблиотекой(ЛЕГЧЕ_PNG());
    const settings = НАСТРОЙКИ;
    // План сложился, когда опубликованной ветки не видно вовсе: он обещал не трогать ни одной картинки.
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU}, settings, gitСВеткой(null));
    const до = снимокДиска(среда.repo);

    const {code, data} = await запрос(
      среда,
      '/api/refine/apply',
      {path: RU, выбранные: ПО_УМОЛЧАНИЮ, отпечаток: план.отпечаток},
      settings,
      gitСВеткой([]),
    );

    expect(code).toBe(409);
    expect(data.error).toBe(НАСТРОЙКИ['ошибкиСервера']['доработкаСнимокУстарел']);
    expect(снимокДиска(среда.repo)).toBe(до);
  });

  it('после последней сверки до истории и файлов нет ни одного await (предохранитель по исходнику)', () => {
    const код = fs.readFileSync(new URL('../src/adapters/refineRoute.mjs', import.meta.url), 'utf8');
    const от = код.lastIndexOf('\n', код.indexOf('Последняя сверка'));
    const до = код.indexOf('записатьНабор({', от);
    expect(от).toBeGreaterThan(0);
    expect(до).toBeGreaterThan(от);
    const кодБезКомментариев = код.slice(от, до).split('\n').filter((с) => !с.trim().startsWith('//')).join('\n');
    expect(кодБезКомментариев).not.toContain('await');
    expect(код).not.toContain('фиксировать');
  });

  it('библиотеки картинок на машине нет — 500 словами из настроек, диск и история прежние', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    const settings = НАСТРОЙКИ;
    сБиблиотекой(null);
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU}, settings);
    const до = снимокДиска(среда.repo);
    await expect(запрос(среда, '/api/refine/apply', {path: RU, выбранные: ПО_УМОЛЧАНИЮ, отпечаток: план.отпечаток}, settings))
      .rejects.toMatchObject({status: 500, message: НАСТРОЙКИ['ошибкиСервера']['сжатиеНедоступно']});
    expect(снимокДиска(среда.repo)).toBe(до);
    expect(снимков(среда)).toEqual([]);
  });

  it('сбой обслуживания после записи — предупреждение, а файлы применены и остаются', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    // На месте файла состояния — папка: записать готовность нельзя, а файловая операция уже прошла.
    fs.rmSync(path.join(среда.repo, ПАПКА, '_state.json'));
    fs.mkdirSync(path.join(среда.repo, ПАПКА, '_state.json'));
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU});
    const {code, data} = await запрос(среда, '/api/refine/apply', {path: RU, выбранные: ['подписиМедиа'], отпечаток: план.отпечаток});

    expect(code).toBe(200);
    expect(data).toMatchObject({применено: true, предупреждения: ['состояние']});
    expect(fs.readFileSync(path.join(среда.repo, RU), 'utf8')).toBe(ТЕКСТ.replace('![]', '![Розетки: изображение 1]'));
  });

  it('применение одного флажка не трогает остальное: только подписи — файлы и шапка прежние', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU});
    const {code} = await запрос(среда, '/api/refine/apply', {path: RU, выбранные: ['подписиМедиа'], отпечаток: план.отпечаток});
    expect(code).toBe(200);
    expect(fs.readFileSync(path.join(среда.repo, RU), 'utf8')).toBe(ТЕКСТ.replace('![]', '![Розетки: изображение 1]'));
    expect(fs.readdirSync(path.join(среда.repo, ПАПКА, 'img'))).toEqual(['photo.jpg']);
  });

  it('выбранные действия, которым нечего делать, отвечают «не применено» и не пишут', async () => {
    const среда = репозиторий({[RU]: ТЕКСТ.replace('![]', '![Своя]'), [`${ПАПКА}/img/photo.jpg`]: jpg(1, 1)});
    const до = снимокДиска(среда.repo);
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU});
    const {data} = await запрос(среда, '/api/refine/apply', {path: RU, выбранные: ['подписиМедиа'], отпечаток: план.отпечаток});
    expect(data.применено).toBe(false);
    expect(снимокДиска(среда.repo)).toBe(до);
  });
});
