import type {Settings} from '../types';
import type {Доработка} from '../useRefine';
import type {ЗаписьИтога, ОтчётОбработчика} from '../refineTypes';

/**
 * Окно «Доработать»: перечень обработчиков из плана сервера, каждый своим флажком с предпросмотром,
 * затем итог применения. Имён обработчиков окно не знает: список и порядок приходят из реестра,
 * подпись берётся из настроек по коду, а код без подписи показывается как есть.
 */
export function RefinePanel(props: {settings: Settings; доработка: Доработка}) {
  const д = props.settings.доработка;
  const {окно, план, итог, ошибка, предупреждение, выбранные} = props.доработка;
  if (окно === 'закрыто') return null;

  const готово = окно === 'готово' && итог !== null;
  const список = готово ? итог.обработчики : план?.обработчики ?? [];
  const применимые = список.filter((з) => з.применимо);
  const выбран = (з: ОтчётОбработчика) => (готово ? з.выбран : выбранные.includes(з.код));
  const естьРабота = применимые.some((з) => выбран(з) && з.изменено.length > 0);

  return (
    <section className="refine" aria-label={д.заголовок}>
      <div className="prepare-head">
        <strong>{готово ? (итог.применено ? д.готово : д.нечегоНеИзменилось) : д.заголовок}</strong>
        <button className="ghost" onClick={props.доработка.закрыть} disabled={окно === 'применяю'}>
          {готово ? д.закрыть : д.отмена}
        </button>
      </div>

      {ошибка !== null && <p className="refine-error">{ошибка}</p>}
      {предупреждение !== null && <p className="refine-error">{д[предупреждение as 'неПеречитана'] ?? предупреждение}</p>}
      {окно === 'план' && план === null && <p className="prepare-skipped">{д.смотрю}</p>}
      {окно === 'применяю' && <p className="prepare-skipped">{д.применяю}</p>}

      {план !== null && !готово && (
        <>
          <p className="prepare-skipped">{д.пояснение}</p>
          {применимые.length === 0 && <p className="prepare-skipped">{д.нечегоПрименять}</p>}
          <ul className="prepare-list">
            {список.map((з) => (
              <li key={з.код} className={з.применимо ? 'refine-item' : 'refine-item refine-off'}>
                <label className="refine-label">
                  <input
                    type="checkbox"
                    checked={выбран(з) && з.применимо}
                    disabled={!з.применимо || окно !== 'выбор'}
                    onChange={() => props.доработка.переключить(з.код)}
                  />
                  <span>{д.обработчики[з.код] ?? з.код}</span>
                  <span className="refine-count">{з.применимо ? счёт(з, д) : д.неприменимо}</span>
                </label>
                {з.применимо && <Подробности з={з} д={д} />}
              </li>
            ))}
          </ul>
          <div className="refine-actions">
            <button
              className="ghost ghost-main"
              disabled={окно !== 'выбор' || !естьРабота}
              onClick={() => void props.доработка.применить()}
            >
              {окно === 'применяю' ? д.применяю : д.применить}
            </button>
          </div>
        </>
      )}

      {готово && (
        <ul className="prepare-list">
          {список.filter((з) => з.выбран && з.применимо).map((з) => (
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
function счёт(з: ОтчётОбработчика, д: Settings['доработка']): string {
  return [
    `${д.итог.изменено}: ${з.изменено.length}`,
    `${д.итог.оставлено}: ${з.оставлено.length}`,
    `${д.итог.человеку}: ${з.человеку.length}`,
  ].join(' · ');
}

/** Точный предпросмотр: что, было и стало, либо причина. Свёрнут, чтобы не заслонять список. */
function Подробности(props: {з: ОтчётОбработчика; д: Settings['доработка']; открыто?: boolean}) {
  const {з, д} = props;
  const строки: {ключ: string; класс: string; текст: string}[] = [
    ...з.изменено.map((з1, i) => ({ключ: `и${i}`, класс: 'refine-changed', текст: строка(з1, д, 'изменено')})),
    ...з.оставлено.map((з1, i) => ({ключ: `о${i}`, класс: 'refine-kept', текст: строка(з1, д, 'оставлено')})),
    ...з.человеку.map((з1, i) => ({ключ: `ч${i}`, класс: 'refine-human', текст: строка(з1, д, 'человеку')})),
  ];
  if (строки.length === 0) return null;

  return (
    <details className="refine-details" open={props.открыто}>
      <summary>{д.подробности}</summary>
      <ul>
        {строки.map((с) => <li key={с.ключ} className={с.класс}>{с.текст}</li>)}
      </ul>
    </details>
  );
}

function строка(з: ЗаписьИтога, д: Settings['доработка'], вид: 'изменено' | 'оставлено' | 'человеку'): string {
  if (вид === 'изменено') return `${з.что}: ${з.было === '' || з.было === undefined ? '—' : з.было} → ${з.стало ?? ''}`;
  const причина = з.причина === undefined ? '' : д.причины[з.причина] ?? з.причина;
  const значение = з.значение === undefined || з.значение === '' ? '' : ` (${з.значение})`;
  return `${з.что}${значение} — ${причина}`;
}
