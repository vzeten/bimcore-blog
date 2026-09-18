// Кнопка «назад» браузера и возвращение в статью после обновления страницы: реестр — начальный
// экран, и «назад» возвращает к нему или к статье из истории, а не выходит из программы.
// Вынесено из окна отдельным правилом (SPEC 4.9).

import {useEffect, useRef} from 'react';
import {восстановитьПриЗапуске, type СостояниеИстории} from './restoreOnLoad';

/**
 * Состояние записи истории на момент загрузки окна — снимается ОДИН раз при чтении модуля, до
 * первой отрисовки и до того, как программа успеет его переписать. В разработке React выполняет
 * эффекты запуска дважды, и снимок внутри эффекта второй раз уже видел бы «реестр»: статья
 * терялась бы ровно так же, как до правки (ED-039).
 */
const СОСТОЯНИЕ_ЗАПУСКА: СостояниеИстории = typeof history === 'undefined'
  ? null
  : (history.state as СостояниеИстории);

export function useHistoryBack(deps: {
  open: (path: string, push?: boolean) => Promise<unknown>;
  closeArticle: () => void;
  /** Настройки пришли: до этого открыть статью нельзя — открыватель молча ничего не сделает. */
  готовы: boolean;
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
  // Восстановление идёт один раз за жизнь окна: повторная отрисовка не открывает статью заново.
  const восстановлено = useRef(false);
  const открытьРеф = useRef(deps.open);
  открытьРеф.current = deps.open;

  useEffect(() => {
    const назад = (event: PopStateEvent) => переходыРеф.current(event);
    window.addEventListener('popstate', назад);
    return () => window.removeEventListener('popstate', назад);
  }, []);

  useEffect(() => {
    if (!deps.готовы || восстановлено.current) return;
    восстановлено.current = true;

    void восстановитьПриЗапуске({
      состояние: СОСТОЯНИЕ_ЗАПУСКА,
      // Без нового шага истории: запись уже описывает эту статью, а второй шаг сломал бы «назад».
      открыть: async (path) => (await открытьРеф.current(path, false)) === true,
      поставитьРеестр: () => history.replaceState({вид: 'реестр'}, ''),
    });
  }, [deps.готовы]);
}
