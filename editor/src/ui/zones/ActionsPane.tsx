import {useState} from 'react';
import {дельтаСобытия, type Ручное, type Событие} from '../useAnalytics';
import type {Settings} from '../types';

const ПОРЦИЯ = 60;

/**
 * «Действия»: изменения статей, дошедшие до сервера, новые сверху и по дням; ручные SEO-события — своим видом,
 * не вперемешку с публикациями. У изменения — вид, статья, язык, строк +/−, описание от ИИ (или «без описания»),
 * разница текста по щелчку и переход к графику страницы вокруг этого дня.
 */
export function ActionsPane(props: {
  settings: Settings;
  события: Событие[];
  ручные: Ручное[];
  названия: Map<string, string>;
  onГрафик: (адрес: string, день: string) => void;
}) {
  const п = props.settings.аналитикаОкно;
  const язык = props.settings.основнойЯзык;
  const [сколько, setСколько] = useState(ПОРЦИЯ);
  const [открыта, setОткрыта] = useState<{ключ: string; текст: string | null} | null>(null);

  const день = (дата: string) => дата.slice(0, 10);
  const записи = [
    ...props.события.map((с) => ({вид: 'событие' as const, день: день(с.дата), с})),
    ...props.ручные.map((р) => ({вид: 'ручное' as const, день: р.дата, р})),
  ].sort((a, b) => b.день.localeCompare(a.день)).slice(0, сколько);

  const разница = async (с: Событие) => {
    const ключ = `${с.коммит}|${с.путь}`;
    if (открыта?.ключ === ключ) {
      setОткрыта(null);
      return;
    }
    setОткрыта({ключ, текст: null});
    const текст = await дельтаСобытия(с.коммит, с.путь).catch(() => null);
    setОткрыта((было) => (было?.ключ === ключ ? {ключ, текст: текст ?? ''} : было));
  };

  if (записи.length === 0) return <p className="trash-note">{п.нетСобытий}</p>;

  let прежнийДень = '';
  return (
    <div className="actions-pane">
      {записи.map((запись) => {
        const заголовок = запись.день !== прежнийДень ? new Date(`${запись.день}T00:00:00`).toLocaleDateString(язык, {day: 'numeric', month: 'long', year: 'numeric'}) : null;
        прежнийДень = запись.день;
        if (запись.вид === 'ручное') {
          const {р} = запись;
          return (
            <div key={`р${р.ид}`}>
              {заголовок && <h3>{заголовок}</h3>}
              <div className="action-row action-manual">
                <span className="action-kind">{п.ручное}</span>
                <span className="action-main">{р.текст}{р.адрес && <span className="pages-path"> {р.адрес}</span>}</span>
                {р.адрес && <button className="ghost" onClick={() => props.onГрафик(р.адрес!, р.дата)}>{п.наГрафике}</button>}
              </div>
            </div>
          );
        }
        const {с} = запись;
        const ключ = `${с.коммит}|${с.путь}`;
        const адрес = с.адрес ?? с.прежнийАдрес;
        return (
          <div key={ключ}>
            {заголовок && <h3>{заголовок}</h3>}
            <div className="action-row">
              <span className="action-kind">{п.видыСобытий[с.вид] ?? с.вид}</span>
              <span className="action-main">
                <strong>{(адрес && props.названия.get(адрес)) ?? с.путь}</strong>
                {с.локаль && <span className="action-lang"> {с.локаль.toUpperCase()}</span>}
                <span className="pages-path"> +{с.добавлено} / −{с.убрано} {п.строк} · {с.автор}</span>
                <div className={с.описание ? 'action-text' : 'action-text action-empty'}>{с.описание ?? п.безОписания}</div>
              </span>
              <button className="ghost" onClick={() => void разница(с)}>{открыта?.ключ === ключ ? п.скрыть : п.разница}</button>
              {адрес && <button className="ghost" onClick={() => props.onГрафик(адрес, день(с.дата))}>{п.наГрафике}</button>}
            </div>
            {открыта?.ключ === ключ && <pre className="action-diff">{открыта.текст ?? '…'}</pre>}
          </div>
        );
      })}
      {сколько < props.события.length + props.ручные.length && (
        <button className="ghost" onClick={() => setСколько((было) => было + ПОРЦИЯ)}>{п.ещё}</button>
      )}
    </div>
  );
}
