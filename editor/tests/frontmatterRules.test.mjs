// Имя каждого теста повторяет формулировку правила: список правил — это вывод прогона.
import {describe, expect, it} from 'vitest';
import {isUnlisted, normalizeSlug, safeFrontmatter, sameSlugAcrossLocales, setUnlisted} from '../src/core/frontmatterRules.mjs';
import {nothingChanged} from '../src/core/articleFile.mjs';

const КОРНИ = [
  {локаль: 'en', род: 'docs', папка: 'docs'},
  {локаль: 'en', род: 'blog', папка: 'blog'},
  {локаль: 'ru', род: 'docs', папка: 'i18n/ru/docusaurus-plugin-content-docs/current'},
];

const DOCS = 'docs/help/foo/index.mdx';
const BLOG = 'blog/post/index.mdx';
const RU_DOCS = 'i18n/ru/docusaurus-plugin-content-docs/current/help/foo/index.mdx';

describe('защитные правила шапки статьи', () => {
  it('пустое поле обложки удаляется из шапки целиком', () => {
    const {frontmatterRaw, fixed} = safeFrontmatter(DOCS, 'title: "Тест"\nimage: \nslug: /help/foo', КОРНИ);

    expect(frontmatterRaw).not.toContain('image');
    expect(fixed).toHaveLength(1);
  });

  it('поле обложки из одних пробелов удаляется из шапки целиком', () => {
    const {frontmatterRaw} = safeFrontmatter(DOCS, 'title: "Тест"\nimage:    \nslug: /help/foo', КОРНИ);

    expect(frontmatterRaw).not.toContain('image');
  });

  it('пустое поле ключевых слов удаляется из шапки: оно роняет сборку сайта', () => {
    const {frontmatterRaw, fixed} = safeFrontmatter('blog/x/index.mdx', 'slug: x\nkeywords: []', КОРНИ);

    expect(frontmatterRaw).not.toContain('keywords');
    expect(fixed).toHaveLength(1);
  });

  it('пустые метки при сохранении не удаляются: сборку они не роняют, а файл чужой', () => {
    // Открыл и сохранил — ни байта (SPEC 5.1). Пустые метки уйдут только тогда, когда человек
    // сам очистит поле: это правка шапки, а не защитная починка.
    const raw = 'slug: x\ntags: []';
    const {frontmatterRaw, fixed} = safeFrontmatter('blog/x/index.mdx', raw, КОРНИ);

    expect(frontmatterRaw).toBe(raw);
    expect(fixed).toEqual([]);
  });

  it('список, расписанный строками ниже, не трогается: его элементы осиротели бы', () => {
    // Так устроены ключевые слова у живых статей блога: `keywords:` и под ним строки `- слово`.
    // Для построчного разбора такая строка выглядит пустой, но пустой не является.
    const raw = 'slug: x\nkeywords:\n  - revit\n  - семейства';
    const {frontmatterRaw, fixed} = safeFrontmatter('blog/x/index.mdx', raw, КОРНИ);

    expect(frontmatterRaw).toBe(raw);
    expect(fixed).toEqual([]);
  });

  it('адрес в кавычках не считается частью адреса: кавычки не уезжают внутрь пути', () => {
    const {frontmatterRaw, fixed} = safeFrontmatter(DOCS, 'slug: "install-plugin"', КОРНИ);

    expect(frontmatterRaw).toBe('slug: /help/install-plugin');
    expect(fixed).toHaveLength(1);
  });

  it('адрес блога из одних цифр остаётся в кавычках и не переписывается зря', () => {
    const {frontmatterRaw, fixed} = safeFrontmatter('blog/2026/index.mdx', 'slug: "2026"', КОРНИ);

    expect(frontmatterRaw).toBe('slug: "2026"');
    expect(fixed).toEqual([]);
  });

  it('адрес в одиночных кавычках остаётся как записан: YAML читает его строкой не хуже', () => {
    // Открыл и сохранил — файл не меняется (SPEC 5.1). Менять вид кавычек не за что.
    for (const шапка of ["slug: '2026'", "slug: '/help/foo'"]) {
      const путь = шапка.includes('help') ? DOCS : 'blog/2026/index.mdx';
      expect(safeFrontmatter(путь, шапка, КОРНИ).frontmatterRaw, шапка).toBe(шапка);
    }
  });

  it('адрес из одних цифр без кавычек берётся в кавычки: иначе YAML прочитает его числом', () => {
    const {frontmatterRaw, fixed} = safeFrontmatter('blog/2026/index.mdx', 'slug: 2026', КОРНИ);

    expect(frontmatterRaw).toBe('slug: "2026"');
    expect(fixed).toHaveLength(1);
  });

  it('заполненное поле обложки сохраняется без изменений', () => {
    const {frontmatterRaw, fixed} = safeFrontmatter(DOCS, 'image: ./cover.png\nslug: /help/foo', КОРНИ);

    expect(frontmatterRaw).toContain('image: ./cover.png');
    expect(fixed).toEqual([]);
  });

  it('у статьи документации адрес становится абсолютным с префиксом раздела', () => {
    expect(normalizeSlug(DOCS, 'install-plugin', КОРНИ)).toBe('/help/install-plugin');
  });

  it('у статьи блога адрес остаётся относительным', () => {
    expect(normalizeSlug(BLOG, 'my-post', КОРНИ)).toBe('my-post');
    expect(normalizeSlug(BLOG, '/my-post', КОРНИ)).toBe('my-post');
  });

  it('путь локали не попадает в адрес статьи', () => {
    const slug = normalizeSlug(RU_DOCS, 'install-plugin', КОРНИ);

    expect(slug).toBe('/help/install-plugin');
    expect(slug).not.toContain('ru');
  });

  it('уже абсолютный адрес не переписывается и раздел не задваивается', () => {
    expect(normalizeSlug(DOCS, '/help/install-plugin', КОРНИ)).toBe('/help/install-plugin');
  });

  it('адрес перевода обязан совпадать с адресом исходной статьи', () => {
    expect(sameSlugAcrossLocales('/help/foo', '/help/foo')).toBe(true);
    expect(sameSlugAcrossLocales('/help/foo', '/help/bar')).toBe(false);
  });

  it('правка одной шапки считается изменением и не теряется', () => {
    const current = {body: 'Текст статьи.', frontmatterRaw: 'title: "Было"'};

    expect(nothingChanged(current, {body: 'Текст статьи.', frontmatterRaw: 'title: "Стало"'})).toBe(false);
    expect(nothingChanged(current, {body: 'Текст статьи.', frontmatterRaw: 'title: "Было"'})).toBe(true);
  });

  it('шапка без опасных значений проходит без правок', () => {
    const raw = 'title: "Кресла"\nslug: /guides/families/armchairs\ndescription: "Текст"';
    const {frontmatterRaw, fixed} = safeFrontmatter('docs/guides/families/armchairs/index.mdx', raw, КОРНИ);

    expect(frontmatterRaw).toBe(raw);
    expect(fixed).toEqual([]);
  });
});

