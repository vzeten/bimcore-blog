// Имя каждого теста повторяет формулировку правила.
// Ручки «Доработать»: план только читает, применение сверяет снимок, пишет одну локаль и её файлы.
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
  it('выбранные действия применяются одной операцией: текст, файлы, история, состояние, черновик', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    process.env.ПОДМЕНА_PNG = РЕЗУЛЬТАТ.toString('base64');
    const settings = настройкиСоСкриптом(среда.repo);
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU}, settings);
    const {code, data, последняяПравка} = await запрос(среда, '/api/refine/apply', {path: RU, выбранные: ПО_УМОЛЧАНИЮ, отпечаток: план.отпечаток}, settings);

    expect(code).toBe(200);
    expect(data.применено).toBe(true);
    expect(data.предупреждения).toEqual([]);
    const текст = fs.readFileSync(path.join(среда.repo, RU), 'utf8');
    expect(текст).toBe('---\ntitle: "Розетки"\nslug: /lessons/proba\nsidebar_label: "Розетки"\ndescription: "Описание"\n---\n\n![Розетки: изображение 1](./img/photo.png)\n');
    expect(fs.readFileSync(path.join(среда.repo, ПАПКА, 'img', 'photo.png'))).toEqual(РЕЗУЛЬТАТ);
    expect(fs.existsSync(path.join(среда.repo, ПАПКА, 'img', 'photo.jpg'))).toBe(false);
    expect(data.обработчики.find((з) => з.код === 'медиа').изменено[0].стало).toBe('img/photo.png: 1000×667, PNG, 0 КБ');
    // Версия после операции в истории, готовность вернулась в черновик, порог свежести черновика выставлен.
    const история = path.join(среда.editorDir, НАСТРОЙКИ['хранение']['папкаСнимков']);
    expect(fs.readdirSync(история)).toHaveLength(1);
    expect(fs.readFileSync(path.join(среда.repo, ПАПКА, '_state.json'), 'utf8')).toContain('"готовность": "Черновик"');
    expect(последняяПравка.has(RU)).toBe(true);
    expect(fs.readdirSync(path.join(среда.repo, 'editor', '.tmp'))).toEqual([]);
  });

  it('меняется только открытая локаль и её файлы: соседняя версия побайтово прежняя', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    process.env.ПОДМЕНА_PNG = РЕЗУЛЬТАТ.toString('base64');
    const settings = настройкиСоСкриптом(среда.repo);
    const en = path.join(среда.repo, path.dirname(EN));
    const до = JSON.stringify([fs.readFileSync(path.join(среда.repo, EN), 'utf8'), fs.readFileSync(path.join(en, 'img', 'photo.jpg')).toString('base64')]);
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU}, settings);
    await запрос(среда, '/api/refine/apply', {path: RU, выбранные: ПО_УМОЛЧАНИЮ, отпечаток: план.отпечаток}, settings);

    expect(JSON.stringify([fs.readFileSync(path.join(среда.repo, EN), 'utf8'), fs.readFileSync(path.join(en, 'img', 'photo.jpg')).toString('base64')])).toBe(до);
    expect(fs.readdirSync(path.join(en, 'img'))).toEqual(['photo.jpg']);
  });

  it('устаревший снимок (статья или файл изменились после плана) — 409 и ни одного байта на диске', async () => {
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

  it('сбой медиаподготовки (нет Python или скрипт упал) — 500 словами из настроек и диск прежний', async () => {
    const среда = репозиторий(ФАЙЛЫ());
    const settings = {...НАСТРОЙКИ, доработка: {...НАСТРОЙКИ['доработка'], команда: {python: 'нет-такой-программы-доработки', скрипт: 'scripts/image-prep.py', пределСекунд: 5}}};
    const {data: план} = await запрос(среда, '/api/refine/plan', {path: RU}, settings);
    const до = снимокДиска(среда.repo);

    await expect(запрос(среда, '/api/refine/apply', {path: RU, выбранные: ПО_УМОЛЧАНИЮ, отпечаток: план.отпечаток}, settings))
      .rejects.toMatchObject({status: 500, message: НАСТРОЙКИ['ошибкиСервера']['медиаподготовкаНеУдалась']});
    expect(снимокДиска(среда.repo)).toBe(до);
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
