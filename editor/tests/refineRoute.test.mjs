// Имя каждого теста повторяет формулировку правила.
// Ручки «Доработать»: план только читает, применение сверяет снимок дважды, пишет одну локаль и её файлы.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {ПО_УМОЛЧАНИЮ} from '../src/core/refine.mjs';
import {EN, RU, НАСТРОЙКИ, jpg, png, запрос, настройкиСоСкриптом, репозиторий, снимокДиска} from './refineHarness.mjs';

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
      ['подписиМедиа', true], ['поляШапки', true], ['медиа', true], ['переименование', false], ['обложка', false],
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
    const settings = настройкиСоСкриптом(среда.repo, РЕЗУЛЬТАТ);
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU}, settings);
    const {code, data, последняяПравка} = await запрос(среда, '/api/refine/apply', {path: RU, выбранные: ПО_УМОЛЧАНИЮ, отпечаток: план.отпечаток}, settings);

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
    expect(fs.readdirSync(path.join(среда.repo, 'editor', '.tmp'))).toEqual([]);
  });

  it('меняется только открытая локаль и её файлы: соседняя версия побайтово прежняя', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    const settings = настройкиСоСкриптом(среда.repo, РЕЗУЛЬТАТ);
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
    it(`правка (${что}) во время image-prep — отказ без постоянных записей, включая историю`, async () => {
      const среда = репозиторий(ФАЙЛЫ());
      const settings = настройкиСоСкриптом(среда.repo, РЕЗУЛЬТАТ);
      const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU}, settings);
      process.env.ПОДМЕНА_ТРОНУТЬ = path.join(среда.repo, файл);
      process.env.ПОДМЕНА_ТРОНУТЬ_БАЙТЫ = байты.toString('base64');
      try {
        const {code, data} = await запрос(среда, '/api/refine/apply', {path: RU, выбранные: ПО_УМОЛЧАНИЮ, отпечаток: план.отпечаток}, settings);
        expect(code).toBe(409);
        expect(data.error).toBe(НАСТРОЙКИ['ошибкиСервера']['доработкаСнимокУстарел']);
      } finally {
        delete process.env.ПОДМЕНА_ТРОНУТЬ;
      }
      // На диске ровно внешняя правка и ничего от операции: ни png, ни истории, ни состояния.
      expect(fs.readFileSync(path.join(среда.repo, файл))).toEqual(байты);
      expect(fs.readdirSync(path.join(среда.repo, ПАПКА, 'img'))).toEqual(['photo.jpg']);
      expect(снимков(среда)).toEqual([]);
      expect(fs.readFileSync(path.join(среда.repo, ПАПКА, '_state.json'), 'utf8')).toContain('Готова к публикации');
      expect(fs.readdirSync(path.join(среда.repo, 'editor', '.tmp'))).toEqual([]);
    });
  }

  it('правка статьи во время чтения автора из git (последний await) — отказ без записей и истории', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU});
    const git = {raw: async () => {
      fs.appendFileSync(path.join(среда.repo, RU), '\nПравка во время git.\n');
      return 'Проверка';
    }};
    const {code} = await запрос(среда, '/api/refine/apply', {path: RU, выбранные: ['подписиМедиа'], отпечаток: план.отпечаток}, НАСТРОЙКИ, git);
    expect(code).toBe(409);
    expect(fs.readFileSync(path.join(среда.repo, RU), 'utf8')).toBe(`${ТЕКСТ}\nПравка во время git.\n`);
    expect(снимков(среда)).toEqual([]);
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

  it('сбой медиаподготовки (нет Python или скрипт упал) — 500 словами из настроек и диск прежний', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    const settings = {...НАСТРОЙКИ, доработка: {...НАСТРОЙКИ['доработка'], команда: {python: 'нет-такой-программы-доработки', скрипт: 'scripts/image-prep.py', пределСекунд: 5}}};
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU}, settings);
    const до = снимокДиска(среда.repo);
    await expect(запрос(среда, '/api/refine/apply', {path: RU, выбранные: ПО_УМОЛЧАНИЮ, отпечаток: план.отпечаток}, settings))
      .rejects.toMatchObject({status: 500, message: НАСТРОЙКИ['ошибкиСервера']['медиаподготовкаНеУдалась']});
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
