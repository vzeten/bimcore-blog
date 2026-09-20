// Имя каждого теста повторяет формулировку правила.
// Цвета реестра, которые правка названий не имеет права задеть: буквы языковых версий и слои цвета
// в тексте статьи. Рисуется настоящий реестр, и проверяется его разметка (SPEC 5.2.1). Образец
// `registryColours.fixture.json` снят с кода ДО снятия красного цвета названий; после правки
// разметка букв, стили и цвета слоёв обязаны совпасть с ним байт в байт.
//
// Решение владельца 2026-09-18: название статьи в реестре пишется обычным цветом, даже когда оно
// взято из другой языковой версии; цвета букв локалей и текста статьи не меняются ни в чём.
import {describe, expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {Registry} from '../src/ui/zones/Registry';
import {цветЛокали} from '../src/core/localeSigns.mjs';
import type {ArticleRow, ArticleVersion, Settings} from '../src/ui/types';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8')) as Settings;

/** Версия в своде: по умолчанию опубликована и совпадает с веткой. */
const версия = (путь: string, ещё: Partial<ArticleVersion> = {}): ArticleVersion => ({
  path: путь,
  title: 'Проба',
  скрыта: false,
  готовность: null,
  опубликован: true,
  отличается: false,
  правкаВЧерновике: false,
  заглушка: false,
  черновикСайта: false,
  черновикВВетке: null,
  правил: null,
  когда: 0,
  позиция: null,
  ...ещё,
});

const статья = (slug: string, title: string, versions: Record<string, ArticleVersion>, ещё: Partial<ArticleRow> = {}): ArticleRow => ({
  key: slug,
  kind: 'blog',
  наСайте: true,
  category: '',
  section: {kind: 'blog', path: 'blog'},
  folders: [],
  title,
  titleFromOtherLocale: false,
  служебная: false,
  нетНаСайте: false,
  порядокМеню: null,
  versions,
  ...ещё,
});

const ru = (slug: string) => `i18n/ru/docusaurus-plugin-content-blog/${slug}/index.mdx`;
const en = (slug: string) => `blog/${slug}/index.mdx`;

/** Каждый исход спора за цвет букв и каждый знак возле них — по статье. */
const СТАТЬИ: ArticleRow[] = [
  статья('a-obychnaya', 'Обычная статья', {ru: версия(ru('a-obychnaya')), en: версия(en('a-obychnaya'))}),
  статья('b-only-english', 'Only English', {en: версия(en('b-only-english'))}, {titleFromOtherLocale: true}),
  статья('c-chernovik', 'Черновик на сайте', {
    ru: версия(ru('c-chernovik'), {черновикВВетке: true}),
    en: версия(en('c-chernovik')),
  }),
  статья('d-novaya', 'Новая статья', {
    ru: версия(ru('d-novaya'), {опубликован: false, отличается: null}),
    en: версия(en('d-novaya'), {опубликован: false, отличается: null}),
  }, {наСайте: false}),
  статья('e-sryv', 'Без обязательного языка', {ru: версия(ru('e-sryv'))}),
  статья('f-znaki', 'Правка и ссылка', {
    ru: версия(ru('f-znaki'), {скрыта: true, правкаВЧерновике: true}),
    en: версия(en('f-znaki')),
  }),
];

const реестр = (): string => renderToStaticMarkup(
  <Registry
    settings={НАСТРОЙКИ}
    articles={СТАТЬИ}
    onOpen={() => undefined}
    onОбновить={async () => undefined}
    создание={{раздел: undefined, идёт: false, начать: () => undefined, закрыть: () => undefined, создать: async () => undefined}}
  />,
);

/** Строки таблицы по порядку: разметка букв локалей и кнопка названия каждой статьи. */
const строки = (html: string) => [...html.matchAll(/<tr><td class="td-название">([\s\S]*?)<\/tr>/g)].map(([, строка]) => ({
  название: строка.match(/<button class="[^"]*"[^>]*>[^<]*<\/button>/)?.[0] ?? '',
  буквы: строка.match(/<span class="cell-langs">([\s\S]*?)<\/span><\/td>/)?.[1] ?? '',
}));

/** Правила оформления букв локалей, цвета слоёв в тексте статьи и цвета, на которые они ссылаются. */
function правилаБукв(): string[] {
  const правила: string[] = [];
  for (const файл of ['styles.css', 'registry.css']) {
    const текст = fs.readFileSync(path.join(EDITOR, 'src', 'ui', файл), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, выбор, тело] of текст.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const селектор = выбор.trim().replace(/\s+/g, ' ');
      if (/\.(?:lang|layer-)/.test(селектор)) правила.push(`${файл}: ${селектор} { ${тело.trim().replace(/\s+/g, ' ')} }`);
      if (селектор === ':root') {
        for (const [строка] of тело.matchAll(/--(?:знак-тревоги|accent|ink-quiet):[^;]*;/g)) правила.push(`${файл}: ${строка}`);
      }
    }
  }
  return правила;
}

/** Образец, снятый с кода до правки названий: разметка букв по статьям, правила стилей, цвета слоёв. */
const ОБРАЗЕЦ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'tests', 'registryColours.fixture.json'), 'utf8')) as {
  строки: string[];
  стили: string[];
  слои: Record<string, string>;
};

const ЛОГИЧЕСКИЕ = ['есть', 'черновик', 'неПубликовалась', 'изменена', 'заглушка', 'поСсылке'] as const;

describe('цвета реестра, которых правка названий не касается', () => {
  it('буквы языковых версий в реестре нарисованы так же, как до правки, до байта', () => {
    // Сравнение без оглядки на порядок строк: охраняется разметка букв, а порядок списка —
    // отдельное правило со своими проверками (`menuOrder.test.mjs`). Пока сверка шла по местам,
    // смена порядка по умолчанию красила этот предохранитель, хотя ни один цвет не менялся.
    expect(строки(реестр()).map((с) => с.буквы).sort()).toEqual([...ОБРАЗЕЦ.строки].sort());
  });

  it('правила оформления букв и цвета текста статьи в стилях те же, что до правки', () => {
    expect(правилаБукв()).toEqual(ОБРАЗЕЦ.стили);
  });

  it('цвета слоёв в тексте статьи в настройках те же, что до правки', () => {
    const слои = (НАСТРОЙКИ as unknown as {слои: Record<string, {цвет: string}>}).слои;
    expect(Object.fromEntries(Object.entries(слои).map(([ключ, слой]) => [ключ, слой.цвет]))).toEqual(ОБРАЗЕЦ.слои);
  });

  it('цвет букв выбирается прежним порядком спора при любом сочетании признаков', () => {
    for (let номер = 0; номер < 2 ** ЛОГИЧЕСКИЕ.length; номер += 1) {
      const признаки = Object.fromEntries(ЛОГИЧЕСКИЕ.map((имя, бит) => [имя, (номер >> бит & 1) === 1]));
      const ждём = !признаки.есть ? 'нет' : признаки.черновик ? 'черновик' : признаки.неПубликовалась ? 'новая' : 'обычная';
      expect(цветЛокали(признаки), JSON.stringify(признаки)).toBe(ждём);
    }
  });
});

describe('название статьи в реестре', () => {
  it('пишется обычным цветом, даже когда взято из другой языковой версии', () => {
    const названия = строки(реестр()).map((с) => с.название);

    expect(названия).toContain('<button class="cell-title">Only English</button>');
    for (const название of названия) expect(название).toMatch(/^<button class="cell-title">/);
  });
});
