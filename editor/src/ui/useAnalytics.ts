// Окно аналитики (ED-054, операция 2): вопросы серверу и их типы. Окно ничего не пишет — только читает.

import {useEffect, useState} from 'react';
import {requestJson} from './api';

export type Охват = string;
export type Шаг = 'день' | 'неделя' | 'месяц';

export interface Точка {
  начало: string;
  показы: number;
  переходы: number;
  позиция: number | null;
  /** Те же числа по языкам: части в сумме дают ровно точку. */
  языки: Record<string, {показы: number; переходы: number}>;
  неполный: boolean;
}

export interface Ряд {
  есть: boolean;
  шаг: Шаг;
  с: string;
  по: string | null;
  первый?: string;
  полныйПо: string | null;
  ряд: Точка[];
}

export interface Страница {
  путь: string;
  показы: number;
  переходы: number;
  ctr: number | null;
  позиция: number | null;
  разницаПоказов: number;
  разницаПереходов: number;
}

export interface Событие {
  коммит: string;
  путь: string;
  вид: string;
  прежнийПуть: string | null;
  локаль: string | null;
  адрес: string | null;
  прежнийАдрес: string | null;
  дата: string;
  автор: string;
  добавлено: number;
  убрано: number;
  описание: string | null;
}

export interface Ручное {
  ид: number;
  дата: string;
  текст: string;
  адрес: string | null;
}

/** Есть ли аналитика на этом компьютере. Спрашивает и запускает фоновое обновление базы. */
export function useAnalyticsAvailable(): boolean {
  const [есть, setЕсть] = useState(false);
  useEffect(() => {
    let жив = true;
    requestJson<{есть: boolean}>('/api/analytics')
      .then((ответ) => жив && setЕсть(ответ.есть === true))
      .catch(() => undefined);
    return () => {
      жив = false;
    };
  }, []);
  return есть;
}

/** Ответ ручки по адресу; `null`, пока не пришёл. Новый адрес — новый вопрос, старый ответ отбрасывается. */
export function useRead<T>(адрес: string | null): T | null {
  const [ответ, setОтвет] = useState<{адрес: string; данные: T} | null>(null);
  useEffect(() => {
    if (адрес === null) return undefined;
    let жив = true;
    requestJson<T>(адрес)
      .then((данные) => жив && setОтвет({адрес, данные}))
      .catch(() => undefined);
    return () => {
      жив = false;
    };
  }, [адрес]);
  return ответ && ответ.адрес === адрес ? ответ.данные : null;
}

/** Источник чисел раздела: Поиск Google (показы и переходы) или просмотры сайта из GA4. */
export type Источник = 'поиск' | 'просмотры';

/** Адрес ряда: поиск — `/api/analytics/search`, просмотры сайта — `/api/analytics/views`. */
export function адресРяда(охват: Охват, шаг: Шаг, с?: string, по?: string, источник: Источник = 'поиск'): string {
  const параметры = new URLSearchParams({охват, шаг});
  if (с) параметры.set('с', с);
  if (по) параметры.set('по', по);
  return `${источник === 'поиск' ? '/api/analytics/search' : '/api/analytics/views'}?${параметры}`;
}

/** Текст разницы одного события — по щелчку, не заранее. */
export async function дельтаСобытия(коммит: string, путь: string): Promise<string | null> {
  const ответ = await requestJson<{дельта: string | null}>(`/api/analytics/delta?${new URLSearchParams({коммит, путь})}`);
  return ответ.дельта;
}

/** День `YYYY-MM-DD` плюс дни. */
export function сдвигДня(день: string, дни: number): string {
  return new Date(Date.parse(`${день}T00:00:00Z`) + дни * 86_400_000).toISOString().slice(0, 10);
}

/** Разница в штуках со знаком: `+196`, `−38`, `±0`. */
export function сЗнаком(число: number, язык: string): string {
  const модуль = Math.abs(число).toLocaleString(язык);
  return число > 0 ? `+${модуль}` : число < 0 ? `−${модуль}` : `±${модуль}`;
}
