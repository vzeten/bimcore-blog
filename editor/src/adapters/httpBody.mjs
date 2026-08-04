// Чтение тела запроса и разделение ожидаемых ошибок от внутренних.
// Отдельный модуль, чтобы проверять правила чтения тела без запуска сервера.
// Пользовательских текстов здесь нет: они приходят из настроек, тут только коды и внутренние имена.

/**
 * Ожидаемая ошибка запроса: у неё есть код ответа и текст для человека.
 * Такую ошибку сервер отдаёт как есть (400/404/409); всё остальное — внутренняя, её текст не показываем.
 */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Читает тело запроса как JSON.
 * Битый JSON — не повод ронять сервер: это ApiError 400 с текстом из настроек.
 * Тело больше предела — тоже плохой запрос (400), чтение обрывается.
 * `тексты` = {битыйJson, слишкомБольшой, чтениеТела} — все из настроек.
 */
export function readBody(req, limitBytes, тексты) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new ApiError(400, тексты['слишкомБольшой']));
        req.destroy();
        return;
      }
      data += chunk;
    });

    req.on('end', () => {
      if (data === '') return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new ApiError(400, тексты['битыйJson']));
      }
    });

    req.on('error', () => reject(new ApiError(400, тексты['чтениеТела'])));
  });
}

/**
 * Как ответить на пойманную ошибку: ожидаемую — её кодом и текстом,
 * внутреннюю — 500 с общим текстом (стек наружу не уходит, его пишет вызывающий).
 * Возвращает {status, payload}, а не шлёт сам — чтобы правило проверялось без сервера.
 */
export function errorResponse(error, внутреннийТекст) {
  if (error instanceof ApiError) return {status: error.status, payload: {error: error.message}};
  return {status: 500, payload: {error: внутреннийТекст}};
}

/**
 * Проверяет список путей до записи. Возвращает {status, error} для первого плохого пути
 * или `null`, если все пути безопасны и существуют. Небезопасный путь — 400, отсутствующий — 404,
 * пустой список — 400. Предикаты `safe`/`exists` инъектируются, поэтому правило проверяется без диска.
 */
export function badPath(paths, safe, exists, тексты) {
  if (!Array.isArray(paths) || paths.length === 0) return {status: 400, error: тексты['плохойЗапрос']};
  for (const rel of paths) {
    // Путь неправильного типа (null, число, объект) — плохой запрос, а не повод уронить сервер:
    // без этой проверки safe/exists зовут path.join с не-строкой и бросают TypeError → 500.
    if (typeof rel !== 'string' || rel === '') return {status: 400, error: тексты['плохойЗапрос']};
    if (!safe(rel)) return {status: 400, error: тексты['неверныйАдрес']};
    if (!exists(rel)) return {status: 404, error: тексты['нетСтатьи']};
  }
  return null;
}
