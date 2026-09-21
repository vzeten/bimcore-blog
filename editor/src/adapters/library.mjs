// Тонкий адаптер к диску и git: обход папок, чтение статей, времена правок, файл состояния.
// Правил здесь нет — только внешний мир. Правила живут в `src/core`.

import fs from 'node:fs';
import path from 'node:path';

import {nothingChanged, readField, splitArticle} from '../core/articleFile.mjs';
import {articlePlace, isUnlisted} from '../core/frontmatterRules.mjs';
import {черновикСайта} from '../core/localeSigns.mjs';
import {этоЗаглушка} from '../core/stubText.mjs';
import {groupArticles} from '../core/articles.mjs';
import {готовностьВерсии, readState, путьФайлаСостояния, writeState} from '../core/articleState.mjs';
import {ФОРМАТ, parseGitLog, parseGitStatus} from '../core/gitLog.mjs';
import {авторПравки} from '../core/externalEdit.mjs';
import {latestSnapshot, listDrafts} from './draftStore.mjs';
import {сПорядкомМеню} from './menuPositions.mjs';
import {позицияШапки} from '../core/menuOrder.mjs';
import {датаШапки} from '../core/siteOrder.mjs';
import {версияОтличается, служебноеИмя, файлСтатьи, путьВерсии} from '../core/articles.mjs';
import {ИМЯ_КАТЕГОРИИ} from '../core/articleKind.mjs';

/**
 * Лежит ли рядом с этой версией `_category_.json`, то есть каталог — категория.
 *
 * Смотрится тот же путь во ВСЕХ корнях того же рода, а не только в своём: у переводов своего
 * `_category_.json` нет — категорию объявляет основное дерево сайта. Спроси программа только свой
 * корень, и `docs/lessons/index.mdx` был бы страницей категории, а его русский двойник — обычной
 * статьёй, хотя это одна и та же страница на двух языках.
 */
export function категорияРядом(repo, rel, settings) {
  const roots = settings['контент'];
  const место = articlePlace(rel, roots);
  if (место.kind === 'вне контента') return false;

  const внутри = место.inside.split('/').slice(0, -1).join('/');

  return roots
    .filter((root) => root['род'] === место.kind)
    .some((root) => fs.existsSync(path.join(repo, путьВерсии(root, внутри ? `${внутри}/${ИМЯ_КАТЕГОРИИ}` : ИМЯ_КАТЕГОРИИ))));
}

/** Файлы и папки с подчёркиванием и точкой — служебные: ни Docusaurus, ни программа их не читают. */
export function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (служебноеИмя(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (файлСтатьи(entry.name)) out.push(full);
  }

  return out;
}

/** Путь на диске. Само правило имени живёт в ядре и здесь не повторяется (SPEC 4.3). */
export function statePath(repo, rel, settings) {
  return path.join(repo, путьФайлаСостояния(rel, settings));
}

export function readStateRaw(repo, rel, settings) {
  const file = statePath(repo, rel, settings);

  try {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  } catch (error) {
    // Файл состояния нечитаем — например, на его месте оказалась папка. Это не повод ронять
    // весь список статей: без состояния готовность выводится из факта публикации (SPEC 4.5.2).
    console.error(error);
    return '';
  }
}

export function loadState(repo, rel, settings) {
  return readState(readStateRaw(repo, rel, settings), settings);
}

/**
 * Пути, которые уже опубликованы — то есть присутствуют в версии сайта.
 * Один запрос git на весь репозиторий: перечень дерева опубликованной ветки.
 *
 * `известна` отделяет «в ветке пусто» от «ветку прочитать не удалось». Для реестра разница
 * невелика, а для удаления решающая: сбой git не должен выдавать живую статью
 * за неопубликованную. Поэтому чтение ветки здесь одно на всю программу.
 */
export async function опубликованные(git, ref) {
  // Опубликованной ветки нет — «не известна». Ответ пустым перечнем при `известна: true` объявил бы
  // все версии никогда не публиковавшимися, а это такая же неправда, как и подмена местной веткой.
  if (!ref) return {известна: false, файлы: new Set()};

  try {
    const raw = await git.raw(['-c', 'core.quotepath=false', 'ls-tree', '-r', '--name-only', ref]);
    return {известна: true, файлы: new Set(raw.split('\n').map((line) => line.trim()).filter(Boolean))};
  } catch {
    return {известна: false, файлы: new Set()};
  }
}

/**
 * Совпадает ли версия с опубликованной веткой: путь там есть И содержимое не расходится с диском.
 * `расходится` — перечень путей, отличающихся от ветки (общий путь сравнения `расхождениеССайтом`);
 * `null` — сравнить не удалось, и тогда совпадение не доказано, а не «совпало».
 */
function совпадаетСПубликацией(rel, published, расходится) {
  if (!published.has(rel)) return false;
  return расходится instanceof Set ? !расходится.has(rel) : null;
}

