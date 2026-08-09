// Ручки работы с картинками статьи: вставка из буфера, замена файла, отдача картинки в окно.
// Вынесено из сервера, чтобы он оставался в пределах лимита размера файла (SPEC 4.9).
// Правил показа здесь нет — только файлы и ответы.

import fs from 'node:fs';
import path from 'node:path';

import {badFields} from './httpBody.mjs';
import {типКартинки} from '../core/imageType.mjs';

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

    const target = path.join(repo, path.dirname(payload.article), payload.src);
    if (!insideRepo(target) || !fs.existsSync(target)) {
      send(res, 404, {error: settings['ошибкиСервера']['нетКартинки']});
      return true;
    }
    fs.writeFileSync(target, Buffer.from(payload.base64, 'base64'));
    send(res, 200, {replaced: true});
    return true;
  }

  // Вставка картинки из буфера. Имя даёт программа: правило проекта — img-NN, только латиница.
  if (url.pathname === '/api/asset/paste' && req.method === 'POST') {
    const принято = await принятьФайл({req, res, repo, settings, тело, insideRepo, send});
    if (принято === null) return true;

    const {dir, bytes} = принято;
    const ext = (принято.payload.ext || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');

    let next = 1;
    for (const name of fs.readdirSync(dir)) {
      const found = /^img-(\d+)\./.exec(name);
      if (found) next = Math.max(next, Number(found[1]) + 1);
    }

    const номер = String(next).padStart(2, '0');
    положить(dir, `${settings['картинки']['шаблонИмени'].replace('{номер}', номер)}.${ext}`, bytes, settings, send, res);
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
    const ext = типКартинки(принято.bytes);
    if (ext === null) {
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
    res.writeHead(200, {'Content-Type': ТИПЫ[ext] || 'application/octet-stream'});
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

  // Проверяется сам файл статьи, а не только папка над ним. Иначе `docs/выдумка.mdx` положил бы
  // картинку прямо в корень раздела: папка-то есть. Картинка живёт рядом со своей статьёй (SPEC 1.3),
  // а значит статья обязана существовать.
  const файл = path.join(repo, payload.article);
  if (!insideRepo(файл) || !fs.existsSync(файл) || !fs.statSync(файл).isFile()) {
    send(res, 404, {error: settings['ошибкиСервера']['нетСтатьи']});
    return null;
  }

  const dir = path.dirname(файл);
  if (!fs.existsSync(dir)) {
    send(res, 404, {error: settings['ошибкиСервера']['нетПапкиСтатьи']});
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
