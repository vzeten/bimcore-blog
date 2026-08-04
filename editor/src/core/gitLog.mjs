// Кто и когда правил файл в последний раз — из одного вывода git на весь репозиторий.
// Спрашивать git про каждую статью отдельно нельзя: при тысяче статей это тысяча запусков.

/** Разделители строк вывода. Это внутренний договор с git, а не настройка. */
export const ФОРМАТ = '@%ct|%an';

/**
 * Разбор вывода `git log --name-only`. Первая встреча пути — самая свежая правка,
 * потому что git выдаёт коммиты от новых к старым.
 */
export function parseGitLog(raw) {
  const last = new Map();
  let когда = 0;
  let правил = null;

  for (const line of String(raw ?? '').split('\n')) {
    const text = line.trim();
    if (text === '') continue;

    if (text.startsWith('@')) {
      const [stamp, author] = text.slice(1).split('|');
      когда = Number(stamp) || 0;
      правил = author || null;
      continue;
    }

    if (!last.has(text)) last.set(text, {когда, правил});
  }

  return last;
}

/** Пути, изменённые прямо сейчас и ещё не в git. Разбор вывода `git status --porcelain`. */
export function parseGitStatus(raw) {
  const paths = new Set();

  for (const line of String(raw ?? '').split('\n')) {
    if (line.trim() === '') continue;
    const path = line.slice(3).trim();
    // Переименование пишется как «было -> стало»: важна вторая часть.
    paths.add(path.includes(' -> ') ? path.split(' -> ')[1] : path);
  }

  return paths;
}
