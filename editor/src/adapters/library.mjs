// Тонкий адаптер к диску и git: обход папок, чтение статей, времена правок, файл состояния.
// Правил здесь нет — только внешний мир. Правила живут в `src/core`.

import fs from 'node:fs';
import path from 'node:path';

import {readField, splitArticle} from '../core/articleFile.mjs';
import {isUnlisted} from '../core/frontmatterRules.mjs';
import {groupArticles} from '../core/articles.mjs';
import {initialReadiness, readState, stateFileName, writeState} from '../core/articleState.mjs';
import {ФОРМАТ, parseGitLog, parseGitStatus} from '../core/gitLog.mjs';

/** Файлы и папки с подчёркиванием и точкой — служебные: ни Docusaurus, ни программа их не читают. */
export function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.mdx') || entry.name.endsWith('.md')) out.push(full);
  }

  return out;
}

export function statePath(repo, rel, settings) {
  return path.join(repo, path.dirname(rel), stateFileName(settings));
}

export function readStateRaw(repo, rel, settings) {
  const file = statePath(repo, rel, settings);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

export function loadState(repo, rel, settings) {
  return readState(readStateRaw(repo, rel, settings), settings);
}

/**
 * Пути, которые уже опубликованы — то есть присутствуют в версии сайта.
 * Один запрос git на весь репозиторий: перечень дерева опубликованной ветки.
 */
export async function publishedFiles(git, ref) {
  try {
    const raw = await git.raw(['-c', 'core.quotepath=false', 'ls-tree', '-r', '--name-only', ref]);
    return new Set(raw.split('\n').map((line) => line.trim()).filter(Boolean));
  } catch {
    return new Set(); // ветки ещё нет — считаем, что ничего не опубликовано
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
 */
export async function editTimes(repo, git) {
  const times = new Map();

  try {
    const log = await git.raw(['-c', 'core.quotepath=false', 'log', `--format=${ФОРМАТ}`, '--name-only']);
    for (const [rel, info] of parseGitLog(log)) times.set(rel, info);
  } catch {
    // Репозитория ещё нет — реестр всё равно должен открыться.
  }

  try {
    const я = (await git.raw(['config', 'user.name'])).trim() || null;
    const status = await git.raw(['-c', 'core.quotepath=false', 'status', '--porcelain']);

    for (const rel of parseGitStatus(status)) {
      const file = path.join(repo, rel);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
      times.set(rel, {когда: Math.floor(fs.statSync(file).mtimeMs / 1000), правил: я});
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
        // Пустое название не подменяется здесь: чем его заменить — правило статьи, а не адаптера.
        title: readField(frontmatterRaw, 'title'),
        скрыта: isUnlisted(frontmatterRaw),
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
