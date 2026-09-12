// Живой показ markdown: два слоя, блочный и внутристрочный, блоки статьи, блок совета, переносы
// абзаца. Границы и поведение курсора у скрытого задаёт карта поверхности (`editor/structureGuard.ts`).
import {tableLayer} from './tables';
import {softBreakLayer} from './softBreak';
import {tipLayer} from './tip';
import {inlinePreview, type КартинкаВОкне} from './inline';
import {blockLayer, type БлокВОкне} from './blocks';
import type {ОписаниеБлока} from '../types';

export function livePreview(
  article: () => string,
  блоки: Record<string, ОписаниеБлока>,
  названиеСовета: Record<string, string>,
  onImage?: (картинка: КартинкаВОкне) => void,
  onБлок?: (блок: БлокВОкне) => void,
) {
  return [
    tableLayer(),
    softBreakLayer(),
    tipLayer(названиеСовета),
    inlinePreview(article, onImage),
    blockLayer(блоки, article, onБлок),
  ];
}
