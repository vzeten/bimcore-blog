import {адресРяда, сдвигДня, сЗнаком, useRead, type Источник, type Ряд, type Страница, type Шаг} from '../useAnalytics';
import {useState} from 'react';
import {BarChart, type МеткаГрафика} from './BarChart';
import {PagesTable} from './PagesTable';
import {PeriodBox, type ГруппаИзменений} from './PeriodBox';
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
  изменения: (охват: string, с: string, по: string) => ГруппаИзменений[];
  названия: Map<string, string>;
  источник: Источник;
}) {
  const п = props.settings.аналитикаОкно;
  const поиск = props.источник === 'поиск';
  const коды = Object.keys(props.settings.локали);
  const цвета = props.settings.просмотры.цветаЯзыков;
  const [цветные, setЦветные] = useState<string[]>(коды);
  const переключить = (код: string) => setЦветные((были) => (были.includes(код) ? были.filter((был) => был !== код) : [...были, код]));
  const язык = props.settings.основнойЯзык;
  const {вид} = props;
  const ряд = useRead<Ряд>(адресРяда(вид.охват, вид.шаг, вид.с, вид.по, props.источник));
  // Выбранный щелчком столбик (слово владельца 2026-09-24): его период — в итогах, списке изменений и таблице
  // страниц под графиками, без перехода на другой вид. Смена охвата или шага выбор снимает.
  const [выбор, setВыбор] = useState<{ключ: string; с: string; по: string} | null>(null);
  const ключ = `${вид.охват}|${вид.шаг}|${вид.с ?? ''}`;
  const выбран = выбор?.ключ === ключ ? выбор : null;
  const стр = useRead<{по: string | null; страницы: Страница[]}>(
    `/api/analytics/${поиск ? 'pages' : 'views-pages'}?${new URLSearchParams({охват: вид.охват, ...(выбран ? {с: выбран.с, по: выбран.по} : {})})}`,
  );

  const число = (значение: number) => Math.round(значение).toLocaleString(язык);
  const кратко = (значение: number) => new Intl.NumberFormat(язык, {notation: 'compact', maximumFractionDigits: 1}).format(значение);
  const подписьДня = (день: string) => {
    if (!день) return '';
    const дата = new Date(`${день}T00:00:00`);
    if (вид.шаг === 'месяц') return дата.toLocaleDateString(язык, {month: 'short', year: '2-digit'});
    if (вид.шаг === 'неделя') return подписьНедели(дата, язык);
    return дата.toLocaleDateString(язык, {day: 'numeric', month: 'short'});
  };
  const метки = props.метки(вид.охват);
  const точки = ряд?.ряд ?? [];
  const номерВыбран = выбран ? точки.findIndex((т) => т.начало === выбран.с) : -1;
  const выбрать = (номер: number) => {
    const начало = точки[номер].начало;
    if (выбран?.с === начало) return setВыбор(null);
    const дата = new Date(`${начало}T00:00:00`);
    const конец = вид.шаг === 'месяц' ? new Date(дата.getFullYear(), дата.getMonth() + 1, 0) : вид.шаг === 'неделя' ? new Date(дата.getFullYear(), дата.getMonth(), дата.getDate() + 6) : дата;
    const по = `${конец.getFullYear()}-${String(конец.getMonth() + 1).padStart(2, '0')}-${String(конец.getDate()).padStart(2, '0')}`;
    setВыбор({ключ, с: начало, по});
  };
  const период = выбран
    ? вид.шаг === 'месяц' ? new Date(`${выбран.с}T00:00:00`).toLocaleDateString(язык, {month: 'long', year: 'numeric'}) : подписьДня(выбран.с)
    : п.шагДни;
  const итог = (стр?.страницы ?? []).reduce((сумма, с) => ({
    показы: сумма.показы + с.показы, переходы: сумма.переходы + с.переходы,
    рп: сумма.рп + с.разницаПоказов, рх: сумма.рх + с.разницаПереходов,
  }), {показы: 0, переходы: 0, рп: 0, рх: 0});
  const страница = вид.охват.startsWith('стр:') ? вид.охват.slice(4) : null;
  // Язык страницы по префиксу адреса — как на сервере (`searchSeries.mjs`): `/ru/…` — ru, без префикса — обязательный.
  const языкПути = (путь: string) => {
    const первый = путь.split('/')[1] ?? '';
    return коды.includes(первый) && первый !== props.settings.обязательныйЯзык ? первый : props.settings.обязательныйЯзык;
  };
  const поЯзыкам = Object.fromEntries(коды.map((код) => [код, 0]));
  for (const с of стр?.страницы ?? []) поЯзыкам[языкПути(с.путь)] += с.показы;
  const столбики = (поле: 'показы' | 'переходы') => (ряд?.ряд ?? []).map((т) => ({
    начало: т.начало,
    неполный: т.неполный,
    языки: Object.fromEntries(Object.entries(т.языки ?? {}).map(([код, числа]) => [код, числа[поле]])),
  }));

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
          {кнопка(п.шагМесяцы, вид.шаг === 'месяц', () => props.onВид({охват: вид.охват, шаг: 'месяц'}))}
          {кнопка(п.шагНедели, вид.шаг === 'неделя', () => props.onВид({охват: вид.охват, шаг: 'неделя'}))}
          {кнопка(п.шагДни, вид.шаг === 'день', () => props.onВид({охват: вид.охват, шаг: 'день'}))}
        </span>
      </div>

      {страница && (
        <p className="analytics-scope">
          {п.страницаОхват.replace('{путь}', props.названия.get(страница) ?? страница)}{' '}
          <button className="ghost" onClick={() => props.onВид({...вид, охват: 'сайт'})}>{п.вернутьСайт}</button>
        </p>
      )}
      {вид.шаг === 'день' && вид.с && <p className="analytics-scope">{п.вокругСобытия.replace('{день}', подписьДня(сдвигДня(вид.с, 15)))}</p>}

      {стр?.по && (
        <div className="views-compare">
          <div><span className="views-label">{поиск ? п.показы : п.просмотры} · {период}</span><strong>{число(итог.показы)}</strong>
            <span className={итог.рп >= 0 ? 'views-up' : 'views-down'}>{сЗнаком(итог.рп, язык)}</span></div>
          {поиск && <div><span className="views-label">{п.переходы} · {период}</span><strong>{число(итог.переходы)}</strong>
            <span className={итог.рх >= 0 ? 'views-up' : 'views-down'}>{сЗнаком(итог.рх, язык)}</span></div>}
        </div>
      )}
      {стр?.по && !страница && (
        <div className="views-langs">
          <span className="views-label">{п.поЯзыкам.replace('{период}', период)}</span>
          {коды.map((код) => <span key={код}><i className="lang-dot" style={{background: цвета[код]}} /> {код.toUpperCase()} <strong>{число(поЯзыкам[код])}</strong></span>)}
        </div>
      )}
      {ряд && ряд.ряд.length > 0 && !страница && (
        <div className="views-toggles">
          <span className="views-label">{props.settings.просмотры.раскраска}</span>
          {коды.map((код) => (
            <button key={код} className={цветные.includes(код) ? 'order-on' : ''} aria-pressed={цветные.includes(код)}
              style={цветные.includes(код) ? {background: цвета[код], borderColor: цвета[код]} : undefined} onClick={() => переключить(код)}>
              {код.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {ряд && ряд.ряд.length === 0 && <p className="trash-note">{п.нетДанных}</p>}
      {ряд && ряд.ряд.length > 0 && (
        <>
          <BarChart название={поиск ? п.показы : п.просмотры} столбики={столбики('показы')} коды={коды} цвета={цвета} цветные={цветные}
            метки={метки} подписьШага={подписьДня} частыеПодписи={вид.шаг !== 'день'} число={число} кратко={кратко} неполныйТекст={п.неполный} сводкаТекст={п.сводкаИзменений} выбран={номерВыбран < 0 ? null : номерВыбран} onСтолбик={выбрать} />
          {поиск && <BarChart название={п.переходы} столбики={столбики('переходы')} коды={коды} цвета={цвета} цветные={цветные}
            метки={метки} подписьШага={подписьДня} частыеПодписи={вид.шаг !== 'день'} число={число} кратко={кратко} неполныйТекст={п.неполный} сводкаТекст={п.сводкаИзменений} выбран={номерВыбран < 0 ? null : номерВыбран} onСтолбик={выбрать} />}
        </>
      )}

      {выбран && (
        <PeriodBox key={выбран.с} settings={props.settings} период={период} группы={props.изменения(вид.охват, выбран.с, выбран.по)}
          названия={props.названия} onСброс={() => setВыбор(null)} />
      )}

      {стр?.по && (
        <>
          <h3>{п.страницы}</h3>
          <p className="trash-note">{выбран ? п.страницыПериода.replace('{период}', период) : п.поДень.replace('{день}', new Date(`${стр.по}T00:00:00`).toLocaleDateString(язык))}</p>
          <PagesTable settings={props.settings} страницы={стр.страницы} названия={props.названия} толькоПросмотры={!поиск}
            onСтраница={(путь) => props.onВид({охват: `стр:${путь}`, шаг: 'неделя'})} />
        </>
      )}
    </div>
  );
}

/**
 * Неделя — промежутком, а не одной датой начала: «24–30 авг.», через границу месяца — «31 авг. – 6 сент.»
 * (одно число ничего не говорит, слово владельца 2026-09-24).
 */
export function подписьНедели(начало: Date, язык: string): string {
  const конец = new Date(начало.getFullYear(), начало.getMonth(), начало.getDate() + 6);
  const деньМесяц = (дата: Date) => дата.toLocaleDateString(язык, {day: 'numeric', month: 'short'});
  return начало.getMonth() === конец.getMonth()
    ? `${начало.getDate()}–${деньМесяц(конец)}`
    : `${деньМесяц(начало)} – ${деньМесяц(конец)}`;
}
