// Предварительный выпуск глазами окна: состав файлов, ход полной сборки и её итог.
//
// Отдельным модулем, как и подготовка: в шапке окна ему места нет (SPEC 4.9). Правил здесь нет —
// состав считает ядро, сборку запускает сервер; окно зовёт и показывает.
//
// **Показанное всегда описывает то, что лежит на диске.** Правка статьи или переход к другой гасят
// и состав, и итог сборки: зелёная сборка вчерашнего текста ничего не обещает про сегодняшний.
// Постоянной машины состояний для этого не заводится — то же простое правило, что у подготовки.

import {useEffect, useState} from 'react';
import {requestJson} from './api';
import type {ReleaseBuild, ReleaseComposition} from './types';

export interface Выпуск {
  состав: ReleaseComposition | null;
  сборка: ReleaseBuild | null;
  шаг: 'нет' | 'состав' | 'сборка';
  ошибка: string | null;
  начать: () => Promise<void>;
  закрыть: () => void;
}

/** `path` — путь открытой языковой версии; `dirty` — есть ли несохранённые правки. */
export function useRelease(path: string | null, dirty: boolean): Выпуск {
  const [состав, setСостав] = useState<ReleaseComposition | null>(null);
  const [сборка, setСборка] = useState<ReleaseBuild | null>(null);
  const [шаг, setШаг] = useState<'нет' | 'состав' | 'сборка'>('нет');
  const [ошибка, setОшибка] = useState<string | null>(null);

  const закрыть = () => {
    setСостав(null);
    setСборка(null);
    setШаг('нет');
    setОшибка(null);
  };

  // Сменилась статья или появилась правка — прежний состав и прежняя сборка больше ничего не значат.
  useEffect(закрыть, [path, dirty]);

  async function начать(): Promise<void> {
    if (path === null || шаг !== 'нет') return;

    const статья = path;
    setОшибка(null);
    setШаг('состав');
    try {
      // Сначала перечень файлов на экран: человек видит, что именно уедет, ДО всякой проверки.
      const перечень = await requestJson<ReleaseComposition>('/api/release', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path: статья}),
      });
      if (перечень.path !== статья) return;
      setСостав(перечень);

      // Состав не доказан — сборку не запускаем: проверять сайт ради статьи, состава которой мы
      // не знаем, значит обещать проверку, которой не было.
      if (!перечень.можно) {
        setШаг('нет');
        return;
      }

      setШаг('сборка');
      const итог = await requestJson<ReleaseBuild>('/api/release/build', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path: статья}),
      });
      if (итог.path === статья) setСборка(итог);
    } catch (error) {
      const причина = error as {прервано?: boolean; message?: string};
      if (причина?.прервано !== true) setОшибка(причина?.message ?? '');
    } finally {
      setШаг('нет');
    }
  }

  return {состав, сборка, шаг, ошибка, начать, закрыть};
}
