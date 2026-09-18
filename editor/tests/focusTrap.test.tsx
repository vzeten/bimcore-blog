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

  it('удаление: окно названо своим заголовком, ссылки — с числом в нужном падеже', () => {
    const html = renderToStaticMarkup(
      <DeleteAsk settings={НАСТРОЙКИ} название="Проба" идёт={false} onУдалить={() => {}} onОтмена={() => {}}
        предложение={{наСайте: true, статей: 21, отпечаток: 'x', окно: 'p|0'}} />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(заголовокОкна(html)).toBe('Удалить «Проба»?');
    expect(html).toContain('Ссылки уберутся в 21 статье.');
  });

  it('публикация: заголовок «Опубликовать», язык с неснимаемой галочкой и его состояние на сайте, «Доступно всем» первым', () => {
    const путь = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
    const окно = {
      неУзнали: false, выбор: 'недоступно', находки: [{код: 'описаниеШаблонное', уровень: 'предупреждение', этап: 'поляПоиска'}],
      состояние: {path: путь, основаИзвестна: true, локали: [
        {локаль: 'ru', путь, файлЕсть: true, наСайте: true, доступность: 'поСсылке', черновикЖдёт: false, ссылок: 3},
      ]},
    };
    const html = renderToStaticMarkup(
      <PublishAsk settings={НАСТРОЙКИ} path={путь} окно={окно} onВыбрать={() => {}} onОпубликовать={() => {}} onОтмена={() => {}} />,
    );

    expect(заголовокОкна(html)).toBe('Опубликовать');
    expect(html).toMatch(/<input type="checkbox"(?=[^>]*checked="")(?=[^>]*disabled="")/);
    expect(html).toContain('сейчас: по ссылке');
    expect(html.indexOf('Доступно всем')).toBeLessThan(html.indexOf('По ссылке'));
    expect(html.indexOf('По ссылке')).toBeLessThan(html.indexOf('Недоступно'));
    expect(html).toContain('Ссылки на статью уберутся в 3 статьях.');
    expect(html).toContain('Замечания проверки: 1');
  });
});
