// Слой цвета поверх текста: чем отличается от сайта и кто это сделал.
// Сами правила — в core/colorize.ts, здесь только показ.
import {Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate} from '@codemirror/view';
import type {Range} from '@codemirror/state';
import {colorize, type Deletion, type Layer, type LayerKind} from '../core/colorize';

/**
 * Цвета слоёв из настроек — в переменные CSS. Живут здесь, рядом с самим показом слоёв,
 * а не в окне: окно решает, что показывать, а не какого оно цвета.
 */
export function applyLayerColors(слои: Record<string, {цвет: string; подпись?: string; пояснение?: string}>): void {
  const style = document.documentElement.style;
  for (const [key, value] of Object.entries(слои)) {
    style.setProperty(`--layer-${key}`, value.цвет);
    // Подпись и пояснение живут рядом с цветом и достаются человеку подсказкой при наведении:
    // цвет говорит «этот кусок чужой», а подсказка — чей именно, без единой новой кнопки в окне.
    подписи[key] = [value.подпись, value.пояснение].filter(Boolean).join(' — ');
  }
}

const подписи: Record<string, string> = {};

/** Как назвать слой человеку. Своих слов у кода нет: пусто — значит подсказки не будет. */
export function подписьСлоя(kind: string): string {
  return подписи[kind] ?? '';
}

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
    mark.title = `${подписьСлоя('deleted')}: ${this.deleted.trim()}`;
    return mark;
  }
}

/**
 * Цепочка состояний статьи для раскраски: от того, что стоит на сайте, до того, что в файле.
 * Текущий текст окна добавляется в самый конец уже при пересчёте.
 *
 * Порядок — это время, и он важнее всего: раскраска красит по последнему, кто трогал кусок.
 * Файл всегда идёт последним перед текущим текстом — иначе правка человека, ещё не попавшая
 * в историю, показалась бы старше правок ИИ.
 *
 * Статьи ещё нет на сайте: цепочка начинается с самого старого показанного состояния истории,
 * с цветом его автора. Иначе статья, целиком написанная ИИ и не вышедшая, показалась бы своей.
 * Истории тоже нет — остаётся один слой файла, как было до появления авторства.
 */
export function слоиОкна(article: {
  published: string | null;
  body: string;
  /** Тело файла на диске. Отличается от `body`, когда в окно подставлен черновик. */
  телоФайла?: string;
  /** Каким слоем показывать записанное самим человеком: обычно «мои правки». */
  мойСлой?: LayerKind;
  слои?: Layer[];
}): Layer[] {
  const история = article.слои ?? [];
  const сайт: Layer[] = article.published === null ? [] : [{text: article.published, kind: 'site'}];
  // Цепочка кончается тем, что лежит в ФАЙЛЕ. Незаписанная работа из черновика — это не «моя
  // прошлая правка», а то, что человек набрал и ещё не сохранил: её красит текущий слой.
  const файл = article.телоФайла ?? article.body;

  return [...сайт, ...история, {text: файл, kind: article.мойСлой ?? 'prevHuman'}];
}

export function layerColors(
  before: () => Layer[],
  report: (deletions: Deletion[]) => void,
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      /** Цепочка, по которой посчитан нынешний цвет. Сменилась — цвет устарел. */
      private основа: Layer[];

      constructor(view: EditorView) {
        this.основа = before();
        this.decorations = build(view, this.основа, report);
      }

      update(update: ViewUpdate): void {
        // Цвет зависит не только от текста в окне: после сохранения меняется состояние, от которого
        // он считается, — правка, перекрывшая текст ИИ, становится «моей прошлой». Без сверки
        // основы цвет остался бы прежним до следующего набора или прокрутки.
        // Сама сверка идёт только тогда, когда текст не менялся: при наборе она была бы напрасной
        // работой на каждую букву, а там цепочка и так берётся свежей.
        const правка = update.docChanged || update.viewportChanged;
        const свежая = before();
        if (!правка && тоЖе(свежая, this.основа)) return;

        this.основа = свежая;
        this.decorations = build(update.view, свежая, report);
      }
    },
    {decorations: (plugin) => plugin.decorations},
  );
}

/** Одна и та же ли цепочка: и состав слоёв, и их содержимое. */
function тоЖе(a: Layer[], b: Layer[]): boolean {
  return a.length === b.length && a.every((слой, i) => слой.kind === b[i].kind && слой.text === b[i].text);
}

function build(view: EditorView, before: Layer[], report: (deletions: Deletion[]) => void): DecorationSet {
  const text = view.state.doc.toString();
  const {segments, deletions} = colorize([...before, {text, kind: 'current'}]);
  report(deletions);

  const list: Range<Decoration>[] = [];

  for (const segment of segments) {
    if (segment.to <= segment.from) continue;
    const подпись = подписьСлоя(segment.kind);
    list.push(Decoration
      .mark({class: `layer-${segment.kind}`, attributes: подпись === '' ? undefined : {title: подпись}})
      .range(segment.from, Math.min(segment.to, text.length)));
  }

  for (const deletion of deletions) {
    const at = Math.min(deletion.at, text.length);
    list.push(Decoration.widget({widget: new DeletionWidget(deletion.text), side: 1}).range(at));
  }

  return Decoration.set(list, true);
}
