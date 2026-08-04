// Черновые снимки правок до публикации.
// Живут вне папок с контентом и в git не попадают: после публикации они не нужны,
// потому что прошлые публикации хранит сам git.

/** Куда положить снимки версии статьи: путь к файлу превращается в имя папки. */
export function historyFolder(articlePath) {
  return articlePath.split('\\').join('/').replace(/[^\wа-яё-]+/gi, '_');
}

/**
 * Имя снимка: время сортируется как текст, поэтому папка сама лежит по порядку.
 * Запасного имени автора здесь нет намеренно: слово для неизвестного автора живёт в настройках,
 * и умолчание в коде создало бы второй источник правды (SPEC 4.4.1).
 */
export function snapshotName(iso, author) {
  const stamp = iso.replace(/[:.]/g, '-');
  const safe = String(author).replace(/[^\wа-яё-]+/gi, '_');
  return `${stamp}__${safe}.mdx`;
}

/**
 * Свободное имя снимка. Две версии в одну и ту же миллисекунду с одним автором — редкость,
 * но затирать одну другой нельзя: это молча потерянная версия.
 * Время сдвигается на миллисекунду вперёд, пока имя не окажется свободным.
 */
export function свободноеИмя(занятые, iso, author) {
  const есть = new Set(занятые);
  let имя = snapshotName(iso, author);
  let время = Date.parse(iso);
  // Время неразбираемо — сдвигать нечего, отдаём как есть: снимок важнее красивого имени.
  if (!Number.isFinite(время)) return имя;

  while (есть.has(имя)) {
    время += 1;
    имя = snapshotName(new Date(время).toISOString(), author);
  }

  return имя;
}

/** Разбор имени снимка обратно во время и автора. */
export function parseSnapshotName(name) {
  const found = /^(.+?)__(.+)\.mdx$/.exec(name);
  if (!found) return null;

  const iso = found[1].replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    '$1T$2:$3:$4.$5Z',
  );

  return {iso, author: found[2].replace(/_/g, ' ')};
}

/**
 * Подряд идущие сохранения одного автора — один сеанс.
 * Иначе между двумя публикациями лента превращается в сорок точек.
 */
export function toSessions(snapshots, gapMinutes) {
  const sessions = [];

  for (const snapshot of [...snapshots].sort((a, b) => a.iso.localeCompare(b.iso))) {
    const last = sessions.at(-1);
    const sameAuthor = last && last.author === snapshot.author;
    const closeInTime = last
      && (Date.parse(snapshot.iso) - Date.parse(last.to)) <= gapMinutes * 60_000;

    if (sameAuthor && closeInTime) {
      last.to = snapshot.iso;
      last.snapshots.push(snapshot);
      continue;
    }

    sessions.push({author: snapshot.author, from: snapshot.iso, to: snapshot.iso, snapshots: [snapshot]});
  }

  return sessions;
}
