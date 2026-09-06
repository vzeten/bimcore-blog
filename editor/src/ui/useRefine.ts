// «Доработать» глазами окна: план, выбор флажков, применение и что делать после.
//
// Окно ничего не решает про содержание: список обработчиков, их умолчания и предпросмотр приходят
// с сервера, флажок только меняет набор и просит план заново — обработчики зависимы по порядку, и
// предпросмотр переименования честен лишь при известном наборе. До «Применить» ни один запрос
// ничего не пишет. Смена статьи или новая правка закрывают окно: план описывал другой диск.

import {useEffect, useRef, useState} from 'react';
import {requestJson} from './api';
import type {ИтогДоработки, ПланДоработки} from './refineTypes';

export type ОкноДоработки = 'закрыто' | 'план' | 'выбор' | 'применяю' | 'готово';

export interface Доработка {
  окно: ОкноДоработки;
  план: ПланДоработки | null;
  /** Набор флажков окна: меняется сразу по щелчку, план подтягивается следом. */
  выбранные: string[];
  итог: ИтогДоработки | null;
  ошибка: string | null;
  предупреждение: string | null;
  открыть: () => void;
  закрыть: () => void;
  переключить: (код: string) => void;
  применить: () => Promise<void>;
}

const post = (тело: unknown): RequestInit => ({
  method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(тело),
});

/** `перечитать` — открыть статью заново с диска; `проверить` — запустить прежние проверки «Доработать». */
export function useRefine(
  path: string | null,
  dirty: boolean,
  после: {перечитать: (path: string) => Promise<boolean>; проверить: () => void},
): Доработка {
  const [окно, setОкно] = useState<ОкноДоработки>('закрыто');
  const [план, setПлан] = useState<ПланДоработки | null>(null);
  const [выбранные, setВыбранные] = useState<string[] | null>(null);
  const [итог, setИтог] = useState<ИтогДоработки | null>(null);
  const [ошибка, setОшибка] = useState<string | null>(null);
  const [предупреждение, setПредупреждение] = useState<string | null>(null);
  // Номер актуальности: ответ с другим номером принадлежит другой статье и не показывается.
  const номер = useRef(0);

  const сбросить = () => {
    номер.current += 1;
    setОкно('закрыто');
    setПлан(null);
    setВыбранные(null);
    setИтог(null);
    setОшибка(null);
    setПредупреждение(null);
  };

  useEffect(сбросить, [path, dirty]);

  async function планировать(выбранные: string[] | null): Promise<void> {
    if (path === null) return;
    const мой = номер.current;
    setОкно('план');
    setОшибка(null);
    try {
      const ответ = await requestJson<ПланДоработки>('/api/refine/plan', post({path, выбранные}));
      if (мой !== номер.current) return;
      setПлан(ответ);
      // Первый план приносит умолчания реестра; дальше набор ведёт окно.
      if (выбранные === null) setВыбранные(ответ.обработчики.filter((з) => з.выбран).map((з) => з.код));
    } catch (error) {
      if (мой === номер.current) setОшибка((error as Error).message);
    } finally {
      if (мой === номер.current) setОкно('выбор');
    }
  }

  async function применить(): Promise<void> {
    if (path === null || план === null) return;
    const мой = номер.current;
    const набор = выбранные ?? план.обработчики.filter((з) => з.выбран).map((з) => з.код);
    setОкно('применяю');
    setОшибка(null);
    try {
      const ответ = await requestJson<ИтогДоработки>('/api/refine/apply', post({path, выбранные: набор, отпечаток: план.отпечаток}));
      if (мой !== номер.current) return;
      setИтог(ответ);
      if (ответ.применено) {
        // Файл на диске новый — окно перечитывает его, затем идут прежние проверки по новому тексту.
        const перечитана = await после.перечитать(path);
        if (мой !== номер.current) return;
        if (!перечитана) setПредупреждение('неПеречитана');
        после.проверить();
      }
      setОкно('готово');
    } catch (error) {
      if (мой !== номер.current) return;
      setОшибка((error as Error).message);
      setОкно('выбор');
    }
  }

  return {
    окно, план, итог, ошибка, предупреждение,
    выбранные: выбранные ?? [],
    открыть: () => void планировать(null),
    закрыть: сбросить,
    переключить: (код) => {
      if (выбранные === null) return;
      const набор = выбранные.includes(код) ? выбранные.filter((к) => к !== код) : [...выбранные, код];
      setВыбранные(набор);
      void планировать(набор);
    },
    применить,
  };
}
