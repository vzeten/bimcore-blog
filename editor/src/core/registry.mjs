// Реестр статей: дерево разделов, отбор и сортировка.
// Чистые функции: на входе статьи, на выходе то, что показать. Интерфейс правил не знает.

/** Узел, к которому относится статья: род и путь папок над ней. */
export function nodeId(article) {
  return article.section.path === '' ? article.section.kind : `${article.section.kind}/${article.section.path}`;
}

/** Все узлы от корня до статьи: `docs`, `docs/guides`, `docs/guides/families`. */
export function nodeChain(article) {
  const parts = nodeId(article).split('/');
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

/**
 * Дерево разделов со счётчиками. Строится только из существующих статей:
 * пустых веток не бывает, потому что показывать в них нечего.
 * Счётчик считает статьи, а не файлы: три языка одной статьи — одна строка.
 */
export function buildTree(articles, settings) {
  const counts = new Map();

  for (const article of articles) {
    for (const id of nodeChain(article)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const nodes = new Map();

  for (const id of [...counts.keys()].sort()) {
    const parts = id.split('/');
    // Понятное имя раздела — из настроек. Нет записи — показываем имя папки как есть,
    // чтобы дерево не оставалось пустым, а не выдумываем перевод.
    const label = settings['названияРазделов'][id] ?? parts[parts.length - 1];

    nodes.set(id, {id, label, depth: parts.length - 1, count: counts.get(id)});
  }

  return [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Разделы, в которых можно завести статью. Это ровно те узлы, что видны в дереве реестра:
 * второго способа понимать разделы в программе нет, иначе форма создания предлагала бы места,
 * которых в дереве не существует, а сервер потом отказывал бы.
 *
 * Новых разделов отсюда не появляется: пустой раздел роняет сборку сайта и требует заглушки,
 * его создание — отдельное задание (В3-04).
 */
export function разделыДляСоздания(articles, settings) {
  return buildTree(articles, settings).map(({id, label, depth}) => ({id, label, depth}));
}

/**
 * В каких языках этот раздел существует по-настоящему: где в нём или ниже уже лежат статьи.
 *
 * Раздел — понятие сайта, а не одной локали: `docs/help` может быть заполнен по-английски
 * и пуст по-русски. Сервер отказывается создавать статью в пустой папке раздела (пустой раздел
 * роняет сборку), поэтому окно обязано считать доступность тем же признаком «внутри есть статьи».
 */
export function локалиРаздела(articles, раздел) {
  const свои = new Set();

  for (const article of articles) {
    if (!nodeChain(article).includes(раздел)) continue;
    for (const код of Object.keys(article.versions ?? {})) свои.add(код);
  }

  return [...свои];
}

/** Готовность статьи целиком: значение основной версии, а если версии разошлись — это видно отдельно. */
export function readinessOf(article, settings) {
  const versions = Object.values(article.versions);
  const own = article.versions[settings['основнойЯзык']] ?? versions[0];
  const values = versions.map((version) => version.готовность).filter(Boolean);

  return {
    значение: own?.готовность ?? null,
    разное: new Set(values).size > 1,
  };
}

/** Видимость статьи целиком. Скрыта хотя бы одна версия, но не все — версии разошлись. */
export function visibilityOf(article) {
  const versions = Object.values(article.versions);
  const hidden = versions.filter((version) => version.скрыта).length;

  return {скрыта: hidden > 0 && hidden === versions.length, разное: hidden > 0 && hidden < versions.length};
}

/** Кто и когда правил статью в последний раз — по самой свежей из её версий. */
export function lastEditOf(article) {
  const versions = Object.values(article.versions).filter((version) => version.когда > 0);
  if (versions.length === 0) return {правил: null, когда: 0};

  return versions.reduce((late, version) => (version.когда > late.когда ? version : late));
}

/** Отбор и поиск действуют вместе: сначала раздел, потом признаки, потом строка поиска. */
export function filterArticles(articles, filters, settings) {
  const запрос = String(filters.запрос ?? '').trim().toLowerCase();

  return articles.filter((article) => {
    if (filters.раздел && !nodeChain(article).includes(filters.раздел)) return false;

    if (filters.готовность && readinessOf(article, settings).значение !== filters.готовность) return false;

    if (filters.переводы === 'толькоДыры') {
      const всего = Object.keys(settings['локали']).length;
      if (Object.keys(article.versions).length === всего) return false;
    }

    if (filters.переводы === 'нетНаСайте' && !article.нетНаСайте) return false;

    if (запрос === '') return true;

    const названия = [article.title, ...Object.values(article.versions).map((version) => version.title)];
    return названия.some((name) => String(name).toLowerCase().includes(запрос));
  });
}

/**
 * Сортировка по колонке. Пустые значения всегда уходят вниз, в обе стороны:
 * иначе половина таблицы — это пустые клетки сверху.
 */
export function sortArticles(articles, column, direction, settings) {
  const знак = direction === 'вниз' ? -1 : 1;

  // Отсутствие значения всегда приводится к null: ноль и «минус первый» — это тоже «пусто»,
  // а не самое маленькое число. Иначе статьи без даты правки встают первыми.
  const value = (article) => {
    if (column === 'категория') return article.category;
    if (column === 'переводы') return Object.keys(article.versions).length;
    if (column === 'готовность') {
      const место = settings['статусы'].indexOf(readinessOf(article, settings).значение);
      return место === -1 ? null : место;
    }
    if (column === 'видимость') return visibilityOf(article).скрыта ? 1 : 0;
    if (column === 'автор') return lastEditOf(article).правил;
    if (column === 'когда') return lastEditOf(article).когда || null;
    return article.title;
  };

  const пусто = (item) => item === null || item === undefined || item === '';

  return [...articles].sort((a, b) => {
    const one = value(a);
    const two = value(b);

    if (пусто(one) && пусто(two)) return 0;
    if (пусто(one)) return 1;
    if (пусто(two)) return -1;

    if (typeof one === 'number' && typeof two === 'number') return (one - two) * знак;

    return String(one).localeCompare(String(two), settings['основнойЯзык']) * знак;
  });
}
