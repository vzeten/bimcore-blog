// Имя каждого теста повторяет формулировку правила.
// Быстрые проверки публикации вместо сборки на компьютере (решение владельца 2026-09-18): ссылки
// против будущего сайта, картинки, обложка, шапка, блоки текста. Ложный блокер хуже пропуска, поэтому
// рядом — корпус живых статей владельца (только чтение): на нём не должно быть ни одной находки.
import {describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  ключиКомпонентов, проверитьКартинки, проверитьКомпоненты, проверитьСсылки, проверитьШапку, путьФайла, страницыСайта,
} from '../src/core/fastRules.mjs';
import {readField, splitArticle} from '../src/core/articleFile.mjs';
import {черновикСайта} from '../src/core/localeSigns.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
const roots = НАСТРОЙКИ['контент'];
const САЙТ = {
  roots, корни: roots.filter((r) => r['наСайте']).map((r) => r['папка']), локали: ['en', 'ru', 'es'],
  обязательный: НАСТРОЙКИ['обязательныйЯзык'], префиксБлога: НАСТРОЙКИ['адресаСайта']['префиксБлога'], хост: 'learn.bimcore.one',
};
const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons';
const в = (путь, slug = '', черновик = false) => ({путь, slug, черновик});
const СТРАНИЦЫ = страницыСайта([
  в('docs/lessons/proba/index.mdx', '/lessons/proba'),
  в(`${RU}/proba/index.mdx`, '/lessons/proba'),
  в('docs/lessons/draft/index.mdx', '/lessons/draft', true),
  в('docs/guides/families/beds/index.mdx', '/guides/families/beds'),
  в(`${RU}/tolko-ru/index.mdx`, '/lessons/tolko-ru'),
  в('blog/post/index.mdx', 'post'),
], САЙТ);
const документ = (тело, путь = `${RU}/other/index.mdx`) => ({путь, текст: `---\ntitle: "Другая"\nslug: /lessons/other\n---\n${тело}`});
const коды = (находки) => находки.map((н) => `${н.уровень}:${н.код}:${н.значение ?? ''}`);

describe('страницы будущего сайта', () => {
  it('язык без своего файла отдаёт страницу обязательного; черновик страницы не даёт; без EN статьи нет', () => {
    expect(СТРАНИЦЫ.живые.has('/lessons/proba')).toBe(true);
    expect(СТРАНИЦЫ.живые.has('/es/lessons/proba')).toBe(true);
    expect(СТРАНИЦЫ.живые.has('/ru/blog/post')).toBe(true);
    expect(СТРАНИЦЫ.живые.has('/lessons/draft')).toBe(false);
    expect(СТРАНИЦЫ.все.has('/lessons/draft')).toBe(true);
    expect(СТРАНИЦЫ.живые.has('/ru/lessons/tolko-ru')).toBe(false);
  });
});

describe('ссылки против будущего сайта', () => {
  it('страница есть — находок нет: абсолютная в своём языке, относительная, на файл, с якорем', () => {
    const текст = '[a](/lessons/proba/) [b](../proba/) [c](../proba/index.mdx) [d](/lessons/proba/#x) [e](https://learn.bimcore.one/blog/post/)\n';
    expect(проверитьСсылки([документ(текст)], СТРАНИЦЫ, САЙТ)).toEqual([]);
  });

  it('страницы не будет — блокер с местом: опечатка, черновик, файл без страницы', () => {
    const находки = проверитьСсылки([документ('\n[a](/lessons/nope/)\n\n[b](/lessons/draft/) [c](../draft/index.mdx)\n')], СТРАНИЦЫ, САЙТ);
    expect(коды(находки)).toEqual(['блокер:ссылкаВНикуда:/lessons/nope/', 'блокер:ссылкаВНикуда:/lessons/draft/', 'блокер:ссылкаВНикуда:../draft/index.mdx']);
    expect(находки.map((н) => н.строка)).toEqual([2, 4, 4]);
  });

  it('находка называет ссылку её видимым текстом без разметки; разметкой-тегом — тоже', () => {
    const находки = проверитьСсылки([документ('[урок **про стены**](/lessons/nope/) и <a href="/lessons/draft/">черновик</a>\n')], СТРАНИЦЫ, САЙТ);
    expect(находки.map((н) => н.текст)).toEqual(['урок про стены', 'черновик']);
  });

  it('раздел, метки блога, файл из static, один шаг — не судим: предупреждение, а не блокер', () => {
    const текст = '[a](/guides/families/) [b](/blog/tags/revit/) [c](/img/plan.pdf) [d](/search) [e](/kursy/nope/)\n';
    expect(коды(проверитьСсылки([документ(текст)], СТРАНИЦЫ, САЙТ)).every((код) => код.startsWith('предупреждение:ссылкаНеПроверена'))).toBe(true);
  });

  it('чужой сервер, почта и ссылки в коде не проверяются вовсе', () => {
    const текст = '[a](https://bimcore.one/x) [b](mailto:a@b.c)\n\n```\n[c](/lessons/nope/)\n```\n\n`[d](/lessons/nope/)`\n';
    expect(проверитьСсылки([документ(текст)], СТРАНИЦЫ, САЙТ)).toEqual([]);
  });
});

