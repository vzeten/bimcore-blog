// Ручки работы с картинками статьи: вставка из буфера, замена файла, отдача картинки в окно.
// Вынесено из сервера, чтобы он оставался в пределах лимита размера файла (SPEC 4.9).
// Правил показа здесь нет — только файлы и ответы.

import fs from 'node:fs';
import path from 'node:path';

import {badFields} from './httpBody.mjs';
import {записатьПоверх, папкаСтатьи, цельВнутриСтатьи} from './assetGuards.mjs';
import {обложкойМожно, теломМожно, типКартинки} from '../core/imageType.mjs';

/** Какие картинки умеет отдавать программа. Типы чужого формата, а не наша настройка. */
const ТИПЫ = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

/**
 * Обрабатывает запросы `/api/asset*`. Возвращает true, если запрос её.
 * Зависимости приходят снаружи: сервер знает про репозиторий и настройки, модуль — нет.
 */
export async function assetRoute({req, res, url, repo, settings, тело, insideRepo, send}) {
  // Замена файла картинки: имя остаётся прежним, поэтому все ссылки на неё продолжают работать.
  if (url.pathname === '/api/asset/replace' && req.method === 'POST') {
    const payload = await тело(req);
    // Поля проверяем ДО path.join и Buffer.from: иначе не-строка роняет их с TypeError,
    // и человек получает внутреннюю ошибку вместо понятного «неверный запрос».
    const плохо = badFields(payload, ['article', 'src', 'base64'], settings['ошибкиСервера']);
    if (плохо) {
      send(res, плохо.status, {error: плохо.error});
      return true;
    }

    // Статья обязана существовать и быть файлом — то же правило, что у вставки (`принятьФайл`).
    const dir = папкаСтатьи(repo, payload.article, insideRepo);
    if (dir === null) {
      send(res, 404, {error: settings['ошибкиСервера']['нетСтатьи']});
      return true;
    }

    // Путь картинки обязан остаться внутри папки статьи: `..`, абсолютный, `/static/...` или
    // ссылка-папка в середине пути заменили бы файл чужой статьи или общий файл сайта.
    const место = цельВнутриСтатьи(dir, payload.src);
    if (место === null) {
      send(res, 400, {error: settings['ошибкиСервера']['картинкаВнеСтатьи']});
      return true;
    }
    if (!место.есть) {
      send(res, 404, {error: settings['ошибкиСервера']['нетКартинки']});
      return true;
    }
    const target = место.target;

    // Заменять можно любую картинку тела статьи — JPG, PNG и GIF (решение владельца 2026-08-18).
    // Прежнее «GIF только на GIF» снято им же: файл не перекодируется, и анимация нового GIF
    // остаётся его собственной.
    const цель = path.extname(target).slice(1).toLowerCase().replace('jpeg', 'jpg');
    if (!теломМожно(цель)) {
      send(res, 400, {error: settings['ошибкиСервера']['заменаТолькоКартинок']});
      return true;
    }

    // Формат решают байты нового файла, а не его имя: смена формата под старым именем
    // (JPEG в файле `.png`) — это уже не замена, а порча ссылки на будущее.
    const bytes = Buffer.from(payload.base64, 'base64');
    if (типКартинки(bytes) !== цель) {
      send(res, 400, {error: settings['ошибкиСервера']['неТотФормат']});
      return true;
    }

    записатьПоверх(repo, target, bytes);
    send(res, 200, {
      replaced: true,
      тяжёлая: bytes.length > settings['картинки']['максимумКилобайт'] * 1024,
      килобайт: Math.round(bytes.length / 1024),
    });
    return true;
  }

  // Обложка статьи. Отдельная ручка, а не признак у вставки: забытый признак молча дал бы
  // обложке имя картинки тела (`img-NN`) и пропустил бы проверку типа. Имя постоянное —
  // `cover.png` или `cover.jpg`, поэтому повторная загрузка заменяет файл того же типа,
  // а прежний файл другого расширения остаётся: он может стоять в теле статьи.
  if (url.pathname === '/api/asset/cover' && req.method === 'POST') {
    const принято = await принятьФайл({req, res, repo, settings, тело, insideRepo, send});
    if (принято === null) return true;

    // Тип решает содержимое файла: имя переименовывается одним движением, а тип от браузера
    // взят из того же имени. Чужой формат в обложке роняет сборку сайта уже после публикации.
    // Обложкой могут быть только PNG и JPG: программа знает и GIF, но он законен лишь в теле
    // статьи, и одного списка типов в окне выбора мало — окно ручку не сторожит.
    const ext = типКартинки(принято.bytes);
    if (ext === null || !обложкойМожно(ext)) {
      send(res, 400, {error: settings['ошибкиСервера']['неверныйТипОбложки']});
      return true;
    }

    положить(принято.dir, `${settings['картинки']['имяОбложки']}.${ext}`, принято.bytes, settings, send, res);
    return true;
  }

  if (url.pathname === '/api/asset') {
    const article = url.searchParams.get('article') || '';
    const src = url.searchParams.get('src') || '';
    const base = src.startsWith('/')
      ? path.join(repo, 'static', src)
      : path.join(repo, path.dirname(article), src);

    if (!insideRepo(base) || !fs.existsSync(base)) {
      send(res, 404, {error: settings['ошибкиСервера']['нетФайла']});
      return true;
    }

    const ext = path.extname(base).slice(1).toLowerCase();
    // `no-cache`: после замены файла под тем же именем браузер обязан спросить сервер заново,
    // иначе после перезапуска программы он показывал бы прежнюю картинку из кэша.
    res.writeHead(200, {'Content-Type': ТИПЫ[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
    res.end(fs.readFileSync(base));
    return true;
  }

  return false;
}

/**
 * Общая часть загрузки картинки: проверить поля, найти папку статьи, раскодировать байты.
 * `null` — ответ человеку уже отправлен, дальше идти нельзя.
 *
 * Одно место на вставку в тело и на обложку: разойдись эти проверки, одна из дорог однажды
 * осталась бы без проверки папки — и файл лёг бы мимо репозитория.
 */
async function принятьФайл({req, res, repo, settings, тело, insideRepo, send}) {
  const payload = await тело(req);
  // Поля проверяем ДО path.join и Buffer.from: не-строка роняет их с TypeError,
  // и человек получает внутреннюю ошибку вместо понятного «неверный запрос».
  const плохо = badFields(payload, ['article', 'base64'], settings['ошибкиСервера']);
  if (плохо) {
    send(res, плохо.status, {error: плохо.error});
    return null;
  }

  // Папка берётся тем же заслоном, что у замены и у вставки: проверяется сам файл статьи (иначе
  // `docs/выдумка.mdx` положил бы обложку прямо в корень раздела — папка-то есть) и настоящий
  // путь папки, потому что ссылка-папка в середине увела бы запись за пределы репозитория.
  const dir = папкаСтатьи(repo, payload.article, insideRepo);
  if (dir === null) {
    send(res, 404, {error: settings['ошибкиСервера']['нетСтатьи']});
    return null;
  }

  return {payload, dir, bytes: Buffer.from(payload.base64, 'base64')};
}

/** Записать файл в папку статьи и ответить путём, которым на него надо ссылаться. */
function положить(dir, name, bytes, settings, send, res) {
  fs.writeFileSync(path.join(dir, name), bytes);

  send(res, 200, {
    src: `./${name}`,
    // Тяжёлый файл — предупреждение, а не отказ: картинка уже на месте, решает человек.
    тяжёлая: bytes.length > settings['картинки']['максимумКилобайт'] * 1024,
    килобайт: Math.round(bytes.length / 1024),
  });
}
