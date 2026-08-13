// Имя каждого теста повторяет формулировку правила.
// Правило пути файла состояния (задание З0): путь считается от полного пути файла версии,
// а не от одной его папки, и живёт одним местом.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {путьФайлаСостояния} from '../src/core/articleState.mjs';
import {loadState, readStateRaw, saveState, statePath} from '../src/adapters/library.mjs';
import {версииСтатьи} from '../src/adapters/deleteArticle.mjs';

const НАСТРОЙКИ = {
  статусы: ['Черновик', 'Готова к публикации', 'Опубликована'],
  хранение: {файлСостояния: '_state.json'},
  контент: [
    {локаль: 'en', род: 'docs', папка: 'docs', наСайте: true},
    {локаль: 'ru', род: 'docs', папка: 'i18n/ru/docusaurus-plugin-content-docs/current', наСайте: true},
    {локаль: 'ru', род: 'проба', папка: 'editor/sandbox', наСайте: false},
  ],
};

const сНастройкой = (имя) => ({...НАСТРОЙКИ, хранение: {файлСостояния: имя}});

const папки = [];

afterEach(() => {
  while (папки.length > 0) fs.rmSync(папки.pop(), {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
});

/** Временный репозиторий с готовыми файлами. Git здесь не нужен: правило пути его не спрашивает. */
function репозиторий(файлы) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-state-'));
  папки.push(repo);

  for (const [rel, текст] of Object.entries(файлы)) {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), текст, 'utf8');
  }

  return repo;
}

const СОСТОЯНИЕ_РАЗДЕЛА = '{\n  "готовность": "Готова к публикации"\n}\n';

describe('путь файла состояния строится от файла версии, а не от папки', () => {
  it('статья папкой ничего не переносит: index.mdx оставляет прежний _state.json', () => {
    expect(путьФайлаСостояния('docs/lessons/walls/index.mdx', НАСТРОЙКИ)).toBe('docs/lessons/walls/_state.json');
  });

  it('статья файлом получает своё состояние: a.mdx даёт _a.state.json', () => {
    expect(путьФайлаСостояния('docs/lessons/a.mdx', НАСТРОЙКИ)).toBe('docs/lessons/_a.state.json');
  });

  it('имя с несколькими точками берётся целиком: a.b.mdx даёт _a.b.state.json', () => {
    expect(путьФайлаСостояния('docs/lessons/a.b.mdx', НАСТРОЙКИ)).toBe('docs/lessons/_a.b.state.json');
  });

  it('статья-файл и index в одной папке не делят один файл состояния', () => {
    const индекс = путьФайлаСостояния('docs/lessons/index.mdx', НАСТРОЙКИ);
    const файлом = путьФайлаСостояния('docs/lessons/a.mdx', НАСТРОЙКИ);

    expect(файлом).not.toBe(индекс);
  });

  it('одинаковые имена файлов в разных папках дают разные пути', () => {
    expect(путьФайлаСостояния('docs/lessons/a.mdx', НАСТРОЙКИ))
      .not.toBe(путьФайлаСостояния('docs/guides/a.mdx', НАСТРОЙКИ));
  });

  it('статья в корне своего рода считается тем же правилом', () => {
    expect(путьФайлаСостояния('docs/intro.mdx', НАСТРОЙКИ)).toBe('docs/_intro.state.json');
  });

  it('статья в песочнице считается тем же правилом, что и статья сайта', () => {
    expect(путьФайлаСостояния('editor/sandbox/proba.mdx', НАСТРОЙКИ)).toBe('editor/sandbox/_proba.state.json');
    expect(путьФайлаСостояния('editor/sandbox/proba/index.mdx', НАСТРОЙКИ)).toBe('editor/sandbox/proba/_state.json');
  });

  it('регистр имени не меняется: Index.mdx идёт общей веткой', () => {
    expect(путьФайлаСостояния('docs/lessons/Index.mdx', НАСТРОЙКИ)).toBe('docs/lessons/_Index.state.json');
  });

  // Разбор — в `CURRENT_TASK.md`, раздел 2: у Docusaurus «индекс папки» шире имени `index`, но по
  // широкому понятию два файла в одной папке получили бы одно состояние, то есть ровно ту подмену
  // готовности, ради которой правило и заводится. Тест держит решение, чтобы его не «починили».
  it('индексное для Docusaurus имя идёт общей веткой: readme.mdx получает своё состояние', () => {
    expect(путьФайлаСостояния('docs/lessons/walls/readme.mdx', НАСТРОЙКИ))
      .toBe('docs/lessons/walls/_readme.state.json');
  });

  it('файл по имени своей папки тоже идёт общей веткой и не сливается с индексом', () => {
    expect(путьФайлаСостояния('docs/lessons/walls/walls.mdx', НАСТРОЙКИ))
      .toBe('docs/lessons/walls/_walls.state.json');
  });
});

describe('имя файла состояния берётся из настройки, а не пишется в коде', () => {
  it('у индекса имя берётся из настройки как есть', () => {
    expect(путьФайлаСостояния('docs/a/index.mdx', сНастройкой('_готовность.json')))
      .toBe('docs/a/_готовность.json');
  });

  it('у статьи-файла хвост берётся из той же настройки', () => {
    expect(путьФайлаСостояния('docs/a.mdx', сНастройкой('_готовность.json')))
      .toBe('docs/_a.готовность.json');
  });

  // Файл с подчёркиванием Docusaurus не собирает (SPEC 2.7), поэтому ведущее `_` обязательно
  // независимо от того, есть ли оно в настройке.
  it('ведущее подчёркивание ставится даже там, где его нет в настройке', () => {
    expect(путьФайлаСостояния('docs/a.mdx', сНастройкой('state.json'))).toBe('docs/_a.state.json');
  });

  it('лишние подчёркивания настройки не удваиваются в имени статьи-файла', () => {
    expect(путьФайлаСостояния('docs/a.mdx', сНастройкой('__state.json'))).toBe('docs/_a.state.json');
  });

  it('путь статьи папкой не меняется ни при какой настройке — переносить нечего', () => {
    for (const имя of ['_state.json', '__state.json', 'state.json', '_состояние.json']) {
      expect(путьФайлаСостояния('docs/a/index.mdx', сНастройкой(имя))).toBe(`docs/a/${имя}`);
    }
  });
});

