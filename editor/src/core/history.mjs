// Черновые снимки правок до публикации.
// Живут вне папок с контентом и в git не попадают: после публикации они не нужны,
// потому что прошлые публикации хранит сам git.

/**
 * Плоское имя из пути к статье: разделители и прочие знаки становятся подчёркиванием.
 * Одного этого мало — `docs/a_b/index.mdx` и `docs/a/b/index.mdx` дали бы одно имя,
 * и две статьи делили бы один черновик и одну папку снимков. Поэтому к имени добавляется
 * короткий отпечаток самого пути.
 */
export function плоскоеИмя(articlePath) {
  const путь = String(articlePath).split('\\').join('/');
  return `${путь.replace(/[^\wа-яё-]+/gi, '_')}__${отпечатокПути(путь)}`;
}

/** Отпечаток пути: собственный, без внешних средств, потому что правило обязано быть чистым. */
function отпечатокПути(путь) {
  let хеш = 0x811c9dc5;
  for (let i = 0; i < путь.length; i += 1) {
    хеш ^= путь.charCodeAt(i);
    хеш = Math.imul(хеш, 0x01000193) >>> 0;
  }
  return хеш.toString(16).padStart(8, '0');
}

/** Куда положить снимки версии статьи: путь к файлу превращается в имя папки. */
export function historyFolder(articlePath) {
  return плоскоеИмя(articlePath);
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
 * Версии из имён файлов снимков, по порядку времени.
 * Посторонний файл в папке истории не должен ронять ленту, поэтому отбрасывается и неразбираемое
 * имя, и разобранное с негодным временем: такая отметка встала бы в ленте неизвестно куда.
 */
export function версииИзИмён(имена) {
  return [...имена]
    .map((имя) => {
      const разобрано = parseSnapshotName(имя);
      return разобрано === null ? null : {имя, iso: разобрано.iso, author: разобрано.author};
    })
    .filter((версия) => версия !== null && настоящееВремя(версия.iso))
    .sort((a, b) => a.iso.localeCompare(b.iso));
}

/**
 * Строгая проверка времени: разобранное время должно совпасть со своей же записью обратно.
 * Одного `Date.parse` мало — он молча приводит несуществующее 30 февраля к 2 марта,
 * и отметка встала бы в ленте не там, где написано в её имени.
 */
function настоящееВремя(iso) {
  const мс = Date.parse(iso);
  return Number.isFinite(мс) && new Date(мс).toISOString() === iso;
}

/**
 * Подряд идущие сохранения одного автора — один сеанс.
 * Иначе между двумя публикациями лента превращается в сорок точек.
 * Единственный признак разрыва — смена автора: так написано в `BUSINESS.md`.
 * Разрыв по перерыву во времени был убран осознанно, причина — в `DECISIONS.md`.
 */
export function toSessions(snapshots) {
  const sessions = [];

  for (const snapshot of [...snapshots].sort((a, b) => a.iso.localeCompare(b.iso))) {
    const last = sessions.at(-1);

    if (last && last.author === snapshot.author) {
      last.to = snapshot.iso;
      last.snapshots.push(snapshot);
      continue;
    }

    sessions.push({author: snapshot.author, from: snapshot.iso, to: snapshot.iso, snapshots: [snapshot]});
  }

  return sessions;
}
