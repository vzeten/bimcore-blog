// Имя каждого теста повторяет формулировку правила.
// Корзина статей: состав до действий, перенос переживает обрыв, возврат без перезаписи, чистятся только готовые и просроченные.
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

describe('состав архива', () => {
  it('в состав входят файлы статьи, состояние, вся своя папка, черновик и снимки; соседи — нет', () => {
    const п = репозиторий();
    const состав = составАрхива({...параметры(п), решение: РЕШЕНИЕ}).map((з) => `${з.корень}/${з.из}`);
    expect(состав).toEqual(expect.arrayContaining([`repo/${RU}`, `repo/${EN}`, `repo/${ПАПКА_RU}/img-01.png`, `repo/${ПАПКА_RU}/_state.json`]));
    expect(состав.filter((з) => з.startsWith('editor/.drafts/'))).toHaveLength(1);
    expect(состав.filter((з) => з.startsWith('editor/.history/'))).toHaveLength(1);
    expect(состав.some((з) => з.includes('other'))).toBe(false);
  });

  it('путь с выходом за репозиторий или ссылкой в пути — отказ до единого действия', () => {
    const п = репозиторий();
    expect(() => составАрхива({...параметры(п), решение: {...РЕШЕНИЕ, файлы: ['../чужое.txt'], папки: []}})).toThrow('ссылкаВПути');
    let ссылка = true;
    try {
      fs.symlinkSync(path.join(п.repo, 'docs/lessons/other'), path.join(п.repo, 'docs/lessons/link'), 'junction');
    } catch {
      ссылка = false;
    }
    if (ссылка) {
      expect(() => составАрхива({...параметры(п), решение: {файлы: ['docs/lessons/link/index.mdx'], папки: [], пути: []}})).toThrow('ссылкаВПути');
    }
  });
});

describe('перенос в корзину', () => {
  it('файлы уходят в архив целиком, оригиналы и пустые папки исчезают, соседи целы', () => {
    const п = репозиторий();
    const состав = составАрхива({...параметры(п), решение: РЕШЕНИЕ});
    const запись = вКорзину({...параметры(п), статья: {название: 'Проба', пути: РЕШЕНИЕ.пути, языки: РЕШЕНИЕ.языки, папки: РЕШЕНИЕ.папки}, состав});
    const dir = path.join(папкаКорзины(п.editorDir, НАСТРОЙКИ), запись.id);
    expect(есть(п.repo, RU)).toBe(false);
    expect(есть(п.repo, ПАПКА_RU)).toBe(false);
    expect(есть(п.repo, 'docs/lessons/other/index.mdx')).toBe(true);
    expect(fs.existsSync(path.join(dir, 'repo', RU))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'repo', ПАПКА_RU, 'img-01.png'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).состояние).toBe('готово');
    expect(fs.readdirSync(path.join(п.editorDir, '.drafts'))).toEqual([]);
  });

  it('обрыв после копирования: повтор доводит перенос, ничего не теряя', () => {
    const п = репозиторий();
    const состав = составАрхива({...параметры(п), решение: РЕШЕНИЕ});
    const dir = path.join(папкаКорзины(п.editorDir, НАСТРОЙКИ), '2026-09-04T00-00-00-000Z-abc123');
    const опись = {версия: 1, id: '2026-09-04T00-00-00-000Z-abc123', удалено: '2026-09-04T00:00:00.000Z', статья: {пути: РЕШЕНИЕ.пути, папки: РЕШЕНИЕ.папки}, состояние: 'перенос', файлы: состав};
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(опись), 'utf8');
    // Половина скопирована, оригиналы целы — как после обрыва.
    fs.mkdirSync(path.join(dir, 'repo', path.dirname(EN)), {recursive: true});
    fs.copyFileSync(path.join(п.repo, EN), path.join(dir, 'repo', EN));
    довести({...параметры(п), dir, опись});
    expect(есть(п.repo, RU)).toBe(false);
    expect(fs.existsSync(path.join(dir, 'repo', RU))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).состояние).toBe('готово');
  });

  it('обрыв до копии, когда оригинала уже нет, — архив повреждён, ничего не стирается', () => {
    const п = репозиторий();
    const состав = составАрхива({...параметры(п), решение: РЕШЕНИЕ});
    fs.rmSync(path.join(п.repo, EN));
    const dir = path.join(папкаКорзины(п.editorDir, НАСТРОЙКИ), '2026-09-04T00-00-00-000Z-abc124');
    const опись = {версия: 1, id: 'x', удалено: '2026-09-04T00:00:00.000Z', статья: {пути: РЕШЕНИЕ.пути, папки: []}, состояние: 'перенос', файлы: состав};
    fs.mkdirSync(dir, {recursive: true});
    expect(() => довести({...параметры(п), dir, опись})).toThrow('архивПовреждён');
    expect(есть(п.repo, RU)).toBe(true);
  });
});

