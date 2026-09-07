import {useRef} from 'react';
import {createAutosaveQueue, type DraftPayload} from './autosaveQueue';
import {записьПодтверждена} from './localeFacts';
import type {SaveState} from './types';

export type {DraftPayload};

/**
 * Автосохранение черновика по таймеру. Настоящий `.mdx` не трогается — сервер пишет только черновик.
 * Само правило живёт в `autosaveQueue`, без React: здесь только удержание очереди между отрисовками.
 * Очередь создаётся один раз: пересоздание потеряло бы ждущую правку вместе с таймером.
 *
 * `послеЗаписи` — что делать, когда сервер подтвердил запись. Ставит его переход окна
 * (`useNavigation`), потому что перечитывание свода живёт там; здесь только место для него: очередь
 * создаётся раньше, чем появляется само перечитывание.
 */
export function useAutosave(интервалСек: number, onState: (state: SaveState) => void) {
  const очередь = useRef<ReturnType<typeof createAutosaveQueue> | null>(null);
  const послеЗаписи = useRef<() => void>(() => {});
  // Свежие интервал и обработчик в ref: очередь создаётся один раз и иначе держала бы первые —
  // а первый интервал равен нулю, потому что настройки приходят с сервера позже первой отрисовки.
  const интервал = useRef(интервалСек);
  интервал.current = интервалСек;
  const состояние = useRef(onState);
  состояние.current = onState;

  if (очередь.current === null) {
    очередь.current = createAutosaveQueue(() => интервал.current, (state) => {
      состояние.current(state);
      // Сервер принял запись — признаки версий на диске могли стать другими, и окно перечитывает
      // их само. Ошибку и ещё не сохранённый текст сюда не пускает `записьПодтверждена`.
      if (записьПодтверждена(state)) послеЗаписи.current();
    });
  }

  return {...очередь.current, послеЗаписи};
}
