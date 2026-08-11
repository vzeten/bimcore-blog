// Имя каждого теста повторяет формулировку правила: список правил — это вывод прогона.
import {describe, expect, it} from 'vitest';
import {
  isUnlisted, normalizeSlug, sameSlugAcrossLocales, setUnlisted, адресБезSlug,
} from '../src/core/frontmatterRules.mjs';
import {safeFrontmatter} from '../src/core/safeFrontmatter.mjs';
import {nothingChanged} from '../src/core/articleFile.mjs';

const RU_ROOT = 'i18n/ru/docusaurus-plugin-content-docs/current';

const КОРНИ = [
  {локаль: 'en', род: 'docs', папка: 'docs'},
  {локаль: 'en', род: 'blog', папка: 'blog'},
  {локаль: 'ru', род: 'docs', папка: RU_ROOT},
  {локаль: 'ru', род: 'проба', папка: 'editor/sandbox', наСайте: false},
];

const DOCS = 'docs/help/foo/index.mdx';
const BLOG = 'blog/post/index.mdx';
const RU_DOCS = `${RU_ROOT}/help/foo/index.mdx`;

describe('защитные правила шапки статьи', () => {
  it('пустое поле обложки удаляется из шапки целиком', () => {
    const {frontmatterRaw, fixed} = safeFrontmatter(DOCS, 'title: "Тест"\nimage: \nslug: /help/foo', КОРНИ);

    expect(frontmatterRaw).not.toContain('image');
    // Находка — запись с кодом и полем, а не фраза для человека: по полю подготовка ведёт
    // к месту в статье, а слова живут в настройках (SPEC 4.4).
    expect(fixed).toEqual([{код: 'пустаяОбложка', поле: 'image'}]);
  });

  it('поле обложки из одних пробелов удаляется из шапки целиком', () => {
    const {frontmatterRaw} = safeFrontmatter(DOCS, 'title: "Тест"\nimage:    \nslug: /help/foo', КОРНИ);

    expect(frontmatterRaw).not.toContain('image');
  });

  it('пустое поле ключевых слов удаляется из шапки: оно роняет сборку сайта', () => {
    const {frontmatterRaw, fixed} = safeFrontmatter('blog/x/index.mdx', 'slug: x\nkeywords: []', КОРНИ);

    expect(frontmatterRaw).not.toContain('keywords');
    expect(fixed).toEqual([{код: 'пустыеКлючевыеСлова', поле: 'keywords'}]);
  });

  it('голый ключ ключевых слов без единого элемента удаляется: YAML читает его пустотой', () => {
    // `keywords:` без значения и без строк под ним — это `null`, и сборка сайта на нём падает.
    // От блочного списка такой ключ отличается тем, что под ним нет ни одного элемента.
    const {frontmatterRaw, fixed} = safeFrontmatter('blog/x/index.mdx', 'slug: x\nkeywords:\ntitle: A', КОРНИ);

    expect(frontmatterRaw).toBe('slug: x\ntitle: A');
    expect(fixed).toEqual([{код: 'пустыеКлючевыеСлова', поле: 'keywords'}]);
  });

  it('список ключевых слов из пустых строк удаляется: сборку роняет и он', () => {
    const {frontmatterRaw, fixed} = safeFrontmatter('blog/x/index.mdx', "slug: x\nkeywords: ['']", КОРНИ);

    expect(frontmatterRaw).toBe('slug: x');
    expect(fixed).toEqual([{код: 'пустыеКлючевыеСлова', поле: 'keywords'}]);
  });

  it('ключевые слова, которых программа не поняла, не трогаются вовсе', () => {
    // Стереть непонятое значит потерять текст человека. Об этом скажет подготовка статьи.
    const raw = 'slug: x\nkeywords: [не закрытая скобка';
    const {frontmatterRaw, fixed} = safeFrontmatter('blog/x/index.mdx', raw, КОРНИ);

    expect(frontmatterRaw).toBe(raw);
    expect(fixed).toEqual([]);
  });

  it('пустая обложка в кавычках удаляется так же, как голая: сборку роняют обе', () => {
    const {frontmatterRaw, fixed} = safeFrontmatter(DOCS, 'image: ""\nslug: /help/foo', КОРНИ);

    expect(frontmatterRaw).toBe('slug: /help/foo');
    expect(fixed).toEqual([{код: 'пустаяОбложка', поле: 'image'}]);
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
    // Было и стало едут в находке значениями: отчёту подготовки нужно показать оба, и собирать
    // их разбором готовой фразы значило бы завести второй источник того же правила.
    expect(fixed).toEqual([{код: 'адресПоПравилу', поле: 'slug', было: 'install-plugin', стало: '/help/install-plugin'}]);
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
    // Своя находка, а не «адрес приведён к правилу»: адрес не менялся, изменилась его запись,
    // и отчёт подготовки сказал бы человеку «2026 → 2026», то есть соврал бы.
    expect(fixed).toEqual([{код: 'адресВКавычки', поле: 'slug', адрес: '2026'}]);
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

  it('у статьи-файла не в своей папке раздел в адрес входит', () => {
    // Правило держалось на догадке «файл статьи всегда `index.*`», и у файла не в папке оно
    // съедало настоящий раздел: `slug: a` в `docs/lessons/a.mdx` приводился к `/a`. Записывала
    // это защитная проверка при каждом сохранении, то есть портила чужой файл.
    expect(normalizeSlug('docs/lessons/a.mdx', 'a', КОРНИ)).toBe('/lessons/a');
    expect(normalizeSlug('docs/help/foo/index.mdx', 'a', КОРНИ)).toBe('/help/a');
  });

  it('верный адрес статьи-файла сохранение не переписывает ни на байт', () => {
    const raw = 'title: "Проба"\nslug: /lessons/a\ndescription: "Текст"';
    const {frontmatterRaw, fixed} = safeFrontmatter('docs/lessons/a.mdx', raw, КОРНИ);

    expect(frontmatterRaw).toBe(raw);
    expect(fixed).toEqual([]);
  });

  it('адрес версии без записанного адреса даёт путь файла, а не имя папки над ним', () => {
    // Имя папки годилось только для `index.*`. У файла в корне раздела оно давало имя самой папки
    // раздела — `/docs` у английской версии и `/current` у русской, то есть ложное расхождение
    // версий у здоровой статьи (`current` — служебная папка плагина локализации, её на сайте нет).
    expect(адресБезSlug('docs/intro.mdx', КОРНИ)).toBe('/intro');
    expect(адресБезSlug(`${RU_ROOT}/intro.mdx`, КОРНИ)).toBe('/intro');
    expect(адресБезSlug('docs/lessons/a.mdx', КОРНИ)).toBe('/lessons/a');
    expect(адресБезSlug('docs/help/foo/index.mdx', КОРНИ)).toBe('/help/foo');
  });

  it('индексом папки Docusaurus считает три имени, и регистр ему не важен', () => {
    // Правило чужое, взято из `isCategoryIndex` документации: `index`, `readme` и имя самой папки.
    // Считай мы индексом только `index`, такой файл получил бы адрес с лишним хвостом
    // (`/lessons/README`), и разошёлся бы он молча: у языковых версий путь одинаков, и сравнение
    // адресов сошлось бы на одинаково неверном значении.
    expect(адресБезSlug('docs/lessons/README.md', КОРНИ)).toBe('/lessons');
    expect(адресБезSlug('docs/lessons/Index.mdx', КОРНИ)).toBe('/lessons');
    expect(адресБезSlug('docs/lessons/walls/walls.mdx', КОРНИ)).toBe('/lessons/walls');
    // Записанный адрес заменяет саму статью, а не добавляется внутрь неё: у файла-индекса папки
    // это ровно то же, что у `lessons/walls/index.mdx`, — соглашение редактора одно на оба вида.
    expect(normalizeSlug('docs/lessons/walls/walls.mdx', 'a', КОРНИ)).toBe('/lessons/a');
    expect(normalizeSlug('docs/lessons/walls/index.mdx', 'a', КОРНИ)).toBe('/lessons/a');
  });

  it('у блога индекс папки только один и написан строчными: правило там своё', () => {
    // Блог живёт по другому разбору пути, чем документация: `readme` и имя папки для него
    // обычные статьи, и адрес им даёт имя файла. Файл в корне блога индексом не бывает вовсе:
    // своей папки у него нет.
    expect(адресБезSlug('blog/post/index.mdx', КОРНИ)).toBe('post');
    expect(адресБезSlug('blog/post/readme.mdx', КОРНИ)).toBe('post/readme');
    expect(адресБезSlug('blog/post/post.mdx', КОРНИ)).toBe('post/post');
    expect(адресБезSlug('blog/index.mdx', КОРНИ)).toBe('index');
  });

  it('дату в пути блога правило не разбирает — это названная граница, а не верный адрес', () => {
    // Docusaurus переносит дату в адрес (`/2026/01/01/post`) и ищет её в любой части пути, а не
    // только в имени файла. Правило отдаёт путь как есть. Закреплено как известная граница:
    // расхождение здесь молчаливое, но статьям блога программа всегда пишет `slug` явно,
    // а при записанном адресе имя файла Docusaurus не разбирает вовсе.
    expect(адресБезSlug('blog/2026-01-01-post.mdx', КОРНИ)).toBe('2026-01-01-post');
    expect(адресБезSlug('blog/2026-01-01-post/index.mdx', КОРНИ)).toBe('2026-01-01-post');
  });

  it('у статьи вне сайта адреса на сайте нет вовсе', () => {
    expect(адресБезSlug('editor/sandbox/proba/index.mdx', КОРНИ)).toBe('');
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
