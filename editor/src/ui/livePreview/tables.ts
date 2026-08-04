// Таблицы: показываются готовым видом, разметка возвращается при входе курсором.
import {Decoration, EditorView, WidgetType, type DecorationSet} from '@codemirror/view';
import {StateField, type EditorState, type Range} from '@codemirror/state';

function renderInline(text: string, host: HTMLElement): void {
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let found: RegExpExecArray | null;

  while ((found = pattern.exec(text)) !== null) {
    if (found.index > last) host.append(text.slice(last, found.index));

    if (found[1] !== undefined) {
      const link = document.createElement('span');
      link.className = 'md-link';
      link.textContent = found[1];
      host.append(link);
    } else if (found[3] !== undefined) {
      const bold = document.createElement('strong');
      bold.textContent = found[3];
      host.append(bold);
    } else if (found[4] !== undefined) {
      const code = document.createElement('code');
      code.textContent = found[4];
      host.append(code);
    }

    last = found.index + found[0].length;
  }

  if (last < text.length) host.append(text.slice(last));
}

class TableWidget extends WidgetType {
  constructor(private readonly rows: string[]) {
    super();
  }

  eq(other: TableWidget): boolean {
    return other.rows.join('\n') === this.rows.join('\n');
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'md-table-wrap';

    const table = document.createElement('table');
    const body = this.rows.filter((row) => !/^\|?[\s:|-]+\|?$/.test(row.trim()));

    body.forEach((row, index) => {
      const line = document.createElement('tr');
      const cells = row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');

      for (const cell of cells) {
        const box = document.createElement(index === 0 ? 'th' : 'td');
        renderInline(cell.trim(), box);
        line.append(box);
      }

      table.append(line);
    });

    wrap.append(table);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Таблицы живут отдельным слоем: замена целых строк на готовый вид
 * разрешена только через состояние редактора, плагину это запрещено.
 */
export function tableLayer() {
  return StateField.define<DecorationSet>({
    create: (state) => buildTables(state),
    update: (value, tr) => (tr.docChanged || tr.selection ? buildTables(tr.state) : value),
    provide: (field) => EditorView.decorations.from(field),
  });
}

function buildTables(state: EditorState): DecorationSet {
  const list: Range<Decoration>[] = [];
  const doc = state.doc;

  const activeLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = doc.lineAt(range.from).number;
    const last = doc.lineAt(range.to).number;
    for (let line = first; line <= last; line += 1) activeLines.add(line);
  }

  let number = 1;
  while (number <= doc.lines) {
    if (!doc.line(number).text.trim().startsWith('|')) {
      number += 1;
      continue;
    }

    let end = number;
    while (end + 1 <= doc.lines && doc.line(end + 1).text.trim().startsWith('|')) end += 1;

    const editing = [...activeLines].some((active) => active >= number && active <= end);
    const rows: string[] = [];
    for (let row = number; row <= end; row += 1) rows.push(doc.line(row).text);

    if (!editing && end > number) {
      list.push(
        Decoration.replace({widget: new TableWidget(rows), block: true}).range(doc.line(number).from, doc.line(end).to),
      );
    } else {
      for (let row = number; row <= end; row += 1) {
        list.push(Decoration.line({class: 'md-table-raw'}).range(doc.line(row).from));
      }
    }

    number = end + 1;
  }

  return Decoration.set(list, true);
}
