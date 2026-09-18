// Имя каждого теста повторяет формулировку правила.
// Адреса страниц сайта и уборка ссылок на снятую статью: формы ссылок, относительный адрес,
// код, непонятное — и корпус живых статей владельца, прочитанный ТОЛЬКО чтением.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {адресаСтатьи, адресВерсии, безСсылок, кудаВедёт} from '../src/core/siteRoutes.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
const САЙТ = {
  roots: НАСТРОЙКИ['контент'],
  префиксБлога: НАСТРОЙКИ['адресаСайта']['префиксБлога'],
  обязательный: НАСТРОЙКИ['обязательныйЯзык'],
  локали: ['en', 'ru', 'es'],
  хост: 'learn.bimcore.one',
};

const RU_БЛОГ = 'i18n/ru/docusaurus-plugin-content-blog';
const откуда = (путь, текст = '') => ({
  путь, локаль: САЙТ.roots.find((root) => путь.startsWith(`${root['папка']}/`))?.['локаль'],
  адрес: адресВерсии(путь, текст, САЙТ), хост: САЙТ.хост, обязательный: САЙТ.обязательный, локали: САЙТ.локали,
});
const целиБлога = (slug) => ({
  адреса: адресаСтатьи([{путь: `blog/${slug}/index.mdx`, текст: `---\nslug: ${slug}\n---\n`}], САЙТ),
  файлы: new Set([`blog/${slug}/index.mdx`, `${RU_БЛОГ}/${slug}/index.mdx`]),
});

describe('адрес статьи', () => {
  it('документация живёт от корня, блог — под префиксом, обязательный язык без префикса', () => {
    expect(адресВерсии('docs/lessons/proba/index.mdx', '---\nslug: /lessons/proba\n---\n', САЙТ)).toBe('/lessons/proba');
    expect(адресВерсии(`${RU_БЛОГ}/post/index.mdx`, '---\nslug: post\n---\n', САЙТ)).toBe('/ru/blog/post');
    expect(адресВерсии('i18n/es/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx', '', САЙТ)).toBe('/es/lessons/proba');
  });

  it('снятая статья исчезает во всех языках: адреса считаются по каждому языку сайта', () => {
    expect([...целиБлога('post').адреса].sort()).toEqual(['/blog/post', '/es/blog/post', '/ru/blog/post']);
  });

  it('песочница страницы на сайте не имеет', () => {
    expect(адресВерсии('editor/sandbox/proba/index.mdx', '---\nslug: /x\n---\n', САЙТ)).toBe('');
  });
});

describe('куда ведёт ссылка', () => {
  const ру = откуда(`${RU_БЛОГ}/other/index.mdx`, '---\nslug: other\n---\n');

  it('абсолютный путь в русской статье ведёт в русский язык; префикс другого языка написан нарочно', () => {
    expect(кудаВедёт('/blog/post/', ру)).toEqual({адрес: '/ru/blog/post'});
    expect(кудаВедёт('/es/blog/post', ру)).toEqual({адрес: '/es/blog/post'});
  });

  it('относительный адрес считается от адреса страницы с косой на конце', () => {
    const en = откуда('docs/lessons/variable-thickness-wall-revit/index.mdx', '---\nslug: /lessons/variable-thickness-wall-revit\n---\n');
    expect(кудаВедёт('../walls-different-materials/', en)).toEqual({адрес: '/lessons/walls-different-materials'});
  });

  it('ссылка на файл документа — путь файла; чужой сервер, почта и якорь — не наши', () => {
    expect(кудаВедёт('../post/index.mdx#a', ру)).toEqual({файл: `${RU_БЛОГ}/post/index.mdx`});
    expect(кудаВедёт('https://example.com/blog/post', ру)).toBeNull();
    expect(кудаВедёт('mailto:a@b.c', ру)).toBeNull();
    expect(кудаВедёт('#раздел', ру)).toBeNull();
    expect(кудаВедёт('https://learn.bimcore.one/blog/post/#x', ру)).toEqual({адрес: '/blog/post'});
  });
});

