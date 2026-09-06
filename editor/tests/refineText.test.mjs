// Имя каждого теста повторяет формулировку правила.
// Медиа в тексте и обработчик технических подписей.
import {describe, expect, it} from 'vitest';

import {заменитьАдреса, именаМедиа, локальноеИмя, подписиМедиа, ссылкиМедиа} from '../src/core/refineText.mjs';
import {НАСТРОЙКИ, копия} from './refineHarness.mjs';

const ШАПКА = '---\ntitle: "Розетки"\nimage: ./cover.jpg\n---\n\n';
const анализ = (текст) => подписиМедиа.анализ(копия(текст), НАСТРОЙКИ);
const применить = (текст) => подписиМедиа.применить(копия(текст), анализ(текст)).копия.текст;

describe('медиа в тексте', () => {
  it('ссылки тела — markdown-картинки и импорты по порядку, с границами адреса и подписи', () => {
    const текст = "import p from './img/p.png';\n\n![Подпись](./a.jpg)\n\n![](./b.gif \"титул\")\n";
    const ссылки = ссылкиМедиа(текст);

    expect(ссылки.map((с) => [с.вид, с.адрес])).toEqual([['импорт', './img/p.png'], ['картинка', './a.jpg'], ['картинка', './b.gif']]);
    expect(текст.slice(ссылки[1].altОт, ссылки[1].altДо)).toBe('Подпись');
    expect(текст.slice(ссылки[2].адресОт, ссылки[2].адресДо)).toBe('./b.gif');
  });

  it('локальное имя даёт только файлы рядом со статьёй: общая папка сайта, сеть и выход наружу — нет', () => {
    expect(локальноеИмя('./img/a.jpg')).toBe('img/a.jpg');
    expect(локальноеИмя('a.jpg')).toBe('a.jpg');
    for (const чужой of ['/img/a.jpg', '@site/static/a.jpg', 'https://x/a.jpg', '../a.jpg', 'img\\a.jpg', '']) {
      expect(локальноеИмя(чужой)).toBeNull();
    }
  });

  it('имена медиа версии включают обложку шапки и не повторяются', () => {
    expect(именаМедиа(`${ШАПКА}![](./a.jpg)\n![](./a.jpg)\n`)).toEqual(['a.jpg', 'cover.jpg']);
  });

  it('замена адресов по карте меняет только имя, форму записи и обложку шапки', () => {
    const текст = `${ШАПКА}import p from './img/p.jpg';\n\n![x](./a.jpg)\n\n![y](a.jpg)\n`;
    const итог = заменитьАдреса(текст, new Map([['a.jpg', 'img-01.png'], ['img/p.jpg', 'img/p.png'], ['cover.jpg', 'cover.png']]));

    expect(итог).toBe(`---\ntitle: "Розетки"\nimage: ./cover.png\n---\n\nimport p from './img/p.png';\n\n![x](./img-01.png)\n\n![y](img-01.png)\n`);
  });
});

describe('технические подписи медиа', () => {
  it('пустой alt получает подпись по шаблону из заголовка и номера; готовый не трогается', () => {
    const текст = `${ШАПКА}![](./a.jpg)\n\n![Своя](./b.jpg)\n\n![](./c.gif)\n`;
    const итог = применить(текст);

    expect(итог).toBe(`${ШАПКА}![Розетки: изображение 1](./a.jpg)\n\n![Своя](./b.jpg)\n\n![Розетки: изображение 3](./c.gif)\n`);
    expect(анализ(текст).отчёт.оставлено).toEqual([{что: './b.jpg', значение: 'Своя', причина: 'заполнено'}]);
  });

  it('без заголовка статьи подпись не выдумывается: остаётся человеку', () => {
    const {отчёт} = анализ('---\nslug: /a\n---\n\n![](./a.jpg)\n');
    expect(отчёт.человеку).toEqual([{что: './a.jpg', причина: 'нетИсточника'}]);
    expect(отчёт.изменено).toEqual([]);
  });

  it('квадратные скобки в заголовке ломают markdown: такая подпись отдаётся человеку', () => {
    const {отчёт} = анализ('---\ntitle: "Розетки [обзор]"\n---\n\n![](./a.jpg)\n');
    expect(отчёт.человеку).toEqual([{что: './a.jpg', причина: 'опасныеЗнаки'}]);
  });

  it('YouTube без названия и без даты получает название; с датой — работа человека', () => {
    const без = `${ШАПКА}<YouTube id="jjJDJRnYrTU" />\n`;
    expect(применить(без)).toBe(`${ШАПКА}<YouTube id="jjJDJRnYrTU" title="Розетки: видео 1" />\n`);

    const пустое = `${ШАПКА}<YouTube id="jjJDJRnYrTU" title="" />\n`;
    expect(применить(пустое)).toBe(`${ШАПКА}<YouTube id="jjJDJRnYrTU" title="Розетки: видео 1" />\n`);

    const сДатой = `${ШАПКА}<YouTube id="jjJDJRnYrTU" uploadDate="2026-07-21" />\n`;
    expect(анализ(сДатой).отчёт.человеку).toEqual([{что: 'YouTube 1', причина: 'естьДата'}]);
    expect(применить(сДатой)).toBe(сДатой);
  });

  it('ролик из файла получает aria-label той же записью, что панель свойств; нумерация общая с YouTube', () => {
    const ролик = "import v from './a.webm';\n\n<video controls muted loop playsInline style={{width: '100%', height: 'auto'}}>\n  <source src={v} type=\"video/webm\" />\n</video>\n";
    const текст = `${ШАПКА}<YouTube id="jjJDJRnYrTU" />\n\n${ролик}`;
    expect(применить(текст)).toContain('<video controls muted loop playsInline style={{width: \'100%\', height: \'auto\'}} aria-label="Розетки: видео 2">');
  });

  it('карточка товара получает imageAlt из названия товара; заполненный imageAlt не меняется', () => {
    const карточка = '<ProductCard\n  name="Кресла"\n  image={productPreview}\n/>';
    expect(применить(`${ШАПКА}${карточка}\n`)).toContain('<ProductCard\n  name="Кресла"\n  image={productPreview}\n  imageAlt="Кресла"\n/>');

    const готовая = `${ШАПКА}<ProductCard name="Кресла" imageAlt="Своя" />\n`;
    expect(применить(готовая)).toBe(готовая);
  });

  it('статья без медиа — обработчик неприменим', () => {
    expect(анализ(`${ШАПКА}Просто текст.\n`)).toBeNull();
  });

  it('после применения повторный анализ не предлагает ни одной подписи', () => {
    const текст = `${ШАПКА}![](./a.jpg)\n\n<YouTube id="jjJDJRnYrTU" />\n`;
    expect(подписиМедиа.проверить(копия(применить(текст)), null, НАСТРОЙКИ)).toBe(true);
  });
});
