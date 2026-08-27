// Живой показ markdown: два слоя, блочный и внутристрочный, блоки статьи, склейка мягких переносов
// абзаца плюс поведение курсора у картинок.
import {tableLayer} from './tables';
import {softBreakLayer} from './softBreak';
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
  return [
    tableLayer(),
    softBreakLayer(),
    inlinePreview(article, onImage),
    blockPreview(блоки, onБлок),
    каретМимоКартинок(),
  ];
}
