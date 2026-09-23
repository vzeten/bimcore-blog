import {useMemo, useState} from 'react';
import {сдвигДня, useRead, type Ручное, type Событие} from '../useAnalytics';
import {SearchPane, type Вид} from './SearchPane';
import {ActionsPane} from './ActionsPane';
import type {МеткаГрафика} from './BarChart';
import type {ГруппаИзменений} from './PeriodBox';
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
  // Путь файла → общее название статьи: переводы одной статьи сводятся в одну строку списка периода.
  const статьи = useMemo(() => {
    const поПути = new Map<string, string>();
    for (const статья of props.articles) {
      for (const версия of Object.values(статья.versions)) поПути.set(версия.path, статья.title);
    }
    return поПути;
  }, [props.articles]);
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

  // События и ручные записи охвата: день, подпись без языка, язык — для меток графика и списка периода.
  const записи = (охват: string) => {
    const страница = охват.startsWith('стр:') ? охват.slice(4) : null;
    const итог: {день: string; подпись: string; группа: string; язык: string | null; событие: Событие | null}[] = [];
    for (const с of действия?.события ?? []) {
      const подходит = страница ? с.адрес === страница || с.прежнийАдрес === страница : охват === 'сайт' || с.локаль === охват;
      const адрес = с.адрес ?? с.прежнийАдрес;
      const вид = п.видыСобытий[с.вид] ?? с.вид;
      const название = (адрес && названия.get(адрес)) ?? с.путь;
      if (подходит) итог.push({день: с.дата.slice(0, 10), подпись: `${вид}: ${название}`, группа: `${вид}: ${статьи.get(с.путь) ?? название}`, язык: с.локаль, событие: с});
    }
    for (const р of действия?.ручные ?? []) {
      if (!страница || р.адрес === страница) итог.push({день: р.дата, подпись: `${п.ручное}: ${р.текст}`, группа: `${п.ручное}: ${р.текст}`, язык: null, событие: null});
    }
    return итог;
  };

  const метки = (охват: string): МеткаГрафика[] => {
    const поДню = new Map<string, МеткаГрафика>();
    for (const з of записи(охват)) {
      const метка = поДню.get(з.день) ?? {день: з.день, подписи: [], ручные: []};
      if (з.событие) метка.подписи.push(`${з.подпись}${з.язык ? ` (${з.язык.toUpperCase()})` : ''}`);
      else метка.ручные.push(з.подпись);
      поДню.set(з.день, метка);
    }
    return [...поДню.values()];
  };

  // Все изменения периода целиком: одна статья с одним видом изменения — одна строка со всеми языками
  // («Новая: Door Schedule — EN, RU, ES»), слово владельца 2026-09-24.
  const изменения = (охват: string, с: string, по: string): ГруппаИзменений[] => {
    const группы = new Map<string, {языки: Set<string>; события: Событие[]}>();
    for (const з of записи(охват).filter((з) => з.день >= с && з.день <= по).sort((а, б) => а.день.localeCompare(б.день))) {
      const группа = группы.get(з.группа) ?? {языки: new Set<string>(), события: []};
      if (з.язык) группа.языки.add(з.язык.toUpperCase());
      if (з.событие) группа.события.push(з.событие);
      группы.set(з.группа, группа);
    }
    const порядок = Object.keys(props.settings.локали).map((код) => код.toUpperCase());
    // Ручные записи — первыми: их мало, и они важнее.
    return [...группы].map(([подпись, г]) => ({
      подпись, события: г.события, языки: [...г.языки].sort((а, б) => порядок.indexOf(а) - порядок.indexOf(б)).join(', '),
    })).sort((а, б) => Number(а.события.length > 0) - Number(б.события.length > 0));
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
            <SearchPane key={раздел} settings={props.settings} источник={раздел} вид={вид} onВид={setВид} метки={метки} изменения={изменения} названия={названия} />
          )}
          {раздел === 'действия' && (действия
            ? <ActionsPane settings={props.settings} события={действия.события} ручные={действия.ручные} названия={названия} onГрафик={наГрафик} />
            : <p className="trash-note">…</p>)}
        </div>
      </div>
    </section>
  );
}
