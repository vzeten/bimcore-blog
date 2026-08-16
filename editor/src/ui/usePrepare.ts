// Подготовка статьи глазами окна: запрос, состояние кнопки и судьба показанного отчёта.
//
// Отдельным модулем, а не внутри шапки окна: там уже живут название, языки, сохранение и удаление,
// и файл упёрся бы в предел размера (SPEC 4.9). Правил проверки здесь нет ни одного — их знает
// ядро; окно только зовёт ручку и показывает ответ.
//
// **Отчёт всегда описывает то, что лежит на диске.** Подготовка судит о файле, а не об экране,
// поэтому отчёт гаснет от первой же новой правки и при переходе к другой статье, а кнопка заперта,
// пока есть несохранённое. Простое предсказуемое правило вместо отпечатков и барьера: показанное
// либо верно сейчас, либо не показано вовсе.
//
// Ошибка живёт здесь же, рядом с отчётом, а не в общей полосе ошибок окна: она относится к одному
// нажатию и гаснет вместе с ним, а окно ради этого не переделывается.

import {useEffect, useState} from 'react';
import {requestJson} from './api';
import type {PrepareReport} from './publishTypes';

export interface Подготовка {
  отчёт: PrepareReport | null;
  ошибка: string | null;
  идёт: boolean;
  запустить: () => Promise<void>;
  закрыть: () => void;
}

/** `path` — путь открытой языковой версии; null — статья закрыта. */
export function usePrepare(path: string | null, dirty: boolean): Подготовка {
  const [отчёт, setОтчёт] = useState<PrepareReport | null>(null);
  const [ошибка, setОшибка] = useState<string | null>(null);
  const [идёт, setИдёт] = useState(false);

  // Сменилась статья или появилась новая правка — прежний ответ больше не про то, что на диске.
  useEffect(() => {
    setОтчёт(null);
    setОшибка(null);
  }, [path, dirty]);

  async function запустить(): Promise<void> {
    if (path === null || идёт) return;

    setИдёт(true);
    setОшибка(null);
    try {
      const ответ = await requestJson<PrepareReport>('/api/prepare', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path}),
      });

      // Пока запрос шёл, человек мог уйти в другую статью: чужой отчёт показывать нельзя.
      if (ответ.path === path) setОтчёт(ответ);
    } catch (error) {
      const причина = error as {прервано?: boolean; message?: string};
      if (причина?.прервано !== true) setОшибка(причина?.message ?? '');
    } finally {
      setИдёт(false);
    }
  }

  return {
    отчёт,
    ошибка,
    идёт,
    запустить,
    закрыть: () => {
      setОтчёт(null);
      setОшибка(null);
    },
  };
}
