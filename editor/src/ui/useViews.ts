// Просмотры статей для реестра: один отдельный вопрос серверу при открытии реестра.
// Реестр его не ждёт: пока ответа нет или он не пришёл, в колонке прочерки, а статьи работают как всегда.

import {useEffect, useState} from 'react';
import {requestJson} from './api';

/** Числа одной статьи; месяцы — `YYYYMM` от старого к текущему, у каждого — разбивка по языкам. */
export interface ПросмотрыСтатьи {
  всего: number;
  за30: number;
  прежние30: number;
  языки: Record<string, number>;
  месяцы: {месяц: string; просмотры: number; языки: Record<string, number>}[];
}

/** Ответ сервера: числа по ключу статьи, последний день в них и надпись, если что-то не так. */
export interface Просмотры {
  статьи: Record<string, ПросмотрыСтатьи>;
  поДень: string | null;
  надпись: string | null;
}

export function useViews(): Просмотры | null {
  const [просмотры, setПросмотры] = useState<Просмотры | null>(null);

  useEffect(() => {
    let жив = true;
    requestJson<Просмотры>('/api/views')
      .then((ответ) => жив && setПросмотры(ответ))
      // Сервер не ответил — колонка остаётся с прочерками: числа не выдумываются.
      .catch(() => undefined);
    return () => {
      жив = false;
    };
  }, []);

  return просмотры;
}

/** День `YYYYMMDD` словами окна: `22.09.2026`. */
export function деньСловами(день: string, язык: string): string {
  const дата = new Date(Number(день.slice(0, 4)), Number(день.slice(4, 6)) - 1, Number(день.slice(6, 8)));
  return дата.toLocaleDateString(язык);
}

/** Месяц `YYYYMM` коротким словом: `сент. 2026`. */
export function месяцСловами(месяц: string, язык: string): string {
  const дата = new Date(Number(месяц.slice(0, 4)), Number(месяц.slice(4, 6)) - 1, 1);
  return дата.toLocaleDateString(язык, {month: 'short', year: 'numeric'});
}
