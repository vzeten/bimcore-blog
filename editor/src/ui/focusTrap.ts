// Захват фокуса окном вопроса поверх программы (удаление, публикация). Пока окно открыто, `Tab` и
// `Shift+Tab` ходят только по его кнопкам: иначе фокус уходил в редактор под окном, и набор попадал в
// текст статьи, которую как раз удаляют или публикуют (замечание контролёра этапа 1).
//
// Правило обхода — чистая функция (`следующийФокус`): его проверяет машина, а крючок только
// подключает его к клавиатуре.

import {useEffect, useRef, type KeyboardEvent, type RefObject} from 'react';

/** Что в окне может получить фокус: доступные кнопки, поля и ссылки. */
const ФОКУСИРУЕМЫЕ = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])';

/**
 * Куда уходит фокус по `Tab`: следующий по кругу внутри окна, а с последнего — на первый (и обратно
 * при `Shift`). Фокус вне окна возвращается на первый (или последний). Пусто — `null`: фокусу
 * некуда встать, и `Tab` просто гасится.
 */
export function следующийФокус<Т>(список: Т[], текущий: Т | null, назад: boolean): Т | null {
  if (список.length === 0) return null;
  const где = текущий === null ? -1 : список.indexOf(текущий);
  if (где < 0) return назад ? список[список.length - 1] : список[0];
  const шаг = назад ? -1 : 1;
  return список[(где + шаг + список.length) % список.length];
}

/**
 * Захват фокуса. `начальный` — куда встать при открытии (обычно «Отмена»: безопасный ответ). Возвращает
 * ссылку на корень окна и обработчик клавиш; `Escape` зовущий обрабатывает сам. Закрытие возвращает
 * фокус туда, где он был до окна.
 */
export function useFocusTrap(начальный?: RefObject<HTMLElement | null>) {
  const окно = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const прежний = document.activeElement as HTMLElement | null;
    const первый = окно.current?.querySelector<HTMLElement>(ФОКУСИРУЕМЫЕ) ?? null;
    (начальный?.current ?? первый)?.focus();
    return () => прежний?.focus?.();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Tab' || окно.current === null) return;
    const список = [...окно.current.querySelectorAll<HTMLElement>(ФОКУСИРУЕМЫЕ)];
    const куда = следующийФокус(список, document.activeElement as HTMLElement | null, event.shiftKey);
    event.preventDefault();
    куда?.focus();
  };

  return {окно, onKeyDown};
}
