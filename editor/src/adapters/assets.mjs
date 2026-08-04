// Ручки работы с картинками статьи: вставка из буфера, замена файла, отдача картинки в окно.
// Вынесено из сервера, чтобы он оставался в пределах лимита размера файла (SPEC 4.9).
// Правил показа здесь нет — только файлы и ответы.

import fs from 'node:fs';
import path from 'node:path';

import {badFields} from './httpBody.mjs';

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
    const payload = await тело(req);
    const плохо = badFields(payload, ['article', 'base64'], settings['ошибкиСервера']);
    if (плохо) {
      send(res, плохо.status, {error: плохо.error});
      return true;
    }

    const dir = path.join(repo, path.dirname(payload.article));
    if (!insideRepo(dir) || !fs.existsSync(dir)) {
      send(res, 404, {error: settings['ошибкиСервера']['нетПапкиСтатьи']});
      return true;
    }

    const bytes = Buffer.from(payload.base64, 'base64');
    const limit = settings['картинки']['максимумКилобайт'] * 1024;
    const ext = (payload.ext || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');

    let next = 1;
    for (const name of fs.readdirSync(dir)) {
      const found = /^img-(\d+)\./.exec(name);
      if (found) next = Math.max(next, Number(found[1]) + 1);
    }

    const name = `${settings['картинки']['шаблонИмени'].replace('{номер}', String(next).padStart(2, '0'))}.${ext}`;
    fs.writeFileSync(path.join(dir, name), bytes);

    send(res, 200, {
      src: `./${name}`,
      тяжёлая: bytes.length > limit,
      килобайт: Math.round(bytes.length / 1024),
    });
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