describe('чтение и запись состояния идут по своему пути, чужого файла не трогая', () => {
  const РАЗДЕЛ = 'docs/lessons/walls/index.mdx';
  const ФАЙЛОМ = 'docs/lessons/walls/a.mdx';
  const СОСТОЯНИЕ = 'docs/lessons/walls/_state.json';

  const стенд = () => репозиторий({
    [РАЗДЕЛ]: '---\ntitle: Раздел\n---\n',
    [ФАЙЛОМ]: '---\ntitle: Статья файлом\n---\n',
    [СОСТОЯНИЕ]: СОСТОЯНИЕ_РАЗДЕЛА,
  });

  it('статья-файл не читает состояние соседнего индекса', () => {
    const repo = стенд();

    expect(loadState(repo, РАЗДЕЛ, НАСТРОЙКИ)['готовность']).toBe('Готова к публикации');
    expect(readStateRaw(repo, ФАЙЛОМ, НАСТРОЙКИ)).toBe('');
  });

  it('статья без файла состояния читается без ошибки и даёт черновик', () => {
    const repo = репозиторий({[ФАЙЛОМ]: '---\ntitle: Одна\n---\n'});

    expect(loadState(repo, ФАЙЛОМ, НАСТРОЙКИ)['готовность']).toBe('Черновик');
  });

  it('запись состояния статьи-файла не меняет файл состояния раздела ни байтом', () => {
    const repo = стенд();

    saveState(repo, ФАЙЛОМ, НАСТРОЙКИ, {готовность: 'Черновик', опубликованныйКоммит: null, нити: []});

    expect(fs.readFileSync(path.join(repo, СОСТОЯНИЕ), 'utf8')).toBe(СОСТОЯНИЕ_РАЗДЕЛА);
    expect(fs.existsSync(path.join(repo, 'docs/lessons/walls/_a.state.json'))).toBe(true);
    expect(loadState(repo, РАЗДЕЛ, НАСТРОЙКИ)['готовность']).toBe('Готова к публикации');
  });

  // «Не переезжает» значит: ни один существующий файл не исчез, не переименован и не переписан.
  // Появление СВОЕГО состояния у статьи-файла переносом не является — это обычная запись.
  it('подложенный файл состояния не переезжает сам: чтение и запись его не двигают', () => {
    const repo = стенд();
    const было = fs.readdirSync(path.join(repo, 'docs/lessons/walls')).sort();

    loadState(repo, РАЗДЕЛ, НАСТРОЙКИ);
    loadState(repo, ФАЙЛОМ, НАСТРОЙКИ);
    saveState(repo, ФАЙЛОМ, НАСТРОЙКИ, {готовность: 'Черновик', опубликованныйКоммит: null, нити: []});

    const стало = fs.readdirSync(path.join(repo, 'docs/lessons/walls')).sort();

    expect(стало).toEqual([...было, '_a.state.json'].sort());
    expect(fs.readFileSync(path.join(repo, СОСТОЯНИЕ), 'utf8')).toBe(СОСТОЯНИЕ_РАЗДЕЛА);
  });

  it('путь на диске повторяет правило ядра, а не считает своё', () => {
    const repo = стенд();

    expect(statePath(repo, ФАЙЛОМ, НАСТРОЙКИ))
      .toBe(path.join(repo, путьФайлаСостояния(ФАЙЛОМ, НАСТРОЙКИ)));
  });
});

describe('сбор фактов удаления берёт путь состояния у того же правила', () => {
  // Проверяется вычисленное поле, без единого стирания: само удаление статьи-файла сегодня
  // упирается в чужие дефекты (задания З13 и З16) и в этом шаге не гоняется.
  it('у статьи-файла в фактах стоит её собственный файл состояния, а не файл раздела', () => {
    const repo = репозиторий({
      'docs/lessons/walls/index.mdx': '---\ntitle: Раздел\n---\n',
      'docs/lessons/walls/a.mdx': '---\ntitle: Статья файлом\n---\n',
      'docs/lessons/walls/_state.json': СОСТОЯНИЕ_РАЗДЕЛА,
      'docs/lessons/walls/_a.state.json': СОСТОЯНИЕ_РАЗДЕЛА,
    });

    const [версия] = версииСтатьи(repo, 'docs/lessons/walls/a.mdx', НАСТРОЙКИ);

    expect(версия.состояние).toBe('docs/lessons/walls/_a.state.json');
    expect(fs.existsSync(path.join(repo, 'docs/lessons/walls/_state.json'))).toBe(true);
  });

  it('у статьи папкой поле фактов остаётся прежним', () => {
    const repo = репозиторий({
      'docs/lessons/walls/index.mdx': '---\ntitle: Раздел\n---\n',
      'docs/lessons/walls/_state.json': СОСТОЯНИЕ_РАЗДЕЛА,
    });

    const [версия] = версииСтатьи(repo, 'docs/lessons/walls/index.mdx', НАСТРОЙКИ);

    expect(версия.состояние).toBe('docs/lessons/walls/_state.json');
  });
});
