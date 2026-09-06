import type {Settings} from '../types';
import type {Доработка} from '../useRefine';
import type {ЗаписьИтога, ОтчётОбработчика} from '../refineTypes';

type Слова = Settings['доработка'];

/**
 * Окно «Доработать»: перечень обработчиков из плана сервера, каждый своим флажком с предпросмотром,
 * затем итог применения. Имён обработчиков окно не знает: список и порядок приходят из реестра,
 * подпись берётся из настроек по коду, а код без подписи показывается как есть.
 */
export function RefinePanel(props: {settings: Settings; доработка: Доработка}) {
  const д = props.settings.доработка;
  const {окно, план, итог, ошибка, неПеречитана, выбранные} = props.доработка;
  if (окно === 'закрыто') return null;

  const готово = окно === 'готово' && итог !== null;
  const список = (готово ? итог.обработчики : план?.обработчики ?? []).filter((з) => з.применимо);
  const выбран = (з: ОтчётОбработчика) => (готово ? з.выбран : выбранные.includes(з.код));
  const естьРабота = список.some((з) => выбран(з) && з.изменено.length > 0);
  const обслуживание = готово && итог.предупреждения.length > 0
    ? д.обслуживание.replace('{что}', итог.предупреждения.map((код) => д.шагиОбслуживания[код] ?? код).join(', '))
    : null;

  return (
    <section className="refine" aria-label={д.заголовок}>
      <div className="prepare-head">
        <strong>{готово ? (итог.применено ? д.готово : д.нечегоНеИзменилось) : д.заголовок}</strong>
        <button className="ghost" onClick={props.доработка.закрыть} disabled={окно === 'применяю'}>{готово ? д.закрыть : д.отмена}</button>
      </div>

      {ошибка !== null && <p className="refine-error">{ошибка}</p>}
      {неПеречитана && <p className="refine-error">{д.неПеречитана}</p>}
      {обслуживание !== null && <p className="refine-error">{обслуживание}</p>}
      {окно === 'план' && план === null && <p className="prepare-skipped">{д.смотрю}</p>}
      {окно === 'применяю' && <p className="prepare-skipped">{д.применяю}</p>}

      {план !== null && !готово && (
        <>
          <p className="prepare-skipped">{список.length === 0 ? д.нечегоПрименять : д.пояснение}</p>
          <ul className="prepare-list">
            {список.map((з) => (
              <li key={з.код} className="refine-item">
                <label className="refine-label">
                  <input type="checkbox" checked={выбран(з)} disabled={окно !== 'выбор'} onChange={() => props.доработка.переключить(з.код)} />
                  <span>{д.обработчики[з.код] ?? з.код}</span>
                  <span className="refine-count">{счёт(з, д)}</span>
                </label>
                <Подробности з={з} д={д} />
              </li>
            ))}
          </ul>
          <div className="refine-actions">
            <button className="ghost ghost-main" disabled={окно !== 'выбор' || !естьРабота} onClick={() => void props.доработка.применить()}>
              {д.применить}
            </button>
          </div>
        </>
      )}

      {готово && (
        <ul className="prepare-list">
          {список.filter((з) => з.выбран).map((з) => (
            <li key={з.код} className="refine-item">
              <div className="refine-label">
                <span>{д.обработчики[з.код] ?? з.код}</span>
                <span className="refine-count">{счёт(з, д)}</span>
              </div>
              <Подробности з={з} д={д} открыто />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Три числа итога одной строкой: изменено, оставлено, требует человека. */
function счёт(з: ОтчётОбработчика, д: Слова): string {
  return `${д.итог.изменено}: ${з.изменено.length} · ${д.итог.оставлено}: ${з.оставлено.length} · ${д.итог.человеку}: ${з.человеку.length}`;
}

/** Точный предпросмотр: что, было и стало, либо причина. Свёрнут, чтобы не заслонять список. */
function Подробности(props: {з: ОтчётОбработчика; д: Слова; открыто?: boolean}) {
  const {з, д} = props;
  const строки = [
    ...з.изменено.map((з1, i) => ({ключ: `и${i}`, класс: 'refine-changed', текст: `${з1.что}: ${з1.было || '—'} → ${з1.стало ?? ''}`})),
    ...з.оставлено.map((з1, i) => ({ключ: `о${i}`, класс: 'refine-kept', текст: причина(з1, д)})),
    ...з.человеку.map((з1, i) => ({ключ: `ч${i}`, класс: 'refine-human', текст: причина(з1, д)})),
  ];
  if (строки.length === 0) return null;
  return (
    <details className="refine-details" open={props.открыто}>
      <summary>{д.подробности}</summary>
      <ul>{строки.map((с) => <li key={с.ключ} className={с.класс}>{с.текст}</li>)}</ul>
    </details>
  );
}

function причина(з: ЗаписьИтога, д: Слова): string {
  const слова = з.причина === undefined ? '' : д.причины[з.причина] ?? з.причина;
  return `${з.что}${з.значение ? ` (${з.значение})` : ''} — ${слова}`;
}
