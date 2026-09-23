import {useMemo, useState} from 'react';
import {сдвигДня, useRead, type Ручное, type Событие} from '../useAnalytics';
import {SearchPane, type Вид} from './SearchPane';
import {ActionsPane} from './ActionsPane';
import type {МеткаГрафика} from './BarChart';
import type {ArticleRow, Settings} from '../types';

/**
 * Экран «Аналитика» поверх реестра (ED-054): слева «Действия», «Поиск Google», «Просмотры сайта» (GA4 по всему
 * сайту — слово владельца 2026-09-24; тот же код, что у поиска) и место под воронку продаж
 * (операция 3). Названия статей берутся из реестра по пути файла события, метки графиков — из «Действий».
 */
export function AnalyticsScreen(props: {settings: Settings; articles: ArticleRow[]; onЗакрыть: () => void}) {
  const п = props.settings.аналитикаОкно;
  const [раздел, setРаздел] = useState<'поиск' | 'просмотры' | 'действия'>('поиск');
  // По умолчанию — месяцы, как в окне просмотров статьи (решение владельца 2026-09-24).
  const [вид, setВид] = useState<Вид>({охват: 'сайт', шаг: 'месяц'});
  const действия = useRead<{события: Событие[]; ручные: Ручное[]}>('/api/analytics/actions');

  // Адрес страницы → название статьи: событие знает и адрес, и путь файла, реестр — название файла.
  const названия = useMemo(() => {
    const поПути = new Map<string, string>();
    for (const статья of props.articles) {
      for (const версия of Object.values(статья.versions)) поПути.set(версия.path, версия.title || статья.title);
    }
    const итог = new Map<string, string>();
    for (const с of действия?.события ?? []) {
      const название = поПути.get(с.путь);
      if (название && с.адрес && !итог.has(с.адрес)) итог.set(с.адрес, название);
    }
    return итог;
  }, [props.articles, действия]);

  const метки = (охват: string): МеткаГрафика[] => {
    const страница = охват.startsWith('стр:') ? охват.slice(4) : null;
    const поДню = new Map<string, string[]>();
    const добавить = (день: string, подпись: string) => поДню.set(день, [...(поДню.get(день) ?? []), подпись]);
    for (const с of действия?.события ?? []) {
      const подходит = страница ? с.адрес === страница || с.прежнийАдрес === страница : охват === 'сайт' || с.локаль === охват;
      const адрес = с.адрес ?? с.прежнийАдрес;
      if (подходит) добавить(с.дата.slice(0, 10), `${п.видыСобытий[с.вид] ?? с.вид}: ${(адрес && названия.get(адрес)) ?? с.путь}${с.локаль ? ` (${с.локаль.toUpperCase()})` : ''}`);
    }
    for (const р of действия?.ручные ?? []) {
      if (!страница || р.адрес === страница) добавить(р.дата, `${п.ручное}: ${р.текст}`);
    }
    return [...поДню].map(([день, подписи]) => ({день, подписи}));
  };

  const наГрафик = (адрес: string, день: string) => {
    setРаздел('поиск');
    setВид({охват: `стр:${адрес}`, шаг: 'день', с: сдвигДня(день, -15), по: сдвигДня(день, 15)});
  };

  return (
    <section className="trash-panel analytics-screen" role="dialog" aria-label={п.заголовок}>
      <div className="trash-head">
        <h2>{п.заголовок}</h2>
        <button className="ghost" onClick={props.onЗакрыть}>{п.закрыть}</button>
      </div>
      <div className="analytics-body">
        <nav className="analytics-nav">
          <button className={раздел === 'действия' ? 'nav-on' : ''} onClick={() => setРаздел('действия')}>{п.разделДействия}</button>
          <button className={раздел === 'поиск' ? 'nav-on' : ''} onClick={() => setРаздел('поиск')}>{п.разделПоиск}</button>
          <button className={раздел === 'просмотры' ? 'nav-on' : ''} onClick={() => setРаздел('просмотры')}>{п.разделПросмотры}</button>
          <button disabled title={п.разделВоронка}>{п.разделВоронка}</button>
        </nav>
        <div className="analytics-main">
          {(раздел === 'поиск' || раздел === 'просмотры') && (
            <SearchPane key={раздел} settings={props.settings} источник={раздел} вид={вид} onВид={setВид} метки={метки} названия={названия} />
          )}
          {раздел === 'действия' && (действия
            ? <ActionsPane settings={props.settings} события={действия.события} ручные={действия.ручные} названия={названия} onГрафик={наГрафик} />
            : <p className="trash-note">…</p>)}
        </div>
      </div>
    </section>
  );
}
