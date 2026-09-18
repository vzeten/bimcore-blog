import type {Settings} from '../types';

/**
 * Спокойная полоса сообщения: текст и способ его убрать. Статью не перекрывает. Ошибка — розовая,
 * удача — нейтральная, без красного (проба владельца 2026-09-19).
 */
export function ErrorBar(props: {settings: Settings; текст: string | null; удача?: boolean; onЗакрыть: () => void}) {
  if (!props.текст) return null;

  return (
    <div className={props.удача ? 'errorbar errorbar-ok' : 'errorbar'} role={props.удача ? 'status' : 'alert'}>
      <span>{props.текст}</span>
      <button className="errorbar-close" onClick={props.onЗакрыть}>{props.settings.подписи.закрытьОшибку}</button>
    </div>
  );
}