describe('видимость статьи', () => {
  it('видимость читается из шапки статьи, а не из состояния', () => {
    expect(isUnlisted('title: Тест\nunlisted: true')).toBe(true);
    expect(isUnlisted('title: Тест')).toBe(false);
    expect(isUnlisted('title: Тест\nunlisted: false')).toBe(false);
  });

  it('скрытие дописывает поле в конец шапки и не трогает остальные строки', () => {
    const было = 'title: Тест\nslug: /help/foo';
    const стало = setUnlisted(было, true);

    expect(стало).toBe('title: Тест\nslug: /help/foo\nunlisted: true');
  });

  it('возврат в меню убирает поле из шапки целиком', () => {
    expect(setUnlisted('title: Тест\nunlisted: true\nslug: /help/foo', false))
      .toBe('title: Тест\nslug: /help/foo');
  });

  it('повторное скрытие не задваивает поле', () => {
    const один = setUnlisted('title: Тест', true);

    expect(setUnlisted(один, true)).toBe(один);
  });

  it('возврат в меню на windows-шапке не оставляет лишний возврат каретки в последней строке', () => {
    // Именно так порча и заводилась: после удаления последней строки хвостовой `\r` предыдущей
    // оставался в тексте, при записи к нему добавлялся новый перевод строки — и поле переставало
    // читаться вовсе.
    const шапка = 'title: Тест\r\nimage: ./cover.png\r\nunlisted: true';

    expect(setUnlisted(шапка, false)).toBe('title: Тест\nimage: ./cover.png');
  });
});
