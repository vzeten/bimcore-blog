// Имя каждого теста повторяет формулировку правила.
// Доступность языковой версии на сайте: одно поле человека с тремя ответами поверх двух полей
// Docusaurus. Пара `draft` + `unlisted` роняет сборку всего сайта, поэтому она не должна рождаться
// ни на одном переходе (решение владельца 2026-09-08). Путь здесь тот же, каким ходит окно:
// разбор шапки → показанные поля → выбор режима → сборка обратно.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  buildFrontmatter, parseFrontmatter, безПоказанных, показанныеПоля, порядокПолей,
} from '../src/ui/headFields';
import {ДОСТУПНО, НЕДОСТУПНО, ПО_ССЫЛКЕ, РЕЖИМЫ, поляРежима, режимДоступности} from '../src/core/siteAccess.mjs';
import {признакиЛокали, цветЛокали} from '../src/core/localeSigns.mjs';
import type {Settings} from '../src/ui/types';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8')) as Settings;
const КОРНИ = НАСТРОЙКИ.контент;
const DOCS = 'docs/lessons/foo/index.mdx';
const порядок = порядокПолей(НАСТРОЙКИ, DOCS);

const поля = (шапка: string) => показанныеПоля(parseFrontmatter(шапка, DOCS, КОРНИ), порядок);
const режим = (шапка: string) => режимДоступности(поля(шапка)) as string;

/** Выбор режима в окне: показанные поля правятся, наружу уходят только настоящие поля статьи. */
const выбрать = (шапка: string, значение: string) => {
  const свои = parseFrontmatter(шапка, DOCS, КОРНИ);
  const next = безПоказанных(свои, поляРежима(показанныеПоля(свои, порядок), значение) as typeof свои);
  return buildFrontmatter(шапка, next, DOCS, КОРНИ, порядок);
};

describe('доступность версии на сайте читается одним понятием', () => {
  it('обеих строк в шапке нет — страница доступна всем', () => {
    expect(режим('title: A')).toBe(ДОСТУПНО);
  });

  it('unlisted: true — страница только по ссылке', () => {
    expect(режим('title: A\nunlisted: true')).toBe(ПО_ССЫЛКЕ);
  });

  it('draft: true — страницы на сайте нет вовсе', () => {
    expect(режим('title: A\ndraft: true')).toBe(НЕДОСТУПНО);
  });

  it('явные false равнозначны отсутствию строки, как их читает и сам сайт', () => {
    expect(режим('title: A\ndraft: false')).toBe(ДОСТУПНО);
    expect(режим('title: A\nunlisted: false')).toBe(ДОСТУПНО);
    expect(режим('title: A\ndraft: false\nunlisted: false')).toBe(ДОСТУПНО);
  });

  it('шапка, написанная руками с обоими полями, читается как «недоступно», а не как «по ссылке»', () => {
    // Такую пару программа не пишет, но сборка сайта её отвергает: страницы на сайте нет вовсе,
    // и сказать «по ссылке» значило бы соврать про живой сайт.
    expect(режим('title: A\ndraft: true\nunlisted: true')).toBe(НЕДОСТУПНО);
  });
});