/** Готовность версии. Само правило — в ядре; здесь только факты с диска и от git. */
export function readinessOf(repo, rel, settings, published, расходится = null) {
  return готовностьВерсии(
    readStateRaw(repo, rel, settings),
    совпадаетСПубликацией(rel, published, расходится),
    settings,
  );
}

export function saveState(repo, rel, settings, state) {
  fs.writeFileSync(statePath(repo, rel, settings), writeState(state), 'utf8');
}

/**
 * Кто и когда правил каждый файл. Один запуск git на весь репозиторий, а не по запуску на статью:
 * при тысяче статей поштучные запросы означают тысячу запусков.
 * Файл, изменённый прямо сейчас, свежее любого коммита — время берётся с диска.
 *
 * Автор незакоммиченной правки берётся по общему правилу (`core/externalEdit.mjs`), а не из
 * `git config user.name`: имя коммиттера по умолчанию — не доказательство, кто правил текст,
 * и такая подпись приписывала бы владельцу правки ИИ. История спрашивается только по тем путям,
 * которые действительно изменены, поэтому при тысяче статей она не читается тысячу раз.
 */
export async function editTimes(repo, git, settings) {
  const times = new Map();

  try {
    const log = await git.raw(['-c', 'core.quotepath=false', 'log', `--format=${ФОРМАТ}`, '--name-only']);
    for (const [rel, info] of parseGitLog(log)) times.set(rel, info);
  } catch {
    // Репозитория ещё нет — реестр всё равно должен открыться.
  }

  try {
    const status = await git.raw(['-c', 'core.quotepath=false', 'status', '--porcelain']);

    for (const rel of parseGitStatus(status)) {
      const file = path.join(repo, rel);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;

      const времяФайла = fs.statSync(file).mtime.toISOString();
      const правил = авторПравки({
        файлГрязный: true,
        авторКоммита: null,
        снимок: latestSnapshot(repo, settings, rel),
        времяФайла,
        неизвестный: settings['реестр']['неизвестныйАвтор'],
      });

      times.set(rel, {когда: Math.floor(Date.parse(времяФайла) / 1000), правил});
    }
  } catch {
    // Без git программа работает дальше, просто без колонки «кто правил».
  }

  return times;
}

/**
 * Все файлы статей со всем, что о них известно с диска.
 * `расходится` — пути, отличающиеся от опубликованной ветки; `null` — сравнение не удалось.
 * `веткаИзвестна` — удалось ли прочитать саму ветку: не удалось, и про публикацию версии не
 * известно НИЧЕГО, а это не то же самое, что «не публиковалась» (тем же порядком живёт
 * `publishFacts`). Обозначения локалей на такой разнице и держатся.
 * `черновики` — пути версий, чья работа лежит в подтверждённом черновике автосохранения
 * (`черновыеПравки`): для сайта это такое же неопубликованное изменение, как правка файла.
 * `вВетке` — опубликованная шапка, прочитанная у самой ветки (`шапкиВВетке`) по
 * путям, которые назвало правило: локальная шапка про сайт не отвечает.
 */
