// Имя каждого теста повторяет формулировку правила.
// Корзина статей, заслоны: подмена папок ссылкой, установка файла целиком, битая ссылка в перечне.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {saveDraft, saveSnapshot} from '../src/adapters/draftStore.mjs';
import {вКорзину, вернутьИзКорзины, довести, папкаКорзины, положитьЦеликом, составАрхива, списокКорзины} from '../src/adapters/trashStore.mjs';

const НАСТРОЙКИ = {хранение: {файлСостояния: '_state.json', папкаЧерновиков: '.drafts', папкаСпоров: '.drafts-споры', папкаСнимков: '.history', папкаСведения: '.сведение', снимковНаВерсию: 5, папкаКорзины: '.trash', корзинаДней: 30}};
const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
const EN = 'docs/lessons/proba/index.mdx';
const ПАПКА_RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba';
const РЕШЕНИЕ = {файлы: [RU, `${ПАПКА_RU}/_state.json`, EN], папки: [ПАПКА_RU, 'docs/lessons/proba'], пути: [RU, EN], языки: ['ru', 'en']};

const песочницы = [];
afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

function репозиторий() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-trash-'));
  песочницы.push(repo);
  const editorDir = path.join(repo, 'editor');
  for (const rel of [RU, EN, `${ПАПКА_RU}/img-01.png`, `${ПАПКА_RU}/_state.json`, 'docs/lessons/other/index.mdx']) {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), `содержимое ${rel}`, 'utf8');
  }
  saveDraft(repo, НАСТРОЙКИ, {path: RU, body: 'черновик', frontmatterRaw: '', отпечатокБазы: 'x'});
  saveSnapshot(repo, НАСТРОЙКИ, RU, 'снимок', 'Автор', '2026-09-01T10:00:00.000Z');
  return {repo, editorDir};
}

const есть = (repo, rel) => fs.existsSync(path.join(repo, rel));
const параметры = ({repo, editorDir}) => ({repo, editorDir, settings: НАСТРОЙКИ});

describe('подмена папок корзины', () => {
  it('корень корзины подменён junction на чужую папку — ни чтения, ни очистки: чужая просроченная запись цела', () => {
    const п = репозиторий();
    const чужая = path.join(п.repo, 'foreign');
    const id = '2026-01-01T00-00-00-000Z-abcdef';
    fs.mkdirSync(path.join(чужая, id), {recursive: true});
    fs.writeFileSync(path.join(чужая, id, 'manifest.json'), JSON.stringify({версия: 1, id, удалено: '2026-01-01T00:00:00.000Z', статья: {пути: []}, состояние: 'готово', файлы: []}), 'utf8');
    fs.mkdirSync(п.editorDir, {recursive: true});
    try {
      fs.symlinkSync(чужая, папкаКорзины(п.editorDir, НАСТРОЙКИ), 'junction');
    } catch {
      return;
    }
    expect(() => списокКорзины({editorDir: п.editorDir, settings: НАСТРОЙКИ, сейчас: new Date('2026-09-04T00:00:00.000Z')})).toThrow('ссылкаВПути');
    expect(fs.existsSync(path.join(чужая, id, 'manifest.json'))).toBe(true);
    expect(вернутьИзКорзины({...параметры(п), id})).toEqual({ошибка: 'ссылкаВПути'});
    expect(fs.existsSync(path.join(чужая, id, 'manifest.json'))).toBe(true);
  });

  it('папка записи подменена junction — запись пропускается и не чистится, возврат отказывает', () => {
    const п = репозиторий();
    const чужая = path.join(п.repo, 'foreign-entry');
    fs.mkdirSync(чужая, {recursive: true});
    fs.writeFileSync(path.join(чужая, 'manifest.json'), JSON.stringify({версия: 1, id: 'x', удалено: '2026-01-01T00:00:00.000Z', статья: {пути: []}, состояние: 'готово', файлы: []}), 'utf8');
    const корзина = папкаКорзины(п.editorDir, НАСТРОЙКИ);
    fs.mkdirSync(корзина, {recursive: true});
    const id = '2026-01-01T00-00-00-000Z-abcdef';
    try {
      fs.symlinkSync(чужая, path.join(корзина, id), 'junction');
    } catch {
      return;
    }
    expect(списокКорзины({editorDir: п.editorDir, settings: НАСТРОЙКИ, сейчас: new Date('2026-09-04T00:00:00.000Z')})).toEqual([]);
    expect(fs.existsSync(path.join(чужая, 'manifest.json'))).toBe(true);
    expect(вернутьИзКорзины({...параметры(п), id})).toEqual({ошибка: 'ссылкаВПути'});
  });
});

