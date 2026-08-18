// Кнопка «назад» браузера: реестр — начальный экран, и «назад» возвращает к нему или к статье
// из истории, а не выходит из программы. Вынесено из окна отдельным правилом (SPEC 4.9).

import {useEffect, useRef} from 'react';

export function useHistoryBack(deps: {
  open: (path: string, push?: boolean) => Promise<void>;
  closeArticle: () => void;
}) {
  // Свежий обработчик в ref — сам слушатель ставится один раз: иначе он навсегда запомнил бы
  // самые первые переходы, у которых открытой статьи ещё не было, — и при сбое записи
  // черновика не смог бы вернуть шаг истории на статью.
  const переходыРеф = useRef<(event: PopStateEvent) => void>(() => undefined);
  переходыРеф.current = (event: PopStateEvent) => {
    const st = event.state as {вид?: string; path?: string} | null;
    if (st?.вид === 'статья' && st.path) void deps.open(st.path, false);
    else deps.closeArticle();
  };

  useEffect(() => {
    history.replaceState({вид: 'реестр'}, '');
    const назад = (event: PopStateEvent) => переходыРеф.current(event);
    window.addEventListener('popstate', назад);
    return () => window.removeEventListener('popstate', назад);
  }, []);
}
