// Единственная дверь интерфейса к серверу. Ни один fetch в UI не идёт мимо неё.
// Задача: не дать интерфейсу счесть действие успешным, пока сервер явно не ответил успехом.
import {label} from './labels';

/**
 * Запрос к серверу с честной обработкой ошибок:
 * - сеть недоступна → понятная ошибка;
 * - ответ не «успех» → берём текст из {error} сервера, иначе общий текст;
 * - тело не JSON → тоже ошибка, а не молчаливый успех.
 * На успехе возвращает разобранный JSON, иначе бросает Error с текстом для человека.
 */
export async function requestJson<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    // Запрос прервали намеренно (например автосохранение отменили ради кнопки «Сохранить») —
    // это не сбой сети, и показывать человеку нечего.
    if ((error as {name?: string})?.name === 'AbortError') throw Object.assign(new Error(''), {прервано: true});
    throw new Error(label('ошибкаСети'));
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const тело = data as {error?: unknown; конфликт?: boolean};
    const текст = typeof тело?.error === 'string' ? тело.error : label('ошибкаЗапроса');
    const ошибка = new Error(текст);
    // Признак конфликта и данные ответа доносим до вызывающего: по ним он предложит выбор,
    // а не просто покажет сообщение. Текст ошибки при этом остаётся человеческим.
    Object.assign(ошибка, {статус: response.status, конфликт: тело?.конфликт === true, ответ: data});
    throw ошибка;
  }

  return data as T;
}
