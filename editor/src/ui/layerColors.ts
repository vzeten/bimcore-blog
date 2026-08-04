// Слой цвета поверх текста: чем отличается от сайта и кто это сделал.
// Сами правила — в core/colorize.ts, здесь только показ.
import {Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate} from '@codemirror/view';
import type {Range} from '@codemirror/state';
import {colorize, type Deletion, type Layer} from '../core/colorize';
import {label} from './labels';

class DeletionWidget extends WidgetType {
  constructor(private readonly deleted: string) {
    super();
  }

  eq(other: DeletionWidget): boolean {
    return other.deleted === this.deleted;
  }

  toDOM(): HTMLElement {
    const mark = document.createElement('span');
    mark.className = 'layer-deleted';
    mark.title = `${label('удалено')}: ${this.deleted.trim()}`;
    return mark;
  }
}

export function layerColors(
  before: () => Layer[],
  report: (deletions: Deletion[]) => void,
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view, before(), report);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = build(update.view, before(), report);
        }
      }
    },
    {decorations: (plugin) => plugin.decorations},
  );
}

function build(view: EditorView, before: Layer[], report: (deletions: Deletion[]) => void): DecorationSet {
  const text = view.state.doc.toString();
  const {segments, deletions} = colorize([...before, {text, kind: 'current'}]);
  report(deletions);

  const list: Range<Decoration>[] = [];

  for (const segment of segments) {
    if (segment.to <= segment.from) continue;
    list.push(Decoration.mark({class: `layer-${segment.kind}`}).range(segment.from, Math.min(segment.to, text.length)));
  }

  for (const deletion of deletions) {
    const at = Math.min(deletion.at, text.length);
    list.push(Decoration.widget({widget: new DeletionWidget(deletion.text), side: 1}).range(at));
  }

  return Decoration.set(list, true);
}