describe('запись описи и копий без хвостов', () => {
  it('опись и копии пишутся через временный файл и rename: после переноса и возврата ни одного временного хвоста, опись цела', () => {
    const п = репозиторий();
    const состав = составАрхива({...параметры(п), решение: РЕШЕНИЕ});
    const запись = вКорзину({...параметры(п), статья: {название: 'Проба', пути: РЕШЕНИЕ.пути, языки: РЕШЕНИЕ.языки, папки: РЕШЕНИЕ.папки}, состав});
    const dir = path.join(папкаКорзины(п.editorDir, НАСТРОЙКИ), запись.id);
    expect(() => JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))).not.toThrow();
    expect(fs.readdirSync(path.join(п.editorDir, '.tmp'))).toEqual([]);
    expect(вернутьИзКорзины({...параметры(п), id: запись.id})).toEqual({возвращено: РЕШЕНИЕ.пути});
    expect(fs.readdirSync(path.join(п.editorDir, '.tmp'))).toEqual([]);
    expect(fs.readFileSync(path.join(п.repo, RU), 'utf8')).toBe(`содержимое ${RU}`);
  });

  it('возврат кладёт файл на место только новым: занятое имя — конфликт до записи, половинного файла на месте не бывает', () => {
    const п = репозиторий();
    const состав = составАрхива({...параметры(п), решение: РЕШЕНИЕ});
    const запись = вКорзину({...параметры(п), статья: {название: 'Проба', пути: РЕШЕНИЕ.пути, языки: РЕШЕНИЕ.языки, папки: РЕШЕНИЕ.папки}, состав});
    // Обрыв прошлого возврата: часть файлов уже на месте байт в байт — повтор проходит, остальное дописывается.
    fs.mkdirSync(path.join(п.repo, path.dirname(RU)), {recursive: true});
    fs.writeFileSync(path.join(п.repo, RU), `содержимое ${RU}`, 'utf8');
    expect(вернутьИзКорзины({...параметры(п), id: запись.id})).toEqual({возвращено: РЕШЕНИЕ.пути});
    expect(fs.existsSync(path.join(п.repo, EN))).toBe(true);
  });
});

