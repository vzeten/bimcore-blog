import {useId, useRef} from 'react';
import {useFocusTrap} from '../focusTrap';
import {РЕЖИМЫ} from '../../core/siteAccess.mjs';
import {формаЧисла} from '../../core/wordForm.mjs';
import {словаНаходки} from './PublishReason';
import {кПубликации, лишниеОтмеченных, ссылокВОтмеченных, строкиЯзыков} from '../publishLangs';
import type {ОкноПубликации} from '../usePublish';
import type {ВерсияНаСайте} from '../publishTypes';
import type {Settings} from '../types';

/** Доступность, после которой страницы версии на сайте нет. Имя — из правила ядра (`siteAccess`). */
const НЕДОСТУПНО = 'недоступно';

/**
 * Единственный вопрос публикации — окном поверх программы (решение владельца 2026-09-18, п.2, макет
 * одобрен). Заголовок «Опубликовать»; блок «Языки» — каждый язык сайта с его нынешним состоянием НА
 * САЙТЕ, галочки только у версий, чей файл есть у человека (этап 3): по умолчанию отмечен открытый,
 * снять можно любой, но без отмеченных кнопка «Опубликовать» заперта; блок «Доступность на сайте» —
 * три ответа, один на все отмеченные, «Доступно всем» по умолчанию; при «Недоступно» — в скольких
 * статьях уберутся ссылки на отмеченные версии, живые на сайте; замечания проверки свёрнуты.
 *
 * Пока окно открыто, остальное заперто: слой перекрывает программу, `Tab` ходит только по окну,
 * Escape — то же, что «Отмена».
 */
export function PublishAsk(props: {
  settings: Settings;
  path: string;
  окно: ОкноПубликации;
  onВыбрать: (режим: string) => void;
  /** Языковые версии статьи по своду (язык → путь): список языков до ответа сервера. */
  версии?: Record<string, string>;
  onОтметить: (путь: string) => void;
  onОпубликовать: () => void;
  onОтмена: () => void;
}) {
  const п = props.settings.публикация;
  const отмена = useRef<HTMLButtonElement>(null);
  const {окно, onKeyDown} = useFocusTrap(отмена);
  const заголовок = useId();
  const {выбор, находки} = props.окно;
  const порядок = Object.keys(props.settings.локали);
  const строки = строкиЯзыков(props.окно.состояние, props.path, props.окно.отмечены, props.версии ?? {}, порядок);
  const ссылок = ссылокВОтмеченных(строки);
  // Что уберётся из папки отмеченных языков. Человек видит это ДО согласия: публикация унесёт эти
  // файлы в корзину и уберёт их с сайта, а узнать о таком после дела он не должен.
  const лишние = лишниеОтмеченных(props.окно.состояние, props.окно.отмечены);
  // Пути человеку не показываются никогда: язык без кода (песочница) узнаётся по своду статьи.
  const своя = Object.entries(props.версии ?? {}).find(([, путь]) => путь === props.path)?.[0] ?? null;
  const имя = (локаль: string | null, путь: string) => {
    const код = локаль ?? (путь === props.path ? своя : null);
    return код === null ? '' : props.settings.локали[код] ?? код;
  };

  return (
    <div
      ref={окно}
      className="delete-ask"
      role="dialog"
      aria-modal="true"
      aria-labelledby={заголовок}
      onKeyDown={(event) => {
        if (event.key === 'Escape') props.onОтмена();
        onKeyDown(event);
      }}
    >
      <div className="delete-ask-body">
        <p id={заголовок} className="delete-ask-title">{п.заголовок}</p>

        <p className="publish-ask-head">{п.языки}</p>
        <ul className="publish-ask-langs">
          {строки.map((строка) => (
            <li key={строка.путь}>
              {/* Галочка — только у версии, чей файл есть: публиковать то, чего нет, нечем. */}
              {строка.можноОтметить ? (
                <label>
                  <input type="checkbox" checked={строка.отмечен} onChange={() => props.onОтметить(строка.путь)} />
                  {имя(строка.локаль, строка.путь)}
                </label>
              ) : <span className="publish-ask-nofile">{имя(строка.локаль, строка.путь)}</span>}
              <span className="publish-quiet-inline">{п.сейчас} {сейчасНаСайте(строка.версия, props.окно, п)}</span>
            </li>
          ))}
        </ul>

        <fieldset className="publish-доступность">
          <legend>{props.settings.доступность.подпись}</legend>
          <div className="publish-сегменты" role="radiogroup" aria-label={props.settings.доступность.подпись}>
            {/* Порядок макета: от открытого к закрытому, «Доступно всем» первым и по умолчанию. */}
            {[...(РЕЖИМЫ as string[])].reverse().map((значение) => (
              <label key={значение}>
                <input
                  type="radio"
                  name={`публикация:${заголовок}`}
                  value={значение}
                  checked={выбор === значение}
                  onChange={() => props.onВыбрать(значение)}
                />
                <span>{props.settings.доступность[значение]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* «Недоступно» убирает страницу, поэтому ссылки на неё уйдут той же публикацией (п.7). */}
        {выбор === НЕДОСТУПНО && ссылок > 0 && (
          <p className="publish-ask-links">
            {п.ссылкиУберутся.replace('{n}', String(ссылок)).replace('{статьях}', формаЧисла(ссылок, props.settings.склонения.вСтатьях) as string)}
          </p>
        )}

        {лишние.length > 0 && (
          <div className="publish-ask-extra">
            <p className="publish-ask-head">{п.лишние}</p>
            <ul className="publish-ask-list">
              {лишние.map((имя) => <li key={имя}>{имя}</li>)}
            </ul>
          </div>
        )}

        {находки !== null && находки.length > 0 && (
          <details className="publish-ask-notes">
            <summary>{п.замечания.replace('{n}', String(находки.length))}</summary>
            {/* Каждое замечание — одна строка тем же шрифтом, без колонки уровня (макет владельца). */}
            <ul className="publish-ask-list">
              {находки.map((находка, номер) => <li key={`${находка.код}|${номер}`}>{словаНаходки(находка, props.settings)}</li>)}
            </ul>
          </details>
        )}

        <div className="delete-ask-buttons">
          <button type="button" className="ghost ghost-main" disabled={кПубликации(строки).length === 0} onClick={props.onОпубликовать}>
            {п.даПубликовать}
          </button>
          <button ref={отмена} type="button" className="ghost" onClick={props.onОтмена}>{п.неПубликовать}</button>
        </div>
      </div>
    </div>
  );
}

/** «Сейчас: …» — по опубликованной основе, а не по файлу. Пока не узнали — так и сказано. */
function сейчасНаСайте(своя: ВерсияНаСайте | null, окно: ОкноПубликации, п: Settings['публикация']): string {
  if (окно.неУзнали || (окно.состояние !== null && !окно.состояние.основаИзвестна)) return п.состояния['неизвестно'];
  if (окно.состояние === null || своя === null) return п.состояния['узнаю'];
  if (своя.наСайте !== true) return п.состояния['нет'];
  return п.состояния[своя.доступность ?? 'неизвестно'] ?? своя.доступность ?? '';
}
