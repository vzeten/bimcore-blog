// Состояние выкладки для значка «Сайт»: окно спрашивает сервер раз в несколько секунд с любого экрана.
// Сеть к GitHub спрашивает сервер, а не окно (`deployWatch.mjs`): опрос один, сколько бы окон ни было.

import {useEffect, useRef, useState} from 'react';
import {requestJson} from './api';
import {значокСайта, type СостояниеСайта} from './siteState';

/**
 * `окноСек` — как часто спрашивать сервер; `гаснетСек` — сколько держать зелёное «Сайт обновлён»,
 * прежде чем отметить его увиденным. Возвращает состояние и `понятно` — человек увидел итог.
 */
export function useSiteState(окноСек: number, гаснетСек: number) {
  const [сайт, setСайт] = useState<СостояниеСайта | null>(null);
  const гашу = useRef<string | null>(null);

  const понятно = (sha: string | undefined) => {
    if (!sha) return;
    setСайт((было) => (было?.sha === sha ? {...было, показано: true} : было));
    void requestJson('/api/site/seen', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({sha}),
    }).catch(() => undefined);
  };

  useEffect(() => {
    let жив = true;
    const спросить = () => void requestJson<СостояниеСайта>('/api/site/state')
      .then((ответ) => жив && setСайт(ответ))
      // Сервер не ответил — значок молчит, а не выдумывает: следующий вопрос спросит снова.
      .catch(() => undefined);
    спросить();
    const таймер = setInterval(спросить, Math.max(1, окноСек) * 1000);
    return () => {
      жив = false;
      clearInterval(таймер);
    };
  }, [окноСек]);

  // Зелёное «Сайт обновлён» гаснет само: человеку достаточно его увидеть.
  useEffect(() => {
    if (значокСайта(сайт) !== 'обновлён' || !сайт?.sha || гашу.current === сайт.sha) return;
    гашу.current = сайт.sha;
    const sha = сайт.sha;
    const таймер = setTimeout(() => понятно(sha), Math.max(1, гаснетСек) * 1000);
    return () => clearTimeout(таймер);
  }, [сайт?.sha, сайт?.состояние]);

  return {сайт, понятно};
}
