import {useEffect, useRef} from 'react';
import {label} from '../labels';
import type {Предложение} from '../useDelete';
import type {Settings} from '../types';

/**
 * Единственный вопрос удаления — окном поверх всей программы (решение владельца 2026-09-18, п.6).
 * Пока оно открыто, остальное окно заперто: правка, начатая под вопросом, ушла бы в корзину
 * мимо черновика. Escape — то же, что «Отмена»; после «Удалить» ход доводится до конца, и закрыть
 * окно нельзя ничем.
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

  // Фокус уходит в окно вопроса: иначе набор продолжал бы идти в текст статьи под ним.
  useEffect(() => {
    отмена.current?.focus();
  }, []);

  return (
    <div
      className="delete-ask"
      role="dialog"
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !props.идёт) props.onОтмена();
      }}
    >
      <div className="delete-ask-body">
        <p className="delete-ask-title">{label('удалениеВопрос', {название: props.название})}</p>
        <p className="delete-ask-text">
          {props.предложение.наСайте ? п.удалениеССайта : п.удалениеБезСайта}
          {props.предложение.наСайте && props.предложение.статей > 0 && (
            <> {label('удалениеСсылки', {n: props.предложение.статей})}</>
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
