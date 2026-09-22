import {изменение} from '../../core/views.mjs';
import {деньСловами, месяцСловами, type ПросмотрыСтатьи} from '../useViews';
import type {Settings} from '../types';

/**
 * Окно аналитики одной статьи поверх реестра: 30 дней против предыдущих 30, те же 30 дней по языкам
 * и помесячно за год. Числа приходят готовыми с сервера (`/api/views`), окно их только показывает.
 * Столбики — обычная разметка: своей библиотеки графиков ради одной картинки программа не заводит.
 */
export function ViewsPanel(props: {
  settings: Settings;
  название: string;
  числа: ПросмотрыСтатьи;
  поДень: string;
  onЗакрыть: () => void;
}) {
  const п = props.settings.просмотры;
  const язык = props.settings.основнойЯзык;
  const {за30, прежние30, языки, месяцы} = props.числа;
  const разница = изменение(за30, прежние30);
  const наибольший = Math.max(1, ...месяцы.map((строка) => строка.просмотры));
  const число = (значение: number) => значение.toLocaleString(язык);

  return (
    <section className="trash-panel views-panel" role="dialog" aria-label={п.заголовок}>
      <div className="trash-head">
        <h2>{п.заголовок}: {props.название}</h2>
        <button className="ghost" onClick={props.onЗакрыть}>{п.закрыть}</button>
      </div>

      <div className="views-compare">
        <div><span className="views-label">{п.за30}</span><strong>{число(за30)}</strong></div>
        <div><span className="views-label">{п.прежние30}</span><strong>{число(прежние30)}</strong></div>
        <div>
          <span className="views-label">{п.изменение}</span>
          <strong className={разница === null ? '' : разница < 0 ? 'views-down' : 'views-up'}>
            {разница === null ? п.нетСравнения : `${разница > 0 ? '+' : ''}${разница}%`}
          </strong>
        </div>
      </div>

      <h3>{п.поЯзыкам}</h3>
      <div className="views-langs">
        {Object.keys(props.settings.локали).map((код) => (
          <span key={код}>{код.toUpperCase()} <strong>{число(языки[код] ?? 0)}</strong></span>
        ))}
        <span>{п.всего} <strong>{число(за30)}</strong></span>
      </div>

      <h3>{п.поМесяцам}</h3>
      <div className="views-months">
        {месяцы.map((строка) => (
          <div className="views-month" key={строка.месяц} title={`${месяцСловами(строка.месяц, язык)}: ${число(строка.просмотры)}`}>
            {/* Столбик растёт в своей области постоянной высоты: подписи под ним его не сжимают. */}
            <span className="views-track">
              <span className="views-bar" style={{height: `${Math.round((строка.просмотры / наибольший) * 100)}%`}} />
            </span>
            <span className="views-count">{число(строка.просмотры)}</span>
            <span className="views-label">{месяцСловами(строка.месяц, язык)}</span>
          </div>
        ))}
      </div>

      <p className="trash-note">{п.поДень.replace('{день}', деньСловами(props.поДень, язык))}</p>
    </section>
  );
}
