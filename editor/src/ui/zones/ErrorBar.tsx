import type {Settings} from '../types';

/** Спокойная полоса ошибки: сообщение и способ его убрать. Статью не перекрывает. */
export function ErrorBar(props: {settings: Settings; текст: string | null; onЗакрыть: () => void}) {
  if (!props.текст) return null;

  return (
    <div className="errorbar" role="alert">
      <span>{props.текст}</span>
      <button className="errorbar-close" onClick={props.onЗакрыть}>{props.settings.подписи.закрытьОшибку}</button>
    </div>
  );
}