describe('уборка ссылок', () => {
  const путь = `${RU_БЛОГ}/other/index.mdx`;
  const шапка = '---\ntitle: "Другая"\nslug: other\n---\n';
  const убрать = (тело) => безСсылок(`${шапка}${тело}`, целиБлога('post'), откуда(путь, шапка));

  it('markdown-ссылка и ссылка разметкой становятся своим текстом, текст вокруг не меняется', () => {
    const итог = убрать('См. [пост **жирно**](/blog/post/ "заголовок") и <a href="/ru/blog/post/">ещё</a>, а [другой](/blog/other/) остаётся.\n');
    expect(итог.текст).toBe(`${шапка}См. пост **жирно** и ещё, а [другой](/blog/other/) остаётся.\n`);
    expect(итог).toMatchObject({заменено: 2, непонятные: []});
  });

  it('ссылка вокруг картинки снимается, сама картинка остаётся', () => {
    expect(убрать('[![кадр](./img.png)](/blog/post)\n').текст).toBe(`${шапка}![кадр](./img.png)\n`);
  });

  it('код не трогается: ни блок в тройных кавычках, ни код в строке', () => {
    const тело = '```md\n[пример](/blog/post)\n```\n\nИ `[строка](/blog/post)` тоже.\n';
    expect(убрать(тело)).toMatchObject({текст: `${шапка}${тело}`, заменено: 0, непонятные: []});
  });

  it('ссылка-сноска и голый адрес — непонятное: угадывать чужую разметку нельзя', () => {
    expect(убрать('Текст [пост][p].\n\n[p]: /blog/post\n').непонятные).toEqual(['/blog/post']);
    expect(убрать('Адрес https://learn.bimcore.one/ru/blog/post/ словами.\n').непонятные).toEqual(['/ru/blog/post']);
  });

  it('похожий, но другой адрес непонятным не считается', () => {
    expect(убрать('[x](/blog/post-2/) и /img/blog/post.png\n')).toMatchObject({заменено: 0, непонятные: []});
  });

  it('тот же путь на чужом сервере — не наша ссылка: не трогается и отказа не даёт', () => {
    const тело = 'Магазин: [пост](https://bimcore.one/blog/post) и https://bimcore.one/ru/blog/post/ словами.\n';
    expect(убрать(тело)).toMatchObject({текст: `${шапка}${тело}`, заменено: 0, непонятные: []});
    // Свой сервер при этом по-прежнему узнаётся: голый адрес своей страницы остаётся непонятным.
    expect(убрать('https://learn.bimcore.one/blog/post/\n').непонятные).toEqual(['/blog/post']);
  });
});

/**
 * Корпус живых статей владельца. Читается только чтением: ни один файл основной папки не
 * пишется. Для каждой внутренней ссылки на статью программа обязана узнать её и убрать, ничего не
 * оставив непонятным. Основной папки нет (чужая машина) — проверка молчит.
 */
const КОРПУС = path.resolve(EDITOR, '..', '..', '..', '..', '..');
const естьКорпус = fs.existsSync(path.join(КОРПУС, 'docusaurus.config.js')) && fs.existsSync(path.join(КОРПУС, 'docs'));

describe.skipIf(!естьКорпус)('корпус живых статей', () => {
  const корни = САЙТ.roots.filter((root) => root['наСайте'] === true);
  const обход = (папка, накопитель = []) => {
    if (!fs.existsSync(папка)) return накопитель;
    for (const вход of fs.readdirSync(папка, {withFileTypes: true})) {
      if (вход.name.startsWith('.') || вход.name.startsWith('_')) continue;
      const полный = path.join(папка, вход.name);
      if (вход.isDirectory()) обход(полный, накопитель);
      else if (/\.mdx?$/.test(вход.name)) накопитель.push(полный);
    }
    return накопитель;
  };
  const файлы = корни.flatMap((root) => обход(path.join(КОРПУС, root['папка']))
    .map((полный) => ({путь: path.relative(КОРПУС, полный).split(path.sep).join('/'), текст: fs.readFileSync(полный, 'utf8'), root})));

  // Статьи корпуса: версии сшиваются по роду и пути внутри раздела, адрес каждой — к её статье.
  const статьи = new Map();
  const поАдресу = new Map();
  for (const файл of файлы) {
    const ключ = `${файл.root['род']}|${файл.путь.slice(файл.root['папка'].length + 1)}`;
    статьи.set(ключ, [...(статьи.get(ключ) ?? []), файл]);
    поАдресу.set(адресВерсии(файл.путь, файл.текст, САЙТ), ключ);
  }

  it('каждая внутренняя ссылка на статью узнаётся и убирается, непонятного не остаётся', () => {
    let ссылок = 0;
    for (const файл of файлы) {
      const где = откуда(файл.путь, файл.текст);
      const цели = new Set();
      for (const найдено of файл.текст.matchAll(/\]\(([^)\s]+)\)|href="([^"]+)"/g)) {
        const куда = кудаВедёт(найдено[1] ?? найдено[2], где);
        if (куда?.адрес && поАдресу.has(куда.адрес) && поАдресу.get(куда.адрес) !== `${файл.root['род']}|${файл.путь.slice(файл.root['папка'].length + 1)}`) {
          цели.add(поАдресу.get(куда.адрес));
          ссылок += 1;
        }
      }
      for (const ключ of цели) {
        const версии = статьи.get(ключ);
        const итог = безСсылок(файл.текст, {адреса: адресаСтатьи(версии, САЙТ), файлы: new Set(версии.map((в) => в.путь))}, где);
        expect({файл: файл.путь, статья: ключ, непонятные: итог.непонятные}).toEqual({файл: файл.путь, статья: ключ, непонятные: []});
        expect(итог.заменено).toBeGreaterThan(0);
        expect(итог.текст.length).toBeLessThan(файл.текст.length);
      }
    }
    // В корпусе около 110 ссылок на статьи; меньше сотни — признак, что правило их не видит.
    expect(ссылок).toBeGreaterThanOrEqual(100);
  });
});
