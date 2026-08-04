import type {Settings} from '../types';

/**
 * Лента версий горизонтальной полосой: время читается слева направо,
 * и она не отъедает ширину у текста, в отличие от колонки.
 * Наполняется в заданиях В1-11 и В1-13.
 */
export function VersionStrip(props: {settings: Settings; visible: boolean}) {
  if (!props.visible) return null;

  return (
    <div className="strip">
      <span className="strip-label">{props.settings.подписи.версии}</span>
      <span className="strip-empty">{props.settings.подписи.нетВерсий}</span>
    </div>
  );
}
