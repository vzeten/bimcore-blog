import type {EditorView} from '@codemirror/view';
import {сменаСвойства, значениеСвойства} from '../../core/jsxBlocks';
import type {БлокВОкне} from '../livePreview/blocks';
import type {Settings} from '../types';

export function BlockPanel(props: {
  settings: Settings;
  блок: БлокВОкне;
  view: EditorView;
  onClose: () => void;
}) {
  const п = props.settings.подписи;
  const описание = props.settings.блоки[props.блок.имя];
  if (описание === undefined) return null;

  return (
    <div className="block-panel" style={{left: место(props.блок.left), top: props.блок.top + 6}}>
      <div className="block-panel-head">
        <div className="block-panel-name">{описание.подпись}</div>
        <button className="block-panel-close" onClick={props.onClose} title={п.блокЗакрыть}>✕</button>
      </div>

      {описание.поля.length === 0 && <div className="block-panel-empty">{п.блокБезСвойств}</div>}

      {описание.поля.map((поле) => {
        const записано = значениеСвойства(props.блок.текст, поле.имя);
        return (
          <label className="block-panel-field" key={поле.имя}>
            <span>{поле.подпись}</span>
            <select value={записано ?? ''} onChange={(event) => применить(поле.имя, event.target.value)}>
              {записано === null && <option value="">—</option>}
              {записано !== null && поле.значения[записано] === undefined && (
                <option value={записано}>{п.блокНеизвестен.split('{значение}').join(записано)}</option>
              )}
              {Object.entries(поле.значения).map(([значение, подпись]) => (
                <option key={значение} value={значение}>{подпись}</option>
              ))}
            </select>
          </label>
        );
      })}

    </div>
  );

  function применить(имя: string, значение: string): void {
    const {from, to, текст} = props.блок;
    const узел = props.view.state.sliceDoc(from, to);

    // Позиция узла устарела: текст под панелью уже другой, и правка легла бы не туда.
    if (узел !== текст) {
      props.onClose();
      return;
    }

    const новый = сменаСвойства(текст, имя, значение);
    if (новый !== null && новый !== текст) {
      props.view.dispatch({changes: {from, to, insert: новый}});
    }
    props.onClose();
  }
}

function место(left: number): number {
  return Math.max(8, Math.min(left, window.innerWidth - 280));
}
