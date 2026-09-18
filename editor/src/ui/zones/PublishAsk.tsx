import {useId, useRef} from 'react';
import {useFocusTrap} from '../focusTrap';
import {РЕЖИМЫ} from '../../core/siteAccess.mjs';
import {формаЧисла} from '../../core/wordForm.mjs';
import {Находки} from './PublishReason';
import type {ОкноПубликации} from '../usePublish';
import type {ВерсияНаСайте} from '../publishTypes';
import type {Settings} from '../types';

/** Доступность, после которой страницы версии на сайте нет. Имя — из правила ядра (`siteAccess`). */
const НЕДОСТУПНО = 'недоступно';

/**
 * Единственный вопрос публикации — окном поверх программы (решение владельца 2026-09-18, п.2, макет
 * одобрен). Заголовок «Опубликовать»; блок «Языки» — открытый язык с неснимаемой галочкой и его
 * нынешним состоянием НА САЙТЕ (разметка — списком: несколько языков придут этапом 3); блок
 * «Доступность на сайте» — три ответа, «Доступно всем» по умолчанию; при «Недоступно» у версии,
 * которая сейчас на сайте, — сколько статей получат правку ссылок; замечания проверки свёрнуты.
 *
 * Пока окно открыто, остальное заперто: слой перекрывает программу, `Tab` ходит только по окну,
 * Escape — то же, что «Отмена».
 */
export function PublishAsk(props: {
  settings: Settings;
  path: string;
  окно: ОкноПубликации;
  onВыбрать: (режим: string) => void;
  onОпубликовать: () => void;
  onОтмена: () => void;
}) {
  const п = props.settings.публикация;
  const отмена = useRef<HTMLButtonElement>(null);
  const {окно, onKeyDown} = useFocusTrap(отмена);
  const заголовок = useId();
  const {состояние, выбор, находки} = props.окно;
  const своя = состояние?.локали.find((версия) => версия.путь === props.path) ?? null;
  const ссылок = своя?.наСайте === true && своя.доступность !== НЕДОСТУПНО ? своя.ссылок : 0;

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
          <li>
            <label>
              <input type="checkbox" checked disabled readOnly />
              {props.settings.локали[своя?.локаль ?? ''] ?? своя?.локаль ?? props.path}
            </label>
            <span className="publish-quiet-inline">{п.сейчас} {сейчасНаСайте(своя, props.окно, п)}</span>
          </li>
        </ul>

        <fieldset className="publish-доступность">
          <legend>{props.settings.доступность.подпись}</legend>
          <div className="publish-сегменты" role="radiogroup" aria-label={props.settings.доступность.подпись}>
            {/* Порядок макета: от открытого к закрытому, «Доступно всем» первым и по умолчанию. */}
            {[...(РЕЖИМЫ as string[])].reverse().map((значение) => (
              <label key={значение}>
                <input
                  type="radio"
                  name={`публикация:${props.path}`}
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

        {находки !== null && находки.length > 0 && (
          <details className="publish-ask-notes">
            <summary>{п.замечания.replace('{n}', String(находки.length))}</summary>
            <Находки список={находки} settings={props.settings} />
          </details>
        )}

        <div className="delete-ask-buttons">
          <button type="button" className="ghost ghost-main" onClick={props.onОпубликовать}>{п.даПубликовать}</button>
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