describe('возврат из корзины', () => {
  function удалённая(п) {
    const состав = составАрхива({...параметры(п), решение: РЕШЕНИЕ});
    return вКорзину({...параметры(п), статья: {название: 'Проба', пути: РЕШЕНИЕ.пути, языки: РЕШЕНИЕ.языки, папки: РЕШЕНИЕ.папки}, состав});
  }

  it('всё возвращается на место байт в байт, запись исчезает', () => {
    const п = репозиторий();
    const запись = удалённая(п);
    expect(вернутьИзКорзины({...параметры(п), id: запись.id})).toEqual({возвращено: РЕШЕНИЕ.пути});
    expect(fs.readFileSync(path.join(п.repo, RU), 'utf8')).toBe(`содержимое ${RU}`);
    expect(есть(п.repo, `${ПАПКА_RU}/img-01.png`)).toBe(true);
    expect(fs.readdirSync(path.join(п.editorDir, '.drafts'))).toHaveLength(1);
    expect(списокКорзины({editorDir: п.editorDir, settings: НАСТРОЙКИ})).toEqual([]);
  });

  it('на месте лежит другой файл — отказ целиком, ни один файл не записан и не перезаписан', () => {
    const п = репозиторий();
    const запись = удалённая(п);
    fs.mkdirSync(path.join(п.repo, path.dirname(EN)), {recursive: true});
    fs.writeFileSync(path.join(п.repo, EN), 'новая статья на том же месте', 'utf8');
    expect(вернутьИзКорзины({...параметры(п), id: запись.id})).toEqual({ошибка: 'возвратКонфликт', конфликты: [EN]});
    expect(есть(п.repo, RU)).toBe(false);
    expect(fs.readFileSync(path.join(п.repo, EN), 'utf8')).toBe('новая статья на том же месте');
  });

  it('обрыв возврата: повтор проходит, совпадающие файлы конфликтом не считаются', () => {
    const п = репозиторий();
    const запись = удалённая(п);
    fs.mkdirSync(path.join(п.repo, path.dirname(EN)), {recursive: true});
    fs.writeFileSync(path.join(п.repo, EN), `содержимое ${EN}`, 'utf8');
    expect(вернутьИзКорзины({...параметры(п), id: запись.id})).toEqual({возвращено: РЕШЕНИЕ.пути});
    expect(есть(п.repo, RU)).toBe(true);
  });

  it('чужое имя записи и подменённая опись не выходят за репозиторий', () => {
    const п = репозиторий();
    expect(вернутьИзКорзины({...параметры(п), id: '../../etc'})).toEqual({ошибка: 'нетЗаписи'});
    const dir = path.join(папкаКорзины(п.editorDir, НАСТРОЙКИ), '2026-09-04T00-00-00-000Z-bad001');
    fs.mkdirSync(path.join(dir, 'repo'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'repo', 'x.txt'), 'x', 'utf8');
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({версия: 1, id: 'x', удалено: '2026-09-04T00:00:00.000Z', статья: {}, состояние: 'готово', файлы: [{корень: 'repo', из: '../снаружи.txt', в: 'repo/x.txt'}]}), 'utf8');
    expect(вернутьИзКорзины({...параметры(п), id: '2026-09-04T00-00-00-000Z-bad001'})).toEqual({ошибка: 'ссылкаВПути'});
    expect(fs.existsSync(path.join(п.repo, '..', 'снаружи.txt'))).toBe(false);
  });
});

describe('срок корзины', () => {
  it('готовая запись старше срока чистится при обращении, свежая и незавершённая остаются', () => {
    const п = репозиторий();
    const свежая = удалить(п, new Date('2026-09-04T00:00:00.000Z'));
    const старая = удалить(п, new Date('2026-07-01T00:00:00.000Z'), true);
    const незавершённая = path.join(папкаКорзины(п.editorDir, НАСТРОЙКИ), '2026-06-01T00-00-00-000Z-aaaaaa');
    fs.mkdirSync(незавершённая, {recursive: true});
    fs.writeFileSync(path.join(незавершённая, 'manifest.json'), JSON.stringify({версия: 1, id: '2026-06-01T00-00-00-000Z-aaaaaa', удалено: '2026-06-01T00:00:00.000Z', статья: {пути: []}, состояние: 'скопировано', файлы: []}), 'utf8');
    const записи = списокКорзины({editorDir: п.editorDir, settings: НАСТРОЙКИ, сейчас: new Date('2026-09-04T12:00:00.000Z')});
    expect(записи.map((з) => з.id)).toEqual([свежая.id, '2026-06-01T00-00-00-000Z-aaaaaa']);
    expect(fs.existsSync(path.join(папкаКорзины(п.editorDir, НАСТРОЙКИ), старая.id))).toBe(false);
    expect(записи[0].срокДо).toBe('2026-10-04T00:00:00.000Z');
  });

  function удалить(п, когда, другая = false) {
    const rel = другая ? 'docs/lessons/other/index.mdx' : EN;
    const состав = составАрхива({...параметры(п), решение: {файлы: [rel], папки: [], пути: [rel], языки: ['en']}});
    return вКорзину({...параметры(п), статья: {название: 'x', пути: [rel], языки: ['en'], папки: []}, состав, сейчас: когда});
  }
});
