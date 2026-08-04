// Тонкий адаптер к git по одному файлу: содержимое из ветки, признак незакоммиченного, автор коммита.
// Вынесено из сервера, чтобы он оставался в пределах лимита размера файла (SPEC 4.9).
// Правил здесь нет — только внешний мир; правило авторства живёт в `core/externalEdit.mjs`.

import {parseGitStatus} from '../core/gitLog.mjs';

/**
 * Какая ветка считается опубликованной. Нет связи с сервером или удалённой ветки —
 * программа обязана работать дальше, просто сравнивая с текущим состоянием репозитория.
 */
export async function detectPublishedRef(git) {
  try {
    await git.revparse(['--verify', 'origin/main']);
    return 'origin/main';
  } catch {
    return 'HEAD';
  }
}

/** Содержимое файла в ветке. Файла там нет (новая статья) — `null`, а не ошибка. */
export async function showFile(git, ref, rel) {
  try {
    return await git.show([`${ref}:${rel}`]);
  } catch {
    return null;
  }
}

/**
 * Имя человека за клавиатурой — для подписи снимка, который делает сам редактор.
 * Это не догадка об авторе чужой правки (так делать запрещено, см. `DECISIONS.md`):
 * здесь известно, что файл пишем мы, и остаётся только узнать, как зовут того, кто работает.
 */
export async function gitAuthor(git) {
  try {
    return (await git.raw(['config', 'user.name'])).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Что git знает про один путь: изменён ли он без коммита и кто автор последнего коммита.
 * Git недоступен — считаем файл незакоммиченным без автора: выдумывать подпись хуже, чем её не иметь.
 * Лог спрашивается только у чистого файла: у грязного он всё равно ничего не доказывает.
 */
export async function gitFacts(git, rel) {
  let грязный;

  try {
    const status = await git.raw(['-c', 'core.quotepath=false', 'status', '--porcelain', '--', rel]);
    грязный = parseGitStatus(status).size > 0;
  } catch {
    return {грязный: true, авторКоммита: null};
  }

  if (грязный) return {грязный, авторКоммита: null};

  try {
    return {грязный, авторКоммита: (await git.raw(['log', '-1', '--format=%an', '--', rel])).trim() || null};
  } catch {
    return {грязный, авторКоммита: null};
  }
}
