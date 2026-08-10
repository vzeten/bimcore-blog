// Статья — одна сущность с версиями на языках, а не набор отдельных файлов.
// Единственное место, где файлы собираются в статьи.

import {articlePlace, folderChain} from './frontmatterRules.mjs';

/**
 * Файл статьи ли это. Одно место правила на всю программу: обход папок, создание, удаление и
 * подготовка обязаны считать статьёй одно и то же. Docusaurus собирает и `.md`, и `.mdx`;
 * разойдись эти места хоть на букву — статья, написанная как `.md`, была бы видна в реестре,
 * но не существовала бы для подготовки, и та сказала бы «проверять нечего» про исправный файл.
 */
export function файлСтатьи(имя) {
  return /\.mdx?$/.test(String(имя ?? ''));
}

/**
 * Ключ статьи: род и путь внутри раздела без языка.
 * По нему русская, английская и испанская версии узнают друг друга.
 */
export function articleKey(path, roots) {
  const place = articlePlace(path, roots);
  return `${place.kind}:${place.inside}`;
}

/**
 * Путь той же статьи в другом корне: тот же путь внутри раздела, другая папка локали.
 * Одно место правила: реестр сшивает языковые версии ПО ПУТИ, и создание статьи кладёт файлы
 * по нему же. Разойдись они хоть на букву — программа покажет две статьи вместо одной.
 */
export function путьВерсии(корень, внутри) {
  return `${корень['папка']}/${внутри}`;
}

/**
 * Пути тех же языковых версий в других локалях. Правило то же, каким `articleKey` сшивает файлы
 * в одну статью: совпадают род и путь внутри раздела, различается папка локали.
 *
 * Существуют ли эти файлы на самом деле, решает адаптер: правило диска не знает. Языки не
 * перечислены в коде — берутся из настройки «контент», поэтому четвёртая локаль заработает
 * без правки программы. Статья вне известных корней и раздел, живущий в одной локали
 * (песочница), соседей не дают вовсе.
 */
export function путиДругихВерсий(rel, roots) {
  const place = articlePlace(rel, roots);
  if (place.locale === null) return [];

  return roots
    .filter((root) => root['род'] === place.kind && root['локаль'] !== place.locale)
    .map((root) => путьВерсии(root, place.inside));
}

/**
 * Категория статьи для ориентации в списке.
 * Сначала по пути внутри раздела, а если ни одно правило не подошло — по роду папки.
 * Обе карты приходят из настроек, в коде их держать нельзя.
 */
export function categoryOf(path, settings) {
  const place = articlePlace(path, settings['контент']);

  for (const [prefix, name] of Object.entries(settings['категорииПоПути'])) {
    if (place.inside.startsWith(prefix)) return name;
  }

  return settings['категорииПоРоду'][place.kind] ?? place.kind;
}

/** Раздел статьи: путь папок над ней. Он одинаков у всех языковых версий. */
export function sectionOf(path, settings) {
  const place = articlePlace(path, settings['контент']);
  return {kind: place.kind, path: folderChain(place.inside).join('/')};
}

/** Папки статьи внутри рода, включая её собственную. Для `lessons/walls/index.mdx` — `docs/lessons/walls`. */
function foldersOf(path, roots) {
  const place = articlePlace(path, roots);
  const parts = place.inside.split('/').filter(Boolean);
  parts.pop(); // имя файла — не папка
  return [place.kind, ...parts];
}

/**
 * Служебная страница раздела — index-файл самого раздела меню, а не статья.
 * Признак структурный: внутри её папки лежит ещё хотя бы одна статья глубже.
 * Так `guides/families/index.mdx` (над ним 20 семейств) — служебный,
 * а `guides/families/chairs/index.mdx` (глубже ничего) — обычная статья.
 */
function isSectionPage(folders, everyFolders) {
  return everyFolders.some(
    (other) => other.length > folders.length && folders.every((seg, i) => other[i] === seg),
  );
}

/**
 * Собирает файлы в статьи. На входе — список файлов с путём и названием,
 * на выходе — статьи с версиями по языкам.
 */
export function groupArticles(files, settings) {
  const roots = settings['контент'];
  const порядок = Object.keys(settings['локали']);
  const byKey = new Map();

  for (const file of files) {
    const place = articlePlace(file.path, roots);
    const key = articleKey(file.path, roots);

    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        kind: place.kind,
        наСайте: place.наСайте,
        category: categoryOf(file.path, settings),
        section: sectionOf(file.path, settings),
        folders: foldersOf(file.path, roots),
        versions: {},
      });
    }

    byKey.get(key).versions[place.locale] = {
      path: file.path,
      title: file.title,
      опубликован: file.опубликован === true,
      скрыта: file.скрыта === true,
      готовность: file.готовность ?? null,
      правил: file.правил ?? null,
      когда: file.когда ?? 0,
    };
  }

  const everyFolders = [...byKey.values()].map((article) => article.folders);
  const articles = [];

  for (const article of byKey.values()) {
    // Название берётся по порядку языков из настроек: нет первого — берём следующий.
    // Пустая шапка без названия — не название: ищем дальше, а в конце показываем путь к файлу.
    const язык = порядок.find((locale) => String(article.versions[locale]?.title ?? '').trim() !== '');
    const свой = язык === settings['основнойЯзык'];
    const любая = Object.values(article.versions)[0];
    const служебная = isSectionPage(article.folders, everyFolders);

    articles.push({
      ...article,
      title: язык ? article.versions[язык].title : (любая?.path ?? article.key),
      /** Название взято не с основного языка — значит основной версии нет. */
      titleFromOtherLocale: !свой,
      служебная,
      // У служебной страницы своя категория: она не статья, а index раздела меню.
      category: служебная ? settings['категорияСлужебной'] : article.category,
      нетНаСайте: missingOnSite(article, settings),
    });
  }

  return articles.sort((a, b) => a.title.localeCompare(b.title, settings['основнойЯзык']));
}

/**
 * Отсутствие обязательного языка — не дыра в переводах, а отсутствие статьи на сайте:
 * Docusaurus не соберёт её вовсе и промолчит. Папки вне сайта (песочница) правило не касается.
 */
export function missingOnSite(article, settings) {
  if (!article.наСайте) return false;
  return !article.versions[settings['обязательныйЯзык']];
}

/**
 * Состояние языковых версий статьи.
 * `нет` — версии не существует. `устарела` — основную правили позже этой.
 * Времена правок приходят снаружи: обращение к истории — дело адаптера, не правила.
 */
export function versionStates(article, times, settings) {
  const main = settings['основнойЯзык'];
  const mainTime = times[main] ?? 0;
  const states = {};

  for (const locale of Object.keys(settings['локали'])) {
    const version = article.versions[locale];

    if (!version) {
      states[locale] = 'нет';
      continue;
    }

    if (locale !== main && mainTime > (times[locale] ?? 0)) {
      states[locale] = 'устарела';
      continue;
    }

    states[locale] = 'есть';
  }

  return states;
}