describe('картинки, обложка, шапка', () => {
  const есть = (путь) => [`${RU}/other/img-01.png`, `${RU}/other/картинка.png`, 'static/img/logo.png'].includes(путь);

  it('картинка есть рядом, в static или по имени кириллицей — находок нет', () => {
    const текст = '![a](./img-01.png) ![b](./%D0%BA%D0%B0%D1%80%D1%82%D0%B8%D0%BD%D0%BA%D0%B0.png) ![c](/img/logo.png) <img src="./img-01.png" />\n';
    expect(проверитьКартинки([документ(текст)], есть)).toEqual([]);
  });

  it('картинки нет — блокер с местом; обложки нет — блокер; внешняя картинка не проверяется', () => {
    const д = {путь: `${RU}/other/index.mdx`, текст: '---\nimage: ./cover.png\n---\n\n![x](media/nope.png) ![y](https://example.com/a.png)\n'};
    expect(коды(проверитьКартинки([д], есть))).toEqual(['блокер:картинкиНет:media/nope.png', 'блокер:обложкиНет:./cover.png']);
  });

  it('путь файла считается от папки статьи; @site ведёт в корень, абсолютный — в static', () => {
    expect(путьФайла('../x/a.png', 'docs/lessons/proba/index.mdx')).toBe('docs/lessons/x/a.png');
    expect(путьФайла('@site/static/img/a.png', 'docs/a/index.mdx')).toBe('static/img/a.png');
    expect(путьФайла('/img/a.png', 'docs/a/index.mdx')).toBe('static/img/a.png');
    expect(путьФайла('{x}', 'docs/a/index.mdx')).toBeNull();
  });

  it('«Недоступно» и «По ссылке» разом — блокер; по отдельности — нет', () => {
    const д = (шапка) => ({путь: `${RU}/other/index.mdx`, текст: `---\n${шапка}\n---\n`});
    expect(коды(проверитьШапку([д('draft: true\nunlisted: true')]))).toEqual(['блокер:черновикИСкрыта:']);
    expect(проверитьШапку([д('draft: true'), д('unlisted: true'), д('draft: false\nunlisted: true')])).toEqual([]);
  });
});

describe('блоки текста', () => {
  const ИЗВЕСТНЫЕ = new Set(['CTA', 'Details']);

  it('незнакомый блок — блокер; блок из import документа и строчные теги — не беда', () => {
    const текст = "import Tabs from '@theme/Tabs';\nimport pic from './pic.png';\n\n<CTA />\n<Tabs>x</Tabs>\n<div>y</div>\n<Nope />\n";
    const находки = проверитьКомпоненты([документ(текст)], ИЗВЕСТНЫЕ, (путь) => путь.endsWith('/pic.png'));
    expect(коды(находки)).toEqual(['предупреждение:импортВMdx:@theme/Tabs', 'блокер:компонентНеизвестен:Nope']);
  });

  it('import файла, которого нет, — блокер', () => {
    const находки = проверитьКомпоненты([документ("import pic from './нет.png';\n")], ИЗВЕСТНЫЕ, () => false);
    expect(коды(находки)).toEqual(['блокер:импортНеНайден:./нет.png']);
  });

  it('перечень блоков сайта не прочитан — одно предупреждение, а не блокер', () => {
    expect(коды(проверитьКомпоненты([документ('<Nope />\n')], null, () => true))).toEqual(['предупреждение:компонентыНеПроверены:']);
  });

  it('ключи файла компонентов читаются текстом; распространение перечня темы замечено', () => {
    const текст = "import X from '@theme-original/MDXComponents';\nexport default {\n  ...X,\n  // CTA — призыв\n  CTA,\n  truncate: () => null,\n};\n";
    const итог = ключиКомпонентов(текст);
    expect([...итог.имена].sort()).toEqual(['CTA', 'truncate']);
    expect(итог.распространяет).toBe(true);
  });
});

/**
 * Корпус живых статей владельца по опубликованной ветке его основной папки. Только чтение: ни один
 * файл не пишется. Сайт собран и жив — значит ни одного блокера на нём быть не может.
 */
const КОРПУС = path.resolve(EDITOR, '..', '..', '..', '..', '..');
const git = (...ключи) => execFileSync('git', ['-c', 'core.quotepath=false', ...ключи], {cwd: КОРПУС, encoding: 'utf8', maxBuffer: 1e8});
let естьОснова = false;
try {
  естьОснова = fs.existsSync(path.join(КОРПУС, 'docusaurus.config.js')) && git('rev-parse', '--verify', 'origin/main').trim() !== '';
} catch {
  естьОснова = false;
}

describe.skipIf(!естьОснова)('корпус живых статей', () => {
  it('на опубликованном сайте ни одной находки: ни ложного блокера, ни лишнего предупреждения', () => {
    const файлы = new Set(git('ls-tree', '-r', '--name-only', 'origin/main').split('\n').filter(Boolean));
    const статьи = [...файлы].filter((путь) => /\.mdx?$/.test(путь) && САЙТ.корни.some((корень) => путь.startsWith(`${корень}/`)));
    const документы = статьи.map((путь) => ({путь, текст: git('show', `origin/main:${путь}`)}));
    const страницы = страницыСайта(документы.map((д) => {
      const шапка = splitArticle(д.текст).frontmatterRaw;
      return {путь: д.путь, slug: readField(шапка, 'slug'), черновик: черновикСайта(шапка)};
    }), САЙТ);
    const свои = ключиКомпонентов(git('show', 'origin/main:src/theme/MDXComponents.js')).имена;
    const естьФайл = (путь) => путь !== null && файлы.has(путь);

    const находки = [
      ...проверитьСсылки(документы, страницы, САЙТ),
      ...проверитьКартинки(документы, естьФайл),
      ...проверитьШапку(документы),
      ...проверитьКомпоненты(документы, new Set([...свои, 'Head', 'Details', 'details']), естьФайл),
    ];
    expect(находки.map((н) => `${н.код} ${н.путь}:${н.строка} ${н.значение ?? ''}`)).toEqual([]);
    expect(документы.length).toBeGreaterThan(100);
  }, 120_000);
});
