// Предварительный выпуск глазами окна: состав файлов, ход полной сборки и её итог.
//
// Отдельным модулем, как и подготовка: в шапке окна ему места нет (SPEC 4.9). Правил здесь нет —
// состав считает ядро, сборку запускает сервер; окно зовёт и показывает.
//
// **Показанное всегда описывает то, что лежит на диске.** Правка статьи или переход к другой гасят
// и состав, и итог сборки: зелёная сборка вчерашнего текста ничего не обещает про сегодняшний.
// Постоянной машины состояний для этого не заводится — то же простое правило, что у подготовки.

import {useEffect, useRef, useState} from 'react';
import {requestJson} from './api';
import type {ReleaseBuild, ReleaseComposition} from './types';

export interface Выпуск {
  состав: ReleaseComposition | null;
  сборка: ReleaseBuild | null;
  шаг: 'нет' | 'состав' | 'сборка' | 'фиксация';
  ошибка: string | null;
  начать: () => Promise<void>;
  закрыть: () => void;
  /** Согласие человека на фиксацию. Показывается только после зелёной сборки. */
  спрашиваю: boolean;
  спросить: () => void;
  передумать: () => void;
  зафиксировать: () => Promise<void>;
  коммит: string | null;
}

/**
 * `path` — путь открытой языковой версии; `dirty` — есть ли несохранённые правки;
 * `заход` — номер открытия статьи: та же статья, открытая заново, перечитана с диска, и прежний
 * вердикт к ней уже не относится.
 */
export function useRelease(path: string | null, dirty: boolean, заход: number): Выпуск {
  const [состав, setСостав] = useState<ReleaseComposition | null>(null);
  const [сборка, setСборка] = useState<ReleaseBuild | null>(null);
  const [шаг, setШаг] = useState<'нет' | 'состав' | 'сборка' | 'фиксация'>('нет');
  const [ошибка, setОшибка] = useState<string | null>(null);
  const [спрашиваю, setСпрашиваю] = useState(false);
  const [коммит, setКоммит] = useState<string | null>(null);
  // Что сейчас на экране и идёт ли запрос — в ref: ответ, посланный минуты назад, обязан сверяться
  // с тем, что в окне СЕЙЧАС, а не с тем, что было при отправке.
  const окно = useRef('');
  const идёт = useRef(false);

  окно.current = `${path ?? ''}|${заход}|${dirty ? 'правка' : 'файл'}`;

  const закрыть = () => {
    setСостав(null);
    setСборка(null);
    setШаг('нет');
    setОшибка(null);
    setСпрашиваю(false);
    setКоммит(null);
  };

  // Сменилась статья, открыли её заново или появилась правка — прежний состав и прежняя сборка
  // больше ничего не значат: сборка отвечает за то содержимое, которое она видела.
  useEffect(закрыть, [path, dirty, заход]);

  async function начать(): Promise<void> {
    // Запрет на второй заход держится на ref, а не на шаге: гашение экрана возвращает шаг в «нет»,
    // пока первая сборка ещё идёт, и без этого запрета их пошло бы две сразу.
    if (path === null || идёт.current) return;

    const статья = окно.current;
    идёт.current = true;
    setОшибка(null);
    setСборка(null);
    setСостав(null);
    setШаг('состав');
    try {
      // Сначала перечень файлов на экран: человек видит, что именно уедет, ДО всякой проверки.
      const перечень = await requestJson<ReleaseComposition>('/api/release', {
        // Путь берётся из аргумента, а не из ключа окна: ключ несёт ещё заход и признак правки.
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path}),
      });
      // Ответ пришёл в другое окно — молча выбрасываем: чужой состав показывать нельзя.
      if (окно.current !== статья) return;
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
        body: JSON.stringify({path}),
      });
      // Пока сборка шла минуты, человек мог поправить статью или уйти в другую. Такой вердикт
      // относится к прежнему содержимому, и показывать его нельзя ни в каком виде.
      if (окно.current === статья) setСборка(итог);
    } catch (error) {
      const причина = error as {прервано?: boolean; message?: string};
      if (причина?.прервано !== true && окно.current === статья) setОшибка(причина?.message ?? '');
    } finally {
      идёт.current = false;
      if (окно.current === статья) setШаг('нет');
    }
  }

  /**
   * Зафиксировать статью. Сервер всё пересчитает заново и откажет, если что-то разошлось: окно
   * здесь только передаёт согласие человека, а не доказывает готовность.
   */
  async function зафиксировать(): Promise<void> {
    if (path === null || идёт.current) return;

    const статья = окно.current;
    идёт.current = true;
    setОшибка(null);
    setШаг('фиксация');
    try {
      const ответ = await requestJson<{коммит: string}>('/api/publish/commit', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path, подтверждено: true}),
      });
      if (окно.current === статья) {
        setКоммит(ответ.коммит);
        setСпрашиваю(false);
      }
    } catch (error) {
      const причина = error as {прервано?: boolean; message?: string};
      if (причина?.прервано !== true && окно.current === статья) setОшибка(причина?.message ?? '');
    } finally {
      идёт.current = false;
      if (окно.current === статья) setШаг('нет');
    }
  }

  return {
    состав,
    сборка,
    шаг,
    ошибка,
    начать,
    закрыть,
    спрашиваю,
    спросить: () => setСпрашиваю(true),
    передумать: () => setСпрашиваю(false),
    зафиксировать,
    коммит,
  };
}