describe('установка файла целиком', () => {
  it('на свободное имя — файл целиком; занятое имя — отказ без перезаписи; замена — поверх; хвостов в .tmp нет', () => {
    const п = репозиторий();
    const цель = path.join(п.repo, 'docs/новый.txt');
    expect(положитьЦеликом(п.editorDir, цель, Buffer.from('раз'), false)).toBe(true);
    expect(fs.readFileSync(цель, 'utf8')).toBe('раз');
    expect(положитьЦеликом(п.editorDir, цель, Buffer.from('два'), false)).toBe(false);
    expect(fs.readFileSync(цель, 'utf8')).toBe('раз');
    expect(положитьЦеликом(п.editorDir, цель, Buffer.from('три'), true)).toBe(true);
    expect(fs.readFileSync(цель, 'utf8')).toBe('три');
    expect(fs.readdirSync(path.join(п.editorDir, '.tmp'))).toEqual([]);
  });

  it('сбой до установки оставляет только хвост во временной папке: цели нет, повтор возврата проходит', () => {
    const п = репозиторий();
    const состав = составАрхива({...параметры(п), решение: РЕШЕНИЕ});
    const запись = вКорзину({...параметры(п), статья: {название: 'Проба', пути: РЕШЕНИЕ.пути, языки: РЕШЕНИЕ.языки, папки: РЕШЕНИЕ.папки}, состав});
    // Обрыв прошлого возврата до установки: половина байт лежит во временном файле, на месте цели ничего.
    fs.mkdirSync(path.join(п.editorDir, '.tmp'), {recursive: true});
    fs.writeFileSync(path.join(п.editorDir, '.tmp', 'корзина-0-0-dead'), 'полов', 'utf8');
    expect(есть(п.repo, EN)).toBe(false);
    expect(вернутьИзКорзины({...параметры(п), id: запись.id})).toEqual({возвращено: РЕШЕНИЕ.пути});
    expect(fs.readFileSync(path.join(п.repo, EN), 'utf8')).toBe(`содержимое ${EN}`);
  });

  it('имя заняли между проверкой и установкой — отказ без перезаписи, запись остаётся для повтора', () => {
    const п = репозиторий();
    const состав = составАрхива({...параметры(п), решение: РЕШЕНИЕ});
    const запись = вКорзину({...параметры(п), статья: {название: 'Проба', пути: РЕШЕНИЕ.пути, языки: РЕШЕНИЕ.языки, папки: РЕШЕНИЕ.папки}, состав});
    // Занятость появляется после проверки: подменяем чтение архива так, чтобы файл цели возник перед установкой.
    const dir = path.join(папкаКорзины(п.editorDir, НАСТРОЙКИ), запись.id);
    const исходное = fs.readFileSync;
    let подложено = false;
    fs.readFileSync = function (файл, ...rest) {
      if (!подложено && String(файл) === path.join(dir, 'repo', EN)) {
        подложено = true;
        fs.mkdirSync(path.join(п.repo, path.dirname(EN)), {recursive: true});
        исходное.call(fs, файл);
        fs.writeFileSync(path.join(п.repo, EN), 'чужое', 'utf8');
      }
      return исходное.call(fs, файл, ...rest);
    };
    try {
      expect(вернутьИзКорзины({...параметры(п), id: запись.id})).toMatchObject({ошибка: 'возвратКонфликт', конфликты: [EN]});
    } finally {
      fs.readFileSync = исходное;
    }
    expect(fs.readFileSync(path.join(п.repo, EN), 'utf8')).toBe('чужое');
    expect(fs.existsSync(path.join(dir, 'manifest.json'))).toBe(true);
    fs.rmSync(path.join(п.repo, EN));
    expect(вернутьИзКорзины({...параметры(п), id: запись.id})).toEqual({возвращено: РЕШЕНИЕ.пути});
  });
});

describe('мелочи установки и перечня', () => {
  it('большой буфер пишется целиком, а не одним частичным вызовом', () => {
    const п = репозиторий();
    const цель = path.join(п.repo, 'docs/большой.bin');
    const байты = Buffer.alloc(3 * 1024 * 1024 + 7, 7);
    expect(положитьЦеликом(п.editorDir, цель, байты, false)).toBe(true);
    expect(fs.readFileSync(цель).equals(байты)).toBe(true);
  });

  it('битая ссылка в папке корзины пропускается без чтения цели, остальные записи читаются', () => {
    const п = репозиторий();
    const состав = составАрхива({...параметры(п), решение: РЕШЕНИЕ});
    const запись = вКорзину({...параметры(п), статья: {название: 'Проба', пути: РЕШЕНИЕ.пути, языки: РЕШЕНИЕ.языки, папки: РЕШЕНИЕ.папки}, состав});
    const корзина = папкаКорзины(п.editorDir, НАСТРОЙКИ);
    try {
      fs.symlinkSync(path.join(п.repo, 'нет-такой-папки'), path.join(корзина, '2026-01-01T00-00-00-000Z-broken'), 'junction');
    } catch {
      return;
    }
    const записи = списокКорзины({editorDir: п.editorDir, settings: НАСТРОЙКИ, сейчас: new Date('2026-09-04T00:00:00.000Z')});
    expect(записи.map((з) => з.id)).toEqual([запись.id]);
    expect(fs.existsSync(path.join(корзина, '2026-01-01T00-00-00-000Z-broken'))).toBe(false);
    expect(fs.lstatSync(path.join(корзина, '2026-01-01T00-00-00-000Z-broken')).isSymbolicLink()).toBe(true);
  });
});

