// Живой показ markdown: два слоя, блочный и внутристрочный, плюс поведение курсора у картинок.
import {tableLayer} from './tables';
import {inlinePreview, type КартинкаВОкне} from './inline';
import {каретМимоКартинок} from './imageCaret';

export function livePreview(article: () => string, onImage?: (картинка: КартинкаВОкне) => void) {
  return [tableLayer(), inlinePreview(article, onImage), каретМимоКартинок()];
}
