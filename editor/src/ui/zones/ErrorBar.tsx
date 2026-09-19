import type {Settings} from '../types';
import type {Действие} from '../useMessage';

/**
 * Спокойная полоса сообщения: текст и способ его убрать. Статью не перекрывает. Ошибка — розовая,
 * удача — нейтральная, без красного (проба владельца 2026-09-19).
 */
export function ErrorBar(props: {settings: Settings; текст: string | null; удача?: boolean; действие?: Действие | null; onЗакрыть: () => void}) {
  if (!props.текст) return null;

  return (
    <div className={props.удача ? 'errorbar errorbar-ok' : 'errorbar'} role={props.удача ? 'status' : 'alert'}>
      <span>{props.текст}</span>
      {props.действие && (
        <button className="errorbar-close" onClick={() => {
          props.действие?.сделать();
          props.onЗакрыть();
        }}>{props.действие.подпись}</button>
      )}
      <button className="errorbar-close" onClick={props.onЗакрыть}>{props.settings.подписи.закрытьОшибку}</button>
    </div>
  );
}
