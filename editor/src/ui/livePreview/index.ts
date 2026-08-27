// Живой показ markdown: два слоя, блочный и внутристрочный, блоки статьи плюс поведение курсора
// у картинок.
import {tableLayer} from './tables';
import {inlinePreview, type КартинкаВОкне} from './inline';
import {blockPreview, type БлокВОкне} from './blocks';
import {каретМимоКартинок} from './imageCaret';
import type {ОписаниеБлока} from '../types';

export function livePreview(
  article: () => string,
  блоки: Record<string, ОписаниеБлока>,
  onImage?: (картинка: КартинкаВОкне) => void,
  onБлок?: (блок: БлокВОкне) => void,
) {
  return [tableLayer(), inlinePreview(article, onImage), blockPreview(блоки, onБлок), каретМимоКартинок()];
}
