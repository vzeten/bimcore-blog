import {useState} from 'react';
import {дельтаСобытия, type Событие} from '../useAnalytics';
import type {Settings} from '../types';

/**
 * Одно изменение статьи: вид, статья, язык, строк +/−, описание от ИИ (или «без описания»), цветная разница
 * текста по щелчку и, если задан, переход к графику. Общая строка «Действий» и списка выбранного периода.
 */
export function ActionRow(props: {
  settings: Settings;
  с: Событие;
  название: string;
  /** Без вида — в списке периода вид уже назван в заголовке группы. */
  безВида?: boolean;
  onГрафик?: () => void;
}) {
  const п = props.settings.аналитикаОкно;
  const {с} = props;
  const [текст, setТекст] = useState<string | null | undefined>(undefined);
  const открыть = async () => {
    if (текст !== undefined) return setТекст(undefined);
    setТекст(null);
    setТекст((await дельтаСобытия(с.коммит, с.путь).catch(() => null)) ?? '');
  };
  return (
    <>
      <div className="action-row">
        {!props.безВида && <span className="action-kind">{п.видыСобытий[с.вид] ?? с.вид}</span>}
        <span className="action-main">
          <strong>{props.название}</strong>
          {с.локаль && <span className="action-lang"> {с.локаль.toUpperCase()}</span>}
          <span className="pages-path"> +{с.добавлено} / −{с.убрано} {с.вид === 'изображения' ? п.картинок : п.строк} · {с.автор}</span>
          <div className={с.описание ? 'action-text' : 'action-text action-empty'}>{с.описание ?? п.безОписания}</div>
        </span>
        <button className="ghost" onClick={() => void открыть()}>{текст !== undefined ? п.скрыть : п.разница}</button>
        {props.onГрафик && <button className="ghost" onClick={props.onГрафик}>{п.наГрафике}</button>}
      </div>
      {текст !== undefined && (текст === null ? <pre className="action-diff">…</pre> : <DiffView текст={текст} />)}
    </>
  );
}

/** Строка разницы: вид и части; `true` у части — изменённые слова внутри строки. */
export interface СтрокаРазницы {
  вид: 'убрано' | 'добавлено' | 'место' | 'как было';
  части: [string, boolean][];
}

/**
 * Разбор разницы git для показа (слово владельца 2026-09-24: убранное красным, добавленное зелёным). Служебные
 * строки git скрыты. Абзац статьи — одна длинная строка, поэтому в паре «убрано → добавлено» дополнительно
 * выделены изменившиеся слова: общее начало и общий конец пары не выделяются.
 */
export function строкиРазницы(текст: string): СтрокаРазницы[] {
  // Последний перевод строки разницы — не пустая строка текста.
  const строки = текст.replace(/\n$/, '').split('\n').filter((строка) => !/^(diff --git|index |--- |\+\+\+ |\\ No newline)/.test(строка));
  const итог: СтрокаРазницы[] = [];
  for (let и = 0; и < строки.length; и++) {
    const строка = строки[и];
    if (строка.startsWith('@@')) итог.push({вид: 'место', части: [['…', false]]});
    else if (строка.startsWith('-') || строка.startsWith('+')) {
      // Подряд идущие убранные и следующие за ними добавленные строки сопоставляются попарно.
      const убрано: string[] = [];
      const добавлено: string[] = [];
      while (и < строки.length && строки[и].startsWith('-')) убрано.push(строки[и++].slice(1));
      while (и < строки.length && строки[и].startsWith('+')) добавлено.push(строки[и++].slice(1));
      и--;
      убрано.forEach((было, н) => итог.push({вид: 'убрано', части: н < добавлено.length ? слова(было, добавлено[н]) : [[было, false]]}));
      добавлено.forEach((стало, н) => итог.push({вид: 'добавлено', части: н < убрано.length ? слова(стало, убрано[н]) : [[стало, false]]}));
    } else итог.push({вид: 'как было', части: [[строка.slice(1), false]]});
  }
  return итог;
}

/** Части строки `это` против парной `та`: общее начало и конец по словам — без выделения, середина — выделена. */
function слова(это: string, та: string): [string, boolean][] {
  const а = это.split(/(\s+)/);
  const б = та.split(/(\s+)/);
  let начало = 0;
  while (начало < а.length && начало < б.length && а[начало] === б[начало]) начало++;
  let конец = 0;
  while (конец < а.length - начало && конец < б.length - начало && а[а.length - 1 - конец] === б[б.length - 1 - конец]) конец++;
  const части: [string, boolean][] = [[а.slice(0, начало).join(''), false], [а.slice(начало, а.length - конец).join(''), true], [а.slice(а.length - конец).join(''), false]];
  return части.filter(([часть]) => часть !== '');
}

function DiffView(props: {текст: string}) {
  const строки = строкиРазницы(props.текст);
  return (
    <div className="action-diff">
      {строки.map((строка, н) => (
        <div key={н} className={`diff-line diff-${строка.вид === 'убрано' ? 'del' : строка.вид === 'добавлено' ? 'add' : строка.вид === 'место' ? 'gap' : 'same'}`}>
          <span className="diff-sign">{строка.вид === 'убрано' ? '−' : строка.вид === 'добавлено' ? '+' : ' '}</span>
          {строка.части.map(([часть, выделено], к) => (выделено ? <mark key={к}>{часть}</mark> : <span key={к}>{часть}</span>))}
        </div>
      ))}
    </div>
  );
}
