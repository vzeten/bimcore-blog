// Имя каждого теста повторяет формулировку правила.
// Окна вопроса поверх программы (удаление, публикация) держат фокус у себя: `Tab` с «Отмена» не уводит
// набор в текст статьи под окном (замечание контролёра этапа 1). Правило обхода проверяется
// результатом, разметка окон — настоящей отрисовкой (SPEC 5.2.1).
import {describe, expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {следующийФокус} from '../src/ui/focusTrap';
import {DeleteAsk} from '../src/ui/zones/DeleteAsk';
import {PublishAsk} from '../src/ui/zones/PublishAsk';
import {setLabels} from '../src/ui/labels';
import type {Settings} from '../src/ui/types';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8')) as Settings;
setLabels(НАСТРОЙКИ.подписи);

describe('фокус внутри окна вопроса', () => {
  it('Tab с последней кнопки уходит на первую, Shift+Tab с первой — на последнюю', () => {
    const кнопки = ['опубликовать', 'отмена'];
    expect(следующийФокус(кнопки, 'отмена', false)).toBe('опубликовать');
    expect(следующийФокус(кнопки, 'опубликовать', true)).toBe('отмена');
    expect(следующийФокус(кнопки, 'опубликовать', false)).toBe('отмена');
  });

  it('фокус вне окна возвращается в окно, а не идёт дальше по странице', () => {
    expect(следующийФокус(['а', 'б'], 'редактор', false)).toBe('а');
    expect(следующийФокус(['а', 'б'], null, true)).toBe('б');
  });

  it('в окне нечему принять фокус — Tab гасится, а не уходит в статью', () => {
    expect(следующийФокус([], 'редактор', false)).toBeNull();
  });
});

describe('разметка окон вопроса', () => {
  const заголовокОкна = (html: string): string => {
    const id = /aria-labelledby="([^"]+)"/.exec(html)?.[1] ?? '';
    return new RegExp(`id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([^<]*)<`).exec(html)?.[1] ?? '';
  };

  it('удаление: заголовок — название по основному языку, переводы без перечня языков, ссылки — с числом в нужном падеже', () => {
    const html = renderToStaticMarkup(
      <DeleteAsk settings={НАСТРОЙКИ} название="Artículo" идёт={false} onУдалить={() => {}} onОтмена={() => {}}
        предложение={{наСайте: true, статей: 21, отпечаток: 'x', окно: 'p|0', название: 'Проба', языки: ['es', 'ru', 'en']}} />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(заголовокОкна(html)).toBe('Удалить «Проба»?');
    expect(html).toContain('Статья и все её переводы уйдут в корзину и пропадут с сайта. Ссылки уберутся в 21 статье.');
  });

  it('удаление: статьи нет на сайте — только корзина, без перечня языков', () => {
    const html = renderToStaticMarkup(
      <DeleteAsk settings={НАСТРОЙКИ} название="Проба" идёт={false} onУдалить={() => {}} onОтмена={() => {}}
        предложение={{наСайте: false, статей: 0, отпечаток: null, окно: 'p|0', языки: ['ru', 'en']}} />,
    );

    expect(html).toContain('Статья и все её переводы уйдут в корзину.');
    expect(html).not.toContain('Ссылки уберутся');
  });

  it('публикация: заголовок «Опубликовать», галочки у существующих версий, открытый отмечен, состояние на сайте у каждого языка, «Доступно всем» первым', () => {
    const путь = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
    const ES = 'i18n/es/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
    const окно = {
      неУзнали: false, выбор: 'недоступно', отмечены: [путь], находки: [{код: 'описаниеШаблонное', уровень: 'предупреждение', этап: 'поляПоиска'}],
      состояние: {path: путь, основаИзвестна: true, локали: [
        {локаль: 'ru', путь, файлЕсть: true, наСайте: true, доступность: 'поСсылке', черновикЖдёт: false, ссылок: 3, статьи: ['a', 'b', 'c']},
        {локаль: 'en', путь: 'docs/lessons/proba/index.mdx', файлЕсть: false, наСайте: false, доступность: null, черновикЖдёт: false, ссылок: 0, статьи: []},
        {локаль: 'es', путь: ES, файлЕсть: true, наСайте: true, доступность: 'всем', черновикЖдёт: false, ссылок: 2, статьи: ['a', 'd']},
      ]},
    };
    const html = renderToStaticMarkup(
      <PublishAsk settings={НАСТРОЙКИ} path={путь} окно={окно} onВыбрать={() => {}} onОтметить={() => {}} onОпубликовать={() => {}} onОтмена={() => {}} />,
    );
    const строки = html.split('<li>').slice(1).map((кусок) => кусок.split('</li>')[0]);

    expect(заголовокОкна(html)).toBe('Опубликовать');
    // Русский отмечен, испанский — галочка есть, но снята; у английского без файла галочки нет вовсе.
    expect(строки[0]).toMatch(/<input type="checkbox"[^>]*checked=""/);
    expect(строки[1]).not.toContain('checkbox');
    expect(строки[1]).toContain('сейчас: нет на сайте');
    expect(строки[2]).toMatch(/<input type="checkbox"/);
    expect(строки[2]).not.toMatch(/checked=""/);
    expect(html).toContain('сейчас: по ссылке');
    expect(html).toContain('сейчас: доступно всем');
    expect(html.indexOf('Доступно всем')).toBeLessThan(html.indexOf('По ссылке'));
    expect(html.indexOf('По ссылке')).toBeLessThan(html.indexOf('Недоступно'));
    // Считаются только отмеченные версии: испанские ссылки в число не входят, пока его не отметили.
    expect(html).toContain('Ссылки на статью уберутся в 3 статьях.');
    expect(html).toContain('Замечания проверки: 1');

    const оба = renderToStaticMarkup(
      <PublishAsk settings={НАСТРОЙКИ} path={путь} окно={{...окно, отмечены: [путь, ES]}} onВыбрать={() => {}} onОтметить={() => {}} onОпубликовать={() => {}} onОтмена={() => {}} />,
    );
    // Статья, ссылающаяся на обе версии, считается один раз.
    expect(оба).toContain('Ссылки на статью уберутся в 4 статьях.');
  });

  it('публикация: пока сайт не спрошен — названия языков из свода и «узнаю…», путь к файлу не показывается никогда', () => {
    const путь = 'i18n/ru/docusaurus-plugin-content-blog/dlya-publikacii/index.mdx';
    const окно = {неУзнали: false, выбор: 'всем', отмечены: [путь], находки: null, состояние: null};
    const html = renderToStaticMarkup(
      <PublishAsk settings={НАСТРОЙКИ} path={путь} окно={окно} версии={{ru: путь, en: 'blog/dlya-publikacii/index.mdx'}}
        onВыбрать={() => {}} onОтметить={() => {}} onОпубликовать={() => {}} onОтмена={() => {}} />,
    );

    expect(html).not.toContain('docusaurus-plugin-content-blog');
    expect(html).not.toContain('index.mdx');
    expect(html).toContain('Русский');
    expect(html).toContain('English');
    expect(html).toContain('сейчас: узнаю…');
  });

  it('публикация: без отмеченных языков кнопка «Опубликовать» заперта', () => {
    const путь = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
    const окно = {неУзнали: false, выбор: 'всем', отмечены: [], находки: null, состояние: null};
    const html = renderToStaticMarkup(
      <PublishAsk settings={НАСТРОЙКИ} path={путь} окно={окно} onВыбрать={() => {}} onОтметить={() => {}} onОпубликовать={() => {}} onОтмена={() => {}} />,
    );

    expect(html).toMatch(/<button type="button" class="ghost ghost-main" disabled="">/);
  });
});
