import {useState} from 'react';
import {useAnalyticsAvailable} from '../useAnalytics';
import {AnalyticsScreen} from './AnalyticsScreen';
import type {ArticleRow, PanelMode, Settings} from '../types';

/**
 * Узкая полоса слева: единственная постоянная навигация. Панели выдвигаются по нажатию. Ниже — «Аналитика»
 * (ED-054; место выбрал владелец 2026-09-24): есть только там, где лежит ключ владельца, у сотрудника значка нет.
 */
export function Rail(props: {
  settings: Settings;
  articles: ArticleRow[];
  mode: PanelMode;
  articleOpen: boolean;
  onMode: (mode: PanelMode) => void;
}) {
  const п = props.settings.подписи;
  const естьАналитика = useAnalyticsAvailable();
  const [аналитика, setАналитика] = useState(false);

  const кнопка = (mode: Exclude<PanelMode, null>, знак: string, подпись: string, доступна = true) => (
    <button
      className={props.mode === mode ? 'rail-on' : ''}
      title={подпись}
      disabled={!доступна}
      onClick={() => props.onMode(props.mode === mode ? null : mode)}
    >
      {знак}
    </button>
  );

  return (
    <nav className="rail">
      {кнопка('статьи', '☰', п.статьи)}
      {кнопка('версии', '◷', п.версии, props.articleOpen)}
      {естьАналитика && (
        <button className={аналитика ? 'rail-on' : ''} title={props.settings.аналитикаОкно.кнопка} onClick={() => setАналитика(!аналитика)}>
          {/* Значок — маленький график одной линией: монохромный, как соседние знаки полосы. */}
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <polyline points="1,13 5,8 8,10 14,3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {аналитика && <AnalyticsScreen settings={props.settings} articles={props.articles} onЗакрыть={() => setАналитика(false)} />}
    </nav>
  );
}