describe('выбор доступности пишет одно поле и убирает противоположное', () => {
  it('доступно всем → недоступно: появляется draft, строки unlisted нет', () => {
    expect(выбрать('title: A', НЕДОСТУПНО)).toBe('title: A\ndraft: true');
  });

  it('доступно всем → по ссылке: появляется unlisted, строки draft нет', () => {
    expect(выбрать('title: A', ПО_ССЫЛКЕ)).toBe('title: A\nunlisted: true');
  });

  it('по ссылке → недоступно: unlisted уходит из шапки целиком, остаётся draft', () => {
    expect(выбрать('title: A\nunlisted: true', НЕДОСТУПНО)).toBe('title: A\ndraft: true');
  });

  it('по ссылке → доступно всем: строка уходит, а не остаётся пустым значением', () => {
    expect(выбрать('title: A\nunlisted: true', ДОСТУПНО)).toBe('title: A');
  });

  it('недоступно → по ссылке: draft уходит из шапки целиком, остаётся unlisted', () => {
    expect(выбрать('title: A\ndraft: true', ПО_ССЫЛКЕ)).toBe('title: A\nunlisted: true');
  });

  it('недоступно → доступно всем: обеих строк в шапке не остаётся', () => {
    expect(выбрать('title: A\ndraft: true', ДОСТУПНО)).toBe('title: A');
  });

  it('запрещённая пара не рождается ни на одном переходе', () => {
    // Docusaurus 3.10 такую шапку отвергает и роняет сборку ВСЕГО сайта.
    const начала = ['title: A', 'title: A\nunlisted: true', 'title: A\ndraft: true', 'title: A\ndraft: true\nunlisted: true'];

    for (const шапка of начала) {
      for (const значение of РЕЖИМЫ as string[]) {
        const собрано = выбрать(шапка, значение);
        expect(/^draft:/m.test(собрано) && /^unlisted:/m.test(собрано), `${шапка} → ${значение}`).toBe(false);
      }
    }
  });

  it('выбранный режим читается тем же правилом обратно: круг замкнут', () => {
    for (const значение of РЕЖИМЫ as string[]) {
      expect(режим(выбрать('title: A\nunlisted: true', значение)), значение).toBe(значение);
    }
  });

  it('строка доступности встаёт туда же, где её показало окно: последней в шапке', () => {
    expect(выбрать('title: A\nimage: ./cover.png', НЕДОСТУПНО)).toBe('title: A\nimage: ./cover.png\ndraft: true');
  });

  it('выбор доступности не трогает соседние поля шапки', () => {
    const шапка = 'title: "Проба"\ndescription: "Про пробу"\nimage: ./cover.png';
    expect(выбрать(шапка, ПО_ССЫЛКЕ)).toBe(`${шапка}\nunlisted: true`);
  });

  it('снятая строка не оставляет одинокий возврат каретки строке, ставшей последней', () => {
    // Файл с windows-переводами строк: у последней строки шапки своего `\r` нет, у соседней есть.
    // Оставь его — вместе со следующим переводом строки выйдет `\r\r\n`, и обложка перестанет
    // читаться вовсе.
    const шапка = 'title: "Проба"\r\nimage: ./cover.png\r\ndraft: true';
    const собрано = выбрать(шапка, ДОСТУПНО);

    expect(собрано).toBe('title: "Проба"\nimage: ./cover.png');
    expect(поля(собрано).find((поле) => поле.key === 'image')?.display).toBe('./cover.png');
  });
});

describe('без выбора режима старая статья не нормализуется', () => {
  it('нетронутая шапка возвращается дословно при любом записанном виде полей', () => {
    // Иначе одно только открытие и сохранение переписывало бы чужой файл (SPEC 5.1).
    for (const шапка of [
      'title: A',
      'title: A\ndraft: false',
      'title: A\nunlisted: false',
      'title: A\nunlisted: true',
      'title: A\ndraft: true',
      'title: A\ndraft: true\nunlisted: true',
    ]) {
      const свои = parseFrontmatter(шапка, DOCS, КОРНИ);
      expect(buildFrontmatter(шапка, свои, DOCS, КОРНИ, порядок), шапка).toBe(шапка);
    }
  });

  it('правка соседнего поля запрещённую пару не чинит и не трогает', () => {
    const шапка = 'title: A\ndraft: true\nunlisted: true';
    const свои = parseFrontmatter(шапка, DOCS, КОРНИ)
      .map((поле) => (поле.key === 'title' ? {...поле, display: 'Б'} : поле));

    expect(buildFrontmatter(шапка, свои, DOCS, КОРНИ, порядок)).toBe('title: "Б"\ndraft: true\nunlisted: true');
  });
});

describe('красные буквы локали следуют только записанному draft: true', () => {
  const версия = (правки: Record<string, unknown>) => ({
    опубликован: true, отличается: false, правкаВЧерновике: false, заглушка: false,
    скрыта: false, скрытаВВетке: false, черновикСайта: false, ...правки,
  });

  it('красный цвет даёт «недоступно» и ничто другое', () => {
    expect(цветЛокали(признакиЛокали(версия({черновикСайта: true})))).toBe('черновик');
    expect(цветЛокали(признакиЛокали(версия({скрыта: true})))).toBe('обычная');
    expect(цветЛокали(признакиЛокали(версия({отличается: true, заглушка: true})))).toBe('обычная');
  });

  it('недоступная локаль не красит соседние: поля живут в файле своей версии', () => {
    expect(цветЛокали(признакиЛокали(версия({черновикСайта: true})))).toBe('черновик');
    expect(цветЛокали(признакиЛокали(версия({})))).toBe('обычная');
  });
});
