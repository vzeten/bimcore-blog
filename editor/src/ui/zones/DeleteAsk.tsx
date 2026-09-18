import {useId, useRef} from 'react';
import {label} from '../labels';
import {useFocusTrap} from '../focusTrap';
import {формаЧисла} from '../../core/wordForm.mjs';
import type {Предложение} from '../useDelete';
import type {Settings} from '../types';

/**
 * Вторая строка вопроса: какие версии уйдут, словами (решение владельца 2026-09-19). «Русская,
 * английская и испанская версии уйдут в корзину и пропадут с сайта»; одна версия — единственным
 * числом. Прилагательные языков, союз и фразы — в настройках, порядок — как у языков в настройках.
 */
export function чтоУйдёт(языки: string[], наСайте: boolean, settings: Settings): string {
  const порядок = Object.keys(settings.локали);
  const слова = [...языки].sort((a, b) => порядок.indexOf(a) - порядок.indexOf(b))
    .map((код) => settings.версииЯзыков[код] ?? код);
  const перечень = слова.length > 1 ? `${слова.slice(0, -1).join(', ')}${settings.подписи.союзИ}${слова.at(-1)}` : (слова[0] ?? '');
  const одна = слова.length === 1;
  const фраза = наСайте ? (одна ? 'удалениеССайтаОдна' : 'удалениеССайта') : (одна ? 'удалениеБезСайтаОдна' : 'удалениеБезСайта');
  const текст = (settings.подписи[фраза] ?? фраза).replace('{языки}', перечень);
  return текст.charAt(0).toUpperCase() + текст.slice(1);
}

/**
 * Единственный вопрос удаления — окном поверх всей программы (решение владельца 2026-09-18, п.6).
 * Пока оно открыто, остальное окно заперто: слой перекрывает всё, а `Tab` ходит только по кнопкам
 * вопроса (`useFocusTrap`), — правка, начатая под вопросом, ушла бы в корзину мимо черновика.
 * Escape — то же, что «Отмена»; после «Удалить» ход доводится до конца, и закрыть окно нельзя ничем.
 */
export function DeleteAsk(props: {
  settings: Settings;
  название: string;
  предложение: Предложение;
  идёт: boolean;
  onУдалить: () => void;
  onОтмена: () => void;
}) {
  const п = props.settings.подписи;
  const отмена = useRef<HTMLButtonElement>(null);
  const {окно, onKeyDown} = useFocusTrap(отмена);
  const заголовок = useId();
  const статей = props.предложение.статей;
  const название = props.предложение.название || props.название;

  return (
    <div
      ref={окно}
      className="delete-ask"
      role="dialog"
      aria-modal="true"
      aria-labelledby={заголовок}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !props.идёт) props.onОтмена();
        onKeyDown(event);
      }}
    >
      <div className="delete-ask-body">
        <p id={заголовок} className="delete-ask-title">{label('удалениеВопрос', {название})}</p>
        <p className="delete-ask-text">
          {чтоУйдёт(props.предложение.языки ?? [], props.предложение.наСайте, props.settings)}
          {props.предложение.наСайте && статей > 0 && (
            <> {label('удалениеСсылки', {n: статей, статьях: формаЧисла(статей, props.settings.склонения.вСтатьях) as string})}</>
          )}
        </p>
        <div className="delete-ask-buttons">
          <button className="delete-ask-go" disabled={props.идёт} onClick={props.onУдалить}>
            {props.идёт ? п.удалениеИдёт : п.удалить}
          </button>
          <button ref={отмена} className="ghost" disabled={props.идёт} onClick={props.onОтмена}>
            {п.отменитьУдаление}
          </button>
        </div>
      </div>
    </div>
  );
}
