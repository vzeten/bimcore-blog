// Живой показ markdown: два слоя, блочный и внутристрочный.
import {tableLayer} from './tables';
import {inlinePreview} from './inline';

export function livePreview(article: () => string) {
  return [tableLayer(), inlinePreview(article)];
}
