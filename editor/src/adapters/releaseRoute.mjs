// Ручки предварительного выпуска: состав файлов статьи и полная сборка сайта.
//
// **Git не трогается ничем:** ни индексом, ни коммитом, ни отправкой. Этот срез только показывает
// человеку, что уедет, и проверяет, переживёт ли это сборка сайта. Запись в git — следующий срез.
//
// Состав считается правилом ядра (`core/release.mjs`) по путям САМОЙ статьи. Широкого обхода
// рабочего дерева здесь нет намеренно: в коммит публикации не должен попасть ни один чужой файл.

import fs from 'node:fs';
import path from 'node:path';

import {articlePlace} from '../core/frontmatterRules.mjs';
import {путиДругихВерсий, файлСтатьи} from '../core/articles.mjs';
import {выпускВозможен, составВыпуска} from '../core/release.mjs';
import {причинаПадения, собратьСайт} from './siteBuild.mjs';
import {statePath} from './library.mjs';
import {badFields, badPath} from './httpBody.mjs';

/**
 * Обрабатывает `/api/release` (состав) и `/api/release/build` (полная сборка).
 * Возвращает true, если запрос был к одной из них.
 */
export async function releaseRoute({req, res, url, repo, settings, тело, insideRepo, send, запуск}) {
  const это = url.pathname === '/api/release' || url.pathname === '/api/release/build';
  if (!это || req.method !== 'POST') return false;

  const payload = await тело(req);

  const плохоеТело = badFields(payload, [], settings['ошибкиСервера']);
  if (плохоеТело) {
    send(res, плохоеТело.status, {error: плохоеТело.error});
    return true;
  }

  const rel = payload.path;
  const bad = badPath(
    [rel],
    (p) => insideRepo(path.join(repo, p)),
    (p) => fs.existsSync(path.join(repo, p)),
    settings['ошибкиСервера'],
  );
  if (bad) {
    send(res, bad.status, {error: bad.error});
    return true;
  }

  if (url.pathname === '/api/release') {
    const состав = составВыпуска({версии: версииСтатьи(repo, rel, settings)});
    send(res, 200, {path: rel, ...состав, можно: выпускВозможен(состав)});
    return true;
  }

  // Сборка запускается только тогда, когда состав доказан целиком: собирать сайт ради статьи,
  // состав которой мы не знаем, значит обещать проверку, которой не было.
  const состав = составВыпуска({версии: версииСтатьи(repo, rel, settings)});
  if (!выпускВозможен(состав)) {
    send(res, 409, {error: settings['ошибкиСервера']['составНеДоказан'], разрывы: состав.разрывы});
    return true;
  }

  const итог = await собратьСайт({repo, пределМинут: settings['сборка']['пределМинут'], запуск});

  send(res, 200, {
    path: rel,
    зелёная: итог.зелёная,
    оборвана: итог.оборвана,
    времяМс: итог.времяМс,
    причина: итог.зелёная ? '' : причинаПадения(итог.вывод),
    вывод: итог.вывод,
  });
  return true;
}

/**
 * Факты о версиях статьи для правила состава. Языки берутся правилом ядра `путиДругихВерсий`,
 * а не перечнем в коде: четвёртая локаль заработает без правки программы.
 */
function версииСтатьи(repo, rel, settings) {
  const roots = settings['контент'];

  return [rel, ...путиДругихВерсий(rel, roots)]
    .filter((путь) => fs.existsSync(path.join(repo, путь)))
    .map((путь) => {
      const папка = path.posix.dirname(путь);
      const рядом = соседи(repo, папка);
      const состояние = путьСостояния(repo, путь, settings);

      return {
        путь,
        локаль: articlePlace(путь, roots).locale,
        состояние,
        статейВПапке: рядом.filter((имя) => файлСтатьи(`${папка}/${имя}`)).length,
        файлыПапки: рядом
          .map((имя) => `${папка}/${имя}`)
          .filter((файл) => !файлСтатьи(файл) && файл !== состояние),
      };
    });
}

/** Имена файлов рядом с версией. Папки не обходятся вглубь: чужого добра туда попасть не должно. */
function соседи(repo, папка) {
  try {
    return fs.readdirSync(path.join(repo, папка), {withFileTypes: true})
      .filter((вход) => вход.isFile())
      .map((вход) => вход.name)
      .sort();
  } catch {
    return [];
  }
}

/** Путь файла состояния версии — правилом библиотеки; нет на диске, значит и в составе его нет. */
function путьСостояния(repo, rel, settings) {
  const полный = statePath(repo, rel, settings);
  if (!fs.existsSync(полный)) return null;

  return path.relative(repo, полный).split(path.sep).join('/');
}
