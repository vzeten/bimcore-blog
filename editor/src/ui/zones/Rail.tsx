import type {PanelMode, Settings} from '../types';

/** Узкая полоса слева: единственная постоянная навигация. Панели выдвигаются по нажатию. */
export function Rail(props: {
  settings: Settings;
  mode: PanelMode;
  articleOpen: boolean;
  onMode: (mode: PanelMode) => void;
}) {
  const п = props.settings.подписи;

  const кнопка = (mode: Exclude<PanelMode, null>, знак: string, подпись: string, доступна = true) => (
    <button
      className={props.mode === mode ? 'rail-on' : ''}
      title={подпись}
      disabled={!доступна}
      onClick={() => props.onMode(props.mode === mode ? null : mode)}
    >
      {знак}
    </button>
  );

  return (
    <nav className="rail">
      {кнопка('статьи', '☰', п.статьи)}
      {кнопка('версии', '◷', п.версии, props.articleOpen)}
    </nav>
  );
}
