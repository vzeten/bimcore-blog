// Живой показ markdown: два слоя, блочный и внутристрочный, блоки статьи, блок совета, склейка
// мягких переносов абзаца плюс поведение курсора у картинок.
import {tableLayer} from './tables';
import {softBreakLayer} from './softBreak';
import {tipLayer} from './tip';
import {inlinePreview, type КартинкаВОкне} from './inline';
import {blockPreview, type БлокВОкне} from './blocks';
import {каретМимоКартинок} from './imageCaret';
import type {ОписаниеБлока} from '../types';

export function livePreview(
  article: () => string,
  блоки: Record<string, ОписаниеБлока>,
  названиеСовета: string,
  onImage?: (картинка: КартинкаВОкне) => void,
  onБлок?: (блок: БлокВОкне) => void,
) {
  return [
    tableLayer(),
    softBreakLayer(),
    tipLayer(названиеСовета),
    inlinePreview(article, onImage),
    blockPreview(блоки, onБлок),
    каретМимоКартинок(),
  ];
}