export function listFiles(repo, settings, times = new Map(), published = new Set(), расходится = null, веткаИзвестна = true, черновики = new Set(), вВетке = new Map()) {
  const items = [];
  const файлы = [];

  for (const root of settings['контент']) {
    for (const file of walk(path.join(repo, root['папка']))) {
      файлы.push({file, rel: path.relative(repo, file).split(path.sep).join('/')});
    }
  }

  // Лежит ли в папке версии (или ниже) ещё одна статья — единственный факт, который правилу
  // «что принадлежит версии» нужен с диска. В отсортированном перечне все пути одной папки идут
  // подряд, поэтому достаточно посмотреть на соседей, а не обходить весь реестр каждой версией.
  const пути = файлы.map((свой) => свой.rel).sort();
  const место = new Map(пути.map((rel, i) => [rel, i]));
  const соседВПапке = (rel) => {
    const папка = rel.replace(/[^/]*$/, '');
    const i = место.get(rel);

    return (i > 0 && пути[i - 1].startsWith(папка)) || (i + 1 < пути.length && пути[i + 1].startsWith(папка));
  };

  for (const {file, rel} of файлы) {
    const {frontmatterRaw, body} = splitArticle(fs.readFileSync(file, 'utf8'));
    const edit = times.get(rel) ?? {когда: 0, правил: null};

    items.push({
      path: rel,
      // Один факт с диска для правила вида: остальное решает ядро.
      категорияРядом: категорияРядом(repo, rel, settings),
      вКорнеРода: !articlePlace(rel, settings['контент']).inside.includes('/'),
      адресКорня: String(readField(frontmatterRaw, 'slug') ?? '').trim().replace(/^["']|["']$/g, '') === '/',
      // Пустое название не подменяется здесь: чем его заменить — правило статьи, а не адаптера.
      title: readField(frontmatterRaw, 'title'),
      скрыта: isUnlisted(frontmatterRaw),
      // Место версии в меню и дата в ленте; правила порядка — `menuOrder.mjs` и `siteOrder.mjs`.
      позиция: позицияШапки(frontmatterRaw),
      дата: датаШапки(frontmatterRaw),
      // Видимость ОПУБЛИКОВАННОЙ версии — отдельный факт от местной шапки выше, и путать их
      // нельзя: первая описывает живую страницу, вторая — то, что человек получит после
      // публикации. `null` — у ветки не спрашивали или спросить не удалось.
      скрытаВВетке: вВетке.has(rel) ? вВетке.get(rel)['скрыта'] : null,
      // Лежит ли файл в опубликованной ветке. Готовности для этого мало: её человек может
      // менять руками, а вопрос «вышла ли статья на сайт» решает только сама ветка.
      опубликован: веткаИзвестна ? published.has(rel) : null,
      // Отличие от ветки и наличие в ней — разные признаки (SPEC 4.5.2), и версия показывает
      // оба: «опубликована, но правка ещё не уехала» иначе выглядело бы как «опубликована».
      // Что считать отличием версии — правило ядра: её файл и её картинки, а не только текст.
      отличается: версияОтличается(rel, расходится, соседВПапке(rel)),
      // Работа человека, уже надёжно сохранённая программой, но ещё не в самом файле.
      // Файл и черновик — разные места хранения одной и той же неопубликованной правки
      // (решение владельца 2026-09-07), поэтому признак стоит рядом с `отличается`, а не вместо.
      правкаВЧерновике: черновики.has(rel),
      // Заглушка узнаётся тем же текстом, которым программа её и пишет (`stubText.mjs`).
      заглушка: этоЗаглушка(body, settings),
      // Черновик МЕСТНОЙ шапки — то, что человек готовит; красный цвет обещает другое, поэтому
      // рядом стоит и черновик опубликованной версии. Путать их нельзя, как и у видимости.
      черновикСайта: черновикСайта(frontmatterRaw),
      черновикВВетке: вВетке.has(rel) ? вВетке.get(rel)['черновик'] : null,
      готовность: readinessOf(repo, rel, settings, published, расходится),
      правил: edit.правил,
      когда: edit.когда,
    });
  }

  return items;
}

export function listArticles(repo, settings, times, published, расходится = null, веткаИзвестна = true, черновики = new Set(), вВетке = new Map()) {
  const файлы = listFiles(repo, settings, times, published, расходится, веткаИзвестна, черновики, вВетке);

  return сПорядкомМеню(repo, groupArticles(файлы, settings), файлы.map((файл) => файл.path), settings);
}

/**
 * Версии, чья работа уже надёжно лежит у программы, но ещё не в файле статьи: подтверждённый
 * сервером черновик автосохранения, отличающийся от файла. Ни окно, ни набранный, но не отправленный
 * текст сюда не попадают — только то, что сервер принял и положил на диск.
 *
 * Сравнение — тем же правилом, каким его делает само автосохранение: разные переводы строк
 * изменением не считаются (SPEC 3.6), иначе точка загоралась бы у файла, равного черновику.
 * Черновик без своего файла пропускается: статью удалили или переименовали, и правкой версии,
 * которой нет, он не является. Путь берётся из самого черновика, поэтому проверяется, что он
 * ведёт внутрь репозитория.
 */
export function черновыеПравки(repo, settings) {
  const пути = new Set();

  for (const draft of listDrafts(repo, settings)) {
    const rel = draft['path'];
    const file = path.resolve(repo, rel);
    if (!file.startsWith(path.resolve(repo) + path.sep) || !fs.existsSync(file)) continue;

    const текущий = splitArticle(fs.readFileSync(file, 'utf8'));
    if (!nothingChanged(текущий, {body: draft['body'], frontmatterRaw: draft['frontmatterRaw']})) пути.add(rel);
  }

  return пути;
}

/**
 * Одни ПУТИ файлов статей, без единого чтения содержимого и без git.
 *
 * Заведено ради хода публикации: полный свод (`listFiles`) открывает каждую статью, спрашивает git
 * про времена правок и читает опубликованную ветку, а публикации открытой локали читать соседний
 * перевод запрещено. Путь содержимым не является: по нему видно только, где файл лежит.
 *
 * `корни` сужают обход. Ходу публикации этого мало — «не читать содержимое соседа»: само НАЛИЧИЕ
 * его файла тоже решение о публикации менять не должно, а через признак служебной страницы раздела
 * оно его меняло. Поэтому там подаются корни только своей локали и своего рода, и чужое дерево не
 * обходится вовсе. Не подали — обход по всем корням, как для общего свода.
 */
export function путиСтатей(repo, settings, корни = settings['контент']) {
  const пути = [];

  for (const root of корни) {
    for (const file of walk(path.join(repo, root['папка']))) {
      пути.push(path.relative(repo, file).split(path.sep).join('/'));
    }
  }

  return пути;
}
