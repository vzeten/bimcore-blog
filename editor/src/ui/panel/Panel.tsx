// Окно панели экземпляров. Состояние приходит только с сервера и только живым опросом: окно
// ничего не досочиняет и после действия показывает ровно ту таблицу, которую сервер собрал заново
// (SPEC 4.8, 6.6). Своих правил о том, что можно делать, у окна нет.

import {useCallback, useEffect, useRef, useState} from 'react';

import {requestJson} from '../api';
import {ЗначокОбновить} from './Icons';
import {Card} from './Card';
import type {Ответ, Строка} from './types';

/** Как часто панель переспрашивает живое состояние. Величина алгоритма: экземпляры поднимаются и
 *  гаснут снаружи панели, и таблица не должна устаревать, пока человек на неё смотрит. */
const ПЕРЕСПРОС_МС = 5000;

/** Действие, идущее прямо сейчас: имя нужно и для надписи ожидания, и для запирания кнопок. */
type Идёт = {порт: number; что: 'запуск' | 'остановка'} | null;

export function Panel() {
  const надписи = window.ПАНЕЛЬ.надписи;
  const [строки, setСтроки] = useState<Строка[] | null>(null);
  const [ошибка, setОшибка] = useState<string | null>(null);
  const [итог, setИтог] = useState<string | null>(null);
  const [идёт, setИдёт] = useState<Идёт>(null);
  const [спрошено, setСпрошено] = useState<number | null>(null);
  const [обновлено, setОбновлено] = useState<string | null>(null);
  // Пока идёт запуск или остановка, переспрос молчит: он подменил бы таблицу на полпути.
  const занято = useRef(false);

  const принять = useCallback((ответ: Ответ) => {
    setСтроки(ответ.строки);
    setОбновлено(new Date().toLocaleTimeString());
  }, []);

  const обновить = useCallback(async () => {
    try {
      принять(await requestJson<Ответ>('/api/panel/state'));
      setОшибка(null);
    } catch (беда) {
      setОшибка(беда instanceof Error ? беда.message : String(беда));
    }
  }, [принять]);

  useEffect(() => {
    void обновить();
    const часы = window.setInterval(() => {
      if (!занято.current) void обновить();
    }, ПЕРЕСПРОС_МС);
    return () => window.clearInterval(часы);
  }, [обновить]);

  /**
   * Одно действие над одним портом. Успехом оно считается только по ответу сервера: и таблица, и
   * слова итога приходят оттуда же, а окно само ничего не переключает (SPEC 6.6).
   */
  const действие = useCallback(async (порт: number, что: 'запуск' | 'остановка') => {
    const адрес = что === 'запуск' ? '/api/panel/start' : '/api/panel/stop';
    setИдёт({порт, что});
    занято.current = true;
    setИтог(null);
    setОшибка(null);
    try {
      const ответ = await requestJson<Ответ>(адрес, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({порт}),
      });
      принять(ответ);
      if (ответ.получилось) setИтог(ответ.итог ?? null);
      else setОшибка(ответ.беда ?? null);
    } catch (беда) {
      setОшибка(беда instanceof Error ? беда.message : String(беда));
    } finally {
      занято.current = false;
      setИдёт(null);
    }
  }, [принять]);

  /** Остановка рабочего окна спрашивается отдельно: спутать его с испытательным нельзя. */
  const остановка = (строка: Строка) => {
    if (строка.вид === 'рабочий') setСпрошено(строка.порт);
    else void действие(строка.порт, 'остановка');
  };

  const ответить = (порт: number, да: boolean) => {
    setСпрошено(null);
    if (да) void действие(порт, 'остановка');
  };

  return (
    <div className="панель">
      <header className="заголовок">
        <div className="заголовок-текст">
          <h1>{надписи.заголовок}</h1>
          <p>{надписи.подзаголовок}</p>
        </div>
        <div className="заголовок-справа">
          {обновлено && <span className="обновлено">{надписи.обновлено} {обновлено}</span>}
          <button type="button" className="кнопка" onClick={() => void обновить()} disabled={идёт !== null}>
            <ЗначокОбновить className="значок-кнопки" />
            {надписи.обновить}
          </button>
        </div>
      </header>

      {ошибка && <p className="полоса полоса--беда">{ошибка}</p>}
      {итог && <p className="полоса полоса--итог">{итог}</p>}

      {строки === null && <p className="пусто">{надписи.пусто}</p>}

      <div className="список">
        {(строки ?? []).map((строка) => (
          <Card
            key={строка.порт}
            строка={строка}
            надписи={надписи}
            идёт={идёт && идёт.порт === строка.порт ? идёт.что : null}
            спрошено={спрошено === строка.порт}
            открыть={() => window.open(строка.адрес ?? '', '_blank', 'noopener')}
            запустить={() => void действие(строка.порт, 'запуск')}
            остановить={() => остановка(строка)}
            ответить={(да) => ответить(строка.порт, да)}
          />
        ))}
      </div>
    </div>
  );
}
