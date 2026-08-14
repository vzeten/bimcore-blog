// Тонкий адаптер к диску и git: обход папок, чтение статей, времена правок, файл состояния.
// Правил здесь нет — только внешний мир. Правила живут в `src/core`.

import fs from 'node:fs';
import path from 'node:path';

import {readField, splitArticle} from '../core/articleFile.mjs';
import {isUnlisted} from '../core/frontmatterRules.mjs';
import {groupArticles} from '../core/articles.mjs';
import {initialReadiness, readState, путьФайлаСостояния, writeState} from '../core/articleState.mjs';
import {ФОРМАТ, parseGitLog, parseGitStatus} from '../core/gitLog.mjs';
import {авторПравки} from '../core/externalEdit.mjs';
import {latestSnapshot} from './draftStore.mjs';
import {файлСтатьи, путьВерсии} from '../core/articles.mjs';
import {ИМЯ_КАТЕГОРИИ} from '../core/articleKind.mjs';
import {articlePlace} from '../core/frontmatterRules.mjs';

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
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
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
  try {
    const raw = await git.raw(['-c', 'core.quotepath=false', 'ls-tree', '-r', '--name-only', ref]);
    return {известна: true, файлы: new Set(raw.split('\n').map((line) => line.trim()).filter(Boolean))};
  } catch {
    return {известна: false, файлы: new Set()};
  }
}

/**
 * Готовность версии. Свой файл состояния главнее всего.
 * Файла нет — готовность выводится из факта публикации, а не назначается «Черновик» вслепую.
 */
export function readinessOf(repo, rel, settings, published) {
  const raw = readStateRaw(repo, rel, settings);
  if (raw.trim() !== '') return readState(raw, settings)['готовность'];
  return initialReadiness(published.has(rel), settings);
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
export async function editTimes(repo, git, editorDir, settings) {
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
        снимок: latestSnapshot(editorDir, settings, rel),
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

/** Все файлы статей со всем, что о них известно с диска. */
export function listFiles(repo, settings, times = new Map(), published = new Set()) {
  const items = [];

  for (const root of settings['контент']) {
    for (const file of walk(path.join(repo, root['папка']))) {
      const rel = path.relative(repo, file).split(path.sep).join('/');
      const {frontmatterRaw} = splitArticle(fs.readFileSync(file, 'utf8'));
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
        // Лежит ли файл в опубликованной ветке. Готовности для этого мало: её человек может
        // менять руками, а вопрос «вышла ли статья на сайт» решает только сама ветка.
        опубликован: published.has(rel),
        готовность: readinessOf(repo, rel, settings, published),
        правил: edit.правил,
        когда: edit.когда,
      });
    }
  }

  return items;
}

export function listArticles(repo, settings, times, published) {
  return groupArticles(listFiles(repo, settings, times, published), settings);
}
