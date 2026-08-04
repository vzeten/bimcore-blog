import type {Deletion} from '../../core/colorize';
import type {Settings} from '../types';
import {label} from '../labels';

/**
 * Узкая полоса справа: постоянно видны только метки, а не текст.
 * Простыни комментариев не должно быть — она съедает ширину у статьи.
 */
export function CommentGutter(props: {settings: Settings; deletions: Deletion[]}) {
  const п = props.settings.подписи;

  if (props.deletions.length === 0) {
    return (
      <aside className="gutter gutter-empty">
        <span className="gutter-hint">{п.нетКомментариев}</span>
      </aside>
    );
  }

  return (
    <aside className="gutter">
      {props.deletions.map((item, index) => (
        <span
          key={`${item.at}-${index}`}
          className="gutter-mark"
          title={`${label('удалено')}: ${item.text.trim()}`}
        />
      ))}
    </aside>
  );
}
