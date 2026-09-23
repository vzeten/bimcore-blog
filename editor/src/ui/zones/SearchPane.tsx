import {адресРяда, сдвигДня, сЗнаком, useRead, type Источник, type Ряд, type Страница, type Шаг} from '../useAnalytics';
import {TrendChart, type МеткаГрафика} from './TrendChart';
import {PagesTable} from './PagesTable';
import type {Settings} from '../types';

/** Что смотрим: охват (сайт, язык или `стр:/путь`), шаг и, для дней, отрезок вокруг события. */
export interface Вид {
  охват: string;
  шаг: Шаг;
  с?: string;
  по?: string;
}

/**
 * «Поиск Google» и «Просмотры сайта» (один код на оба раздела, слово владельца 2026-09-24): охват (весь сайт,
 * язык, страница), шаг (год по неделям, всё по месяцам, дни вокруг события), итоги 30 дней с разницей в штуках,
 * графики с метками «Действий» и список страниц. У поиска два графика — показы и переходы, у просмотров один.
 * Числа приходят готовыми с сервера (`analyticsReadRoute.mjs`).
 */
export function SearchPane(props: {
  settings: Settings;
  вид: Вид;
  onВид: (вид: Вид) => void;
  метки: (охват: string) => МеткаГрафика[];
  названия: Map<string, string>;
  источник: Источник;
}) {
  const п = props.settings.аналитикаОкно;
  const поиск = props.источник === 'поиск';
  const язык = props.settings.основнойЯзык;
  const {вид} = props;
  const ряд = useRead<Ряд>(адресРяда(вид.охват, вид.шаг, вид.с, вид.по, props.источник));
  const стр = useRead<{по: string | null; страницы: Страница[]}>(
    `/api/analytics/${поиск ? 'pages' : 'views-pages'}?${new URLSearchParams({охват: вид.охват})}`,
  );

  const число = (значение: number) => Math.round(значение).toLocaleString(язык);
  const подписьДня = (день: string) => {
    if (!день) return '';
    const дата = new Date(`${день}T00:00:00`);
    return вид.шаг === 'месяц'
      ? дата.toLocaleDateString(язык, {month: 'short', year: '2-digit'})
      : дата.toLocaleDateString(язык, {day: 'numeric', month: 'short'});
  };
  const метки = props.метки(вид.охват);
  const открытьДни = (день: string) => props.onВид({охват: вид.охват, шаг: 'день', с: сдвигДня(день, -21), по: сдвигДня(день, 21)});
  const итог = (стр?.страницы ?? []).reduce((сумма, с) => ({
    показы: сумма.показы + с.показы, переходы: сумма.переходы + с.переходы,
    рп: сумма.рп + с.разницаПоказов, рх: сумма.рх + с.разницаПереходов,
  }), {показы: 0, переходы: 0, рп: 0, рх: 0});
  const страница = вид.охват.startsWith('стр:') ? вид.охват.slice(4) : null;

  const кнопка = (подпись: string, включена: boolean, действие: () => void) => (
    <button key={подпись} className={включена ? 'order-on' : ''} aria-pressed={включена} onClick={действие}>{подпись}</button>
  );

  return (
    <div className="search-pane">
      <div className="analytics-controls">
        <span className="registry-order">
          {кнопка(п.охватСайт, вид.охват === 'сайт', () => props.onВид({...вид, охват: 'сайт'}))}
          {Object.keys(props.settings.локали).map((код) => кнопка(код.toUpperCase(), вид.охват === код, () => props.onВид({...вид, охват: код})))}
        </span>
        <span className="registry-order">
          {кнопка(п.шагНедели, вид.шаг === 'неделя', () => props.onВид({охват: вид.охват, шаг: 'неделя'}))}
          {кнопка(п.шагМесяцы, вид.шаг === 'месяц', () => props.onВид({охват: вид.охват, шаг: 'месяц'}))}
          {кнопка(п.шагДни, вид.шаг === 'день', () => props.onВид({охват: вид.охват, шаг: 'день'}))}
        </span>
      </div>

      {страница && (
        <p className="analytics-scope">
          {п.страницаОхват.replace('{путь}', props.названия.get(страница) ?? страница)}{' '}
          <button className="ghost" onClick={() => props.onВид({...вид, охват: 'сайт'})}>{п.вернутьСайт}</button>
        </p>
      )}
      {вид.шаг === 'день' && вид.с && <p className="analytics-scope">{п.вокругСобытия.replace('{день}', подписьДня(сдвигДня(вид.с, 21)))}</p>}

      {стр?.по && (
        <div className="views-compare">
          <div><span className="views-label">{поиск ? п.показы : п.просмотры} · 30</span><strong>{число(итог.показы)}</strong>
            <span className={итог.рп >= 0 ? 'views-up' : 'views-down'}>{сЗнаком(итог.рп, язык)}</span></div>
          {поиск && <div><span className="views-label">{п.переходы} · 30</span><strong>{число(итог.переходы)}</strong>
            <span className={итог.рх >= 0 ? 'views-up' : 'views-down'}>{сЗнаком(итог.рх, язык)}</span></div>}
        </div>
      )}

      {ряд && ряд.ряд.length === 0 && <p className="trash-note">{п.нетДанных}</p>}
      {ряд && ряд.ряд.length > 0 && (
        <>
          <TrendChart название={поиск ? п.показы : п.просмотры} точки={ряд.ряд.map((т) => ({начало: т.начало, значение: т.показы, неполный: т.неполный}))}
            метки={метки} подписьДня={подписьДня} число={число} неполныйТекст={п.неполный} onМетка={открытьДни} />
          {поиск && <TrendChart название={п.переходы} точки={ряд.ряд.map((т) => ({начало: т.начало, значение: т.переходы, неполный: т.неполный}))}
            метки={метки} подписьДня={подписьДня} число={число} неполныйТекст={п.неполный} onМетка={открытьДни} />}
        </>
      )}

      {стр?.по && (
        <>
          <h3>{п.страницы}</h3>
          <p className="trash-note">{п.поДень.replace('{день}', new Date(`${стр.по}T00:00:00`).toLocaleDateString(язык))}</p>
          <PagesTable settings={props.settings} страницы={стр.страницы} названия={props.названия} толькоПросмотры={!поиск}
            onСтраница={(путь) => props.onВид({охват: `стр:${путь}`, шаг: 'неделя'})} />
        </>
      )}
    </div>
  );
}
