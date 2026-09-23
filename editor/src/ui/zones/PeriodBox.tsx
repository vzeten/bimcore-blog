import {useState} from 'react';
import {ActionRow} from './ActionRow';
import type {Событие} from '../useAnalytics';
import type {Settings} from '../types';

/** Одна статья с одним видом изменения за период: все её языки и сами изменения. */
export interface ГруппаИзменений {
  подпись: string;
  языки: string;
  события: Событие[];
}

/**
 * Блок «Выбрано: …» под графиками (слово владельца 2026-09-24): все изменения выбранного периода, сведённые по
 * статье с языками — только после щелчка по ▲ (по столбику — одна строка выбора, чтобы видеть показатели
 * страниц). Щелчок по строке раскрывает её изменения — описание от ИИ, строки +/− и цветную разницу; кнопка
 * возвращает к последним 30 дням.
 */
export function PeriodBox(props: {
  settings: Settings;
  период: string;
  группы: ГруппаИзменений[];
  названия: Map<string, string>;
  /** Показывать ли список изменений (раскрыт щелчком по ▲). */
  изменения: boolean;
  onСброс: () => void;
}) {
  const п = props.settings.аналитикаОкно;
  const [открыта, setОткрыта] = useState<string | null>(null);
  return (
    <div className="period-box">
      <div className="period-head">
        <strong>{п.выбрано.replace('{период}', props.период)}</strong>
        <button className="ghost" onClick={props.onСброс}>{п.кПоследним30}</button>
      </div>
      {props.изменения && props.группы.length === 0 && <p className="trash-note">{п.нетИзменений}</p>}
      {props.изменения && props.группы.length > 0 && <div className="views-label">{п.изменения}: {props.группы.length}</div>}
      {props.изменения && props.группы.map((г) => {
        const описано = г.события.filter((с) => с.описание).length;
        return (
          <div key={г.подпись} className={г.события.length ? 'period-group' : 'period-group period-manual'}>
            <button className="period-row" aria-expanded={открыта === г.подпись} disabled={г.события.length === 0}
              onClick={() => setОткрыта(открыта === г.подпись ? null : г.подпись)}>
              <span>{г.события.length > 0 ? (открыта === г.подпись ? '▾' : '▸') : '▲'} {г.подпись}{г.языки && ` — ${г.языки}`}</span>
              {г.события.length > 0 && <span className="pages-path">{описано ? п.сОписанием.replace('{n}', String(описано)) : п.безОписания}</span>}
            </button>
            {открыта === г.подпись && г.события.map((с) => (
              <ActionRow key={`${с.коммит}|${с.путь}`} settings={props.settings} с={с} безВида
                название={((с.адрес ?? с.прежнийАдрес) && props.названия.get((с.адрес ?? с.прежнийАдрес)!)) ?? с.путь} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
