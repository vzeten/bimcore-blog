import {useRef} from 'react';
import {createAutosaveQueue, type DraftPayload} from './autosaveQueue';
import type {SaveState} from './types';

export type {DraftPayload};

/**
 * Автосохранение черновика по таймеру. Настоящий `.mdx` не трогается — сервер пишет только черновик.
 * Само правило живёт в `autosaveQueue`, без React: здесь только удержание очереди между отрисовками.
 * Очередь создаётся один раз: пересоздание потеряло бы ждущую правку вместе с таймером.
 */
export function useAutosave(интервалСек: number, onState: (state: SaveState) => void) {
  const очередь = useRef<ReturnType<typeof createAutosaveQueue> | null>(null);
  // Свежие интервал и обработчик в ref: очередь создаётся один раз и иначе держала бы первые —
  // а первый интервал равен нулю, потому что настройки приходят с сервера позже первой отрисовки.
  const интервал = useRef(интервалСек);
  интервал.current = интервалСек;
  const состояние = useRef(onState);
  состояние.current = onState;

  if (очередь.current === null) {
    очередь.current = createAutosaveQueue(() => интервал.current, (state) => состояние.current(state));
  }

  return очередь.current;
}
