// Ручка смены формата картинки (JPG ↔ PNG): новый файл под тем же именем с новым расширением
// и обновлённая ссылка в статье — одной операцией (слово владельца 2026-08-17).
//
// Операция трогает сразу два файла — картинку и статью, — поэтому порядок шагов жёсткий, у каждого
// шага назван откат, а текст статьи сверяется отпечатком: править файл, разошедшийся с окном,
// значило бы заменить не то место.

import fs from 'node:fs';
import path from 'node:path';

import {badFields} from './httpBody.mjs';
import {записатьНовый, записатьПоверх, папкаСтатьи, цельВнутриСтатьи} from './assetGuards.mjs';
import {fingerprint} from './draftStore.mjs';
import {типКартинки} from '../core/imageType.mjs';
import {адресНовогоФормата, заменитьВхождение, файлИспользуется} from '../core/imageFormat.mjs';

/**
 * Статьи, над которыми операция уже идёт: вторая параллельная замена по той же статье устроила бы
 * гонку «последняя запись против последнего ответа» на двух файлах сразу.
 */
const занятые = new Set();

/** Обрабатывает POST `/api/asset/reformat`. Возвращает true, если запрос её. */
export async function assetReformatRoute({req, res, url, repo, settings, тело, insideRepo, send}) {
  if (url.pathname !== '/api/asset/reformat' || req.method !== 'POST') return false;

  const payload = await тело(req);
  const плохо = badFields(payload, ['article', 'src', 'узел', 'base64', 'отпечаток'], settings['ошибкиСервера']);
  if (плохо || !Number.isInteger(payload.номер) || payload.номер < 1) {
    send(res, плохо?.status ?? 400, {error: плохо?.error ?? settings['ошибкиСервера']['плохойЗапрос']});
    return true;
  }

  if (занятые.has(payload.article)) {
    send(res, 409, {error: settings['ошибкиСервера']['операцияИдёт']});
    return true;
  }
  занятые.add(payload.article);
  try {
    сменить({payload, repo, settings, insideRepo, send, res});
  } finally {
    занятые.delete(payload.article);
  }

  return true;
}

function сменить({payload, repo, settings, insideRepo, send, res}) {
  const ошибки = settings['ошибкиСервера'];
  const dir = папкаСтатьи(repo, payload.article, insideRepo);
  if (dir === null) return send(res, 404, {error: ошибки['нетСтатьи']});

  const место = цельВнутриСтатьи(dir, payload.src);
  if (место === null) return send(res, 400, {error: ошибки['картинкаВнеСтатьи']});
  if (!место.есть) return send(res, 404, {error: ошибки['нетКартинки']});

  // Обе стороны операции обязаны быть JPG или PNG: GIF и прочие форматы в пробу не входят.
  // Новый формат сверяется с перечнем явно, а не только с null: опора на то, что `типКартинки`
  // других форматов не знает, сломалась бы молча в день, когда его научат новому.
  const старое = path.extname(место.target).slice(1).toLowerCase().replace('jpeg', 'jpg');
  const bytes = Buffer.from(payload.base64, 'base64');
  const новое = типКартинки(bytes);
  if ((старое !== 'jpg' && старое !== 'png') || (новое !== 'jpg' && новое !== 'png')) {
    send(res, 400, {error: ошибки['заменаТолькоJpgPng']});
    return;
  }
  // Формат не сменился — это обычная замена, и у неё своя ручка со своими заслонами.
  if (новое === старое) return send(res, 400, {error: ошибки['плохойЗапрос']});

  // Узел обязан быть картинкой с этим адресом: `![...](старый адрес ...`. Правка любого другого
  // текста этой ручке не принадлежит.
  const узел = payload.узел;
  if (!узел.startsWith('![') || !узел.includes(`](${payload.src}`)) {
    send(res, 400, {error: ошибки['плохойЗапрос']});
    return;
  }

  // Текст статьи на диске обязан быть ровно тем, который видело окно: иначе номер вхождения
  // посчитан по одному тексту, а правится другой.
  const текст = fs.readFileSync(path.join(repo, payload.article), 'utf8');
  if (fingerprint(текст) !== payload.отпечаток) {
    send(res, 409, {error: ошибки['текстНеСовпал']});
    return;
  }

  const новыйSrc = адресНовогоФормата(payload.src, новое);
  if (новыйSrc === null) return send(res, 400, {error: ошибки['плохойЗапрос']});
  const новыйФайл = path.resolve(dir, новыйSrc);

  const новыйУзел = узел.replace(`](${payload.src}`, `](${новыйSrc}`);
  const новыйТекст = заменитьВхождение(текст, узел, payload.номер, новыйУзел);
  if (новыйТекст === null) return send(res, 409, {error: ошибки['вхождениеНеНайдено']});

  // Шаг 1: новый файл картинки. Занятый адрес — отказ той же операцией записи, без щели
  // между проверкой и записью: молча перезаписывать существующий файл нельзя.
  if (!записатьНовый(repo, новыйФайл, bytes)) {
    send(res, 409, {error: ошибки['адресЗанят']});
    return;
  }

  // Шаг 2: файл статьи, атомарно (та же запись через служебную папку, что и у замены байтов).
  // Сбой — новый файл картинки убирается, статья не тронута.
  try {
    записатьПоверх(repo, path.join(repo, payload.article), Buffer.from(новыйТекст, 'utf8'));
  } catch (ошибка) {
    fs.rmSync(новыйФайл, {force: true});
    throw ошибка;
  }

  // Шаг 3: старый файл уходит, только если на него не осталось ни одной ссылки — считая шапку
  // (обложку) и вторые вхождения. Ищется имя файла: любая форма записи адреса его содержит.
  // Сбой удаления операцию не отменяет: статья уже верна, но причина остатка называется своим
  // словом — «на него ссылаются» и «убрать не удалось» для человека разные ответы.
  let старыйОставлен = null;
  if (файлИспользуется(новыйТекст, path.basename(payload.src))) {
    старыйОставлен = 'ссылки';
  } else {
    try {
      fs.rmSync(место.target);
    } catch {
      старыйОставлен = 'сбой';
    }
  }

  send(res, 200, {
    reformatted: true,
    новыйSrc,
    отпечаток: fingerprint(новыйТекст),
    старыйОставлен,
    тяжёлая: bytes.length > settings['картинки']['максимумКилобайт'] * 1024,
    килобайт: Math.round(bytes.length / 1024),
  });
}
