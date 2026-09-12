import type {Settings} from '../types';

/**
 * Узкая полоса справа под будущие комментарии: постоянно видны только метки, а не текст.
 * Простыни комментариев не должно быть — она съедает ширину у статьи. Меток удалённого здесь
 * больше нет: красные точки мешали читать статью, а сами удаления сравнение по-прежнему знает.
 */
export function CommentGutter(props: {settings: Settings}) {
  return (
    <aside className="gutter gutter-empty">
      <span className="gutter-hint">{props.settings.подписи.нетКомментариев}</span>
    </aside>
  );
}
