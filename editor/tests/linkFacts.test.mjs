// Имя каждого теста повторяет формулировку правила.
// Ссылки на снимаемую статью в опубликованной ветке и на диске — на настоящем git: правка строится
// по серверной версии соседа, местная уборка — по файлу человека.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {числоСтатей, ссылкиВОснове} from '../src/adapters/linkFacts.mjs';
import {убратьНаДиске} from '../src/adapters/linkSweep.mjs';
import {целиСтатьи} from '../src/adapters/retireFacts.mjs';
import {countSnapshots} from '../src/adapters/draftStore.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {EN, ES, RU, СТАТЬЯ, настройкиСервера, среда, убратьПесочницы} from './publishHarness.mjs';

afterEach(() => убратьПесочницы());

const СОСЕД = 'docs/lessons/other/index.mdx';
const СОСЕД_ES = 'i18n/es/docusaurus-plugin-content-docs/current/lessons/other/index.mdx';
const СНОСКА = 'docs/lessons/note/index.mdx';
const текст = (тело) => `---\ntitle: "Другая"\nslug: /lessons/other\n---\n\n${тело}\n`;
const ФАЙЛЫ = {
  [EN]: СТАТЬЯ, [RU]: СТАТЬЯ, [ES]: СТАТЬЯ,
  [СОСЕД]: текст('См. [пробу](/lessons/proba/).'),
  [СОСЕД_ES]: текст('Ver [prueba](/lessons/proba/).'),
};
const ПОЛНЫЙ = {[СОСЕД_ES]: текст('Ver [prueba](https://learn.bimcore.one/es/lessons/proba/).')};

async function сведения(с) {
  const settings = настройкиСервера();
  const цели = await целиСтатьи({git: с.git, repo: с.repo, settings, rel: RU, основа: с.основа});
  return {settings, цели, свои: new Set([EN, RU, ES])};
}

describe('ссылки в опубликованной ветке', () => {
  it('правка соседа строится по серверной версии: его местная работа в снятие не попадает', async () => {
    const с = await среда(ФАЙЛЫ);
    fs.appendFileSync(path.join(с.repo, СОСЕД), 'Местная строка.\n', 'utf8');
    const {settings, цели, свои} = await сведения(с);

    const итог = await ссылкиВОснове({git: с.git, repo: с.repo, settings, основа: с.основа, цели, свои});

    expect(итог.разрывы).toEqual([]);
    expect(итог.соседи).toContainEqual({путь: СОСЕД, локаль: 'en', текст: текст('См. пробу.')});
    expect(итог.соседи).toContainEqual({путь: СОСЕД_ES, локаль: 'es', текст: текст('Ver prueba.')});
    // Две языковые версии одной статьи — одна статья для человека.
    expect(итог.статей).toBe(1);
  }, ЖДАТЬ_GIT);

  it('хост сайта из конфига: ссылка полным адресом узнаётся так же, как короткая', async () => {
    const с = await среда({...ФАЙЛЫ, ...ПОЛНЫЙ, 'docusaurus.config.js': "const config = {\n  url: 'https://learn.bimcore.one',\n};\n"});
    const {settings, цели, свои} = await сведения(с);

    const итог = await ссылкиВОснове({git: с.git, repo: с.repo, settings, основа: с.основа, цели, свои});

    expect(итог.разрывы).toEqual([]);
    expect(итог.соседи.map((сосед) => сосед.путь).sort()).toEqual([СОСЕД, СОСЕД_ES]);
  }, ЖДАТЬ_GIT);

  it('хоста сайта не знаем — ссылка полным адресом непонятна: молча оставить её битой нельзя', async () => {
    const с = await среда({...ФАЙЛЫ, ...ПОЛНЫЙ});
    const {settings, цели, свои} = await сведения(с);

    const итог = await ссылкиВОснове({git: с.git, repo: с.repo, settings, основа: с.основа, цели, свои});

    expect(итог.разрывы).toEqual([{причина: 'ссылкаНеРазобрана', путь: СОСЕД_ES, локаль: 'es'}]);
  }, ЖДАТЬ_GIT);

  it('ссылка-сноска у соседа — разрыв «ссылка не разобрана», а не молчаливая битая ссылка', async () => {
    const с = await среда({...ФАЙЛЫ, [СНОСКА]: '---\ntitle: "Сноска"\n---\n\n[проба][p]\n\n[p]: /lessons/proba/\n'});
    const {settings, цели, свои} = await сведения(с);

    const итог = await ссылкиВОснове({git: с.git, repo: с.repo, settings, основа: с.основа, цели, свои});

    expect(итог.разрывы).toEqual([{причина: 'ссылкаНеРазобрана', путь: СНОСКА, локаль: 'en'}]);
  }, ЖДАТЬ_GIT);

  it('git не ответил — «не знаю», а не «ссылок нет»', async () => {
    const с = await среда(ФАЙЛЫ);
    const {settings, цели, свои} = await сведения(с);

    expect(await ссылкиВОснове({git: с.git, repo: с.repo, settings, основа: 'f'.repeat(40), цели, свои})).toBeNull();
  }, ЖДАТЬ_GIT);
});

describe('уборка ссылок на диске', () => {
  it('ссылка в местном файле становится текстом, работа человека остаётся, история получает оба текста', async () => {
    const с = await среда(ФАЙЛЫ);
    fs.appendFileSync(path.join(с.repo, СОСЕД), 'Местная строка.\n', 'utf8');
    const {settings, цели} = await сведения(с);

    const итог = убратьНаДиске({repo: с.repo, editorDir: с.editorDir, settings, цели, автор: 'Проверка', сейчас: '2026-09-18T10:00:00.000Z'});

    expect(итог).toEqual({изменены: [СОСЕД, СОСЕД_ES], невосстановленные: []});
    expect(fs.readFileSync(path.join(с.repo, СОСЕД), 'utf8')).toBe(`${текст('См. пробу.')}Местная строка.\n`);
    expect(countSnapshots(с.repo, settings, СОСЕД)).toBe(2);
    // Файлы самой статьи не трогаются: они уходят в корзину целиком.
    expect(fs.readFileSync(path.join(с.repo, RU), 'utf8')).toBe(СТАТЬЯ);
  }, ЖДАТЬ_GIT);

  it('непонятная ссылка на диске — файл не трогается и назван человеку', async () => {
    const с = await среда({...ФАЙЛЫ, [СНОСКА]: '---\ntitle: "Сноска"\n---\n\n[проба][p]\n\n[p]: /lessons/proba/\n'});
    const {settings, цели} = await сведения(с);
    const было = fs.readFileSync(path.join(с.repo, СНОСКА), 'utf8');

    const итог = убратьНаДиске({repo: с.repo, editorDir: с.editorDir, settings, цели, автор: 'Проверка'});

    expect(итог.невосстановленные).toEqual([СНОСКА]);
    expect(fs.readFileSync(path.join(с.repo, СНОСКА), 'utf8')).toBe(было);
  }, ЖДАТЬ_GIT);
});

describe('счёт статей', () => {
  it('языковые версии одной статьи — одна статья', () => {
    expect(числоСтатей([СОСЕД, СОСЕД_ES, СНОСКА], настройкиСервера()['контент'])).toBe(2);
  });
});
