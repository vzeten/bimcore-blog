// Единственное место, где решается, каким слоем помечен каждый кусок текста.
// Чистая функция: на входе слои, на выходе отрезки. Ни файлов, ни интерфейса.
import {diffArrays, diffChars} from 'diff';

/**
 * Разбивка на слова и промежутки между ними.
 * Своя, а не библиотечная: готовые сравнения слов не знают кириллицы
 * и режут русские слова по буквам — цвет тогда превращается в кашу.
 * Склейка кусков обратно даёт исходный текст символ в символ.
 */
function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/gu) ?? [];
}

export type LayerKind = 'site' | 'prevHuman' | 'prevAi' | 'current';

export interface Layer {
  /** Текст статьи на конец этого слоя. */
  text: string;
  /** Чем помечать то, что появилось именно в этом слое. */
  kind: LayerKind;
}

export interface Segment {
  from: number;
  to: number;
  kind: LayerKind;
}

export interface Deletion {
  /** Позиция в текущем тексте, где стоял удалённый кусок. */
  at: number;
  text: string;
  /** Кто удалил — тот слой, в котором кусок исчез. */
  kind: LayerKind;
}

export interface Colorized {
  segments: Segment[];
  deletions: Deletion[];
}

/**
 * Слои идут по времени: первый — то, что стоит на сайте, последний — текущий текст.
 * Между ними могут стоять прошлые правки человека и правки ИИ.
 */
export function colorize(input: Layer[]): Colorized {
  if (input.length === 0) return {segments: [], deletions: []};

  // Переводы строк сравнивать нельзя: на диске файл может быть в windows-виде,
  // а в git — в unix-виде. Без этого каждая строка выглядела бы изменённой.
  const layers = input.map((layer) => ({...layer, text: layer.text.replace(/\r\n/g, '\n')}));

  let text = layers[0].text;
  let kinds: LayerKind[] = new Array(text.length).fill(layers[0].kind);
  const deletions: Deletion[] = [];

  for (let index = 1; index < layers.length; index += 1) {
    const layer = layers[index];
    const nextKinds: LayerKind[] = [];
    let oldPos = 0;

    const parts = diffArrays(tokenize(text), tokenize(layer.text));

    for (let step = 0; step < parts.length; step += 1) {
      const part = parts[step];
      const chunk = part.value.join('');

      // Слово заменили на почти такое же (дописали букву, поставили запятую).
      // Показывать это как «удалили слово и добавили слово» нельзя — глазам больно.
      // Поэтому такую пару разбираем по буквам: красится только то, что правда изменилось.
      const pair = parts[step + 1];
      const was = chunk;
      const now = pair?.value.join('') ?? '';
      const дописали = was !== '' && now !== '' && (now.includes(was) || was.includes(now));

      if (part.removed && pair?.added && дописали) {
        let insideOld = 0;

        for (const letter of diffChars(was, now)) {
          if (letter.added) {
            for (let i = 0; i < letter.value.length; i += 1) nextKinds.push(layer.kind);
          } else if (letter.removed) {
            if (letter.value.trim() !== '') {
              deletions.push({at: nextKinds.length, text: letter.value, kind: layer.kind});
            }
            insideOld += letter.value.length;
          } else {
            for (let i = 0; i < letter.value.length; i += 1) {
              nextKinds.push(kinds[oldPos + insideOld + i] ?? layer.kind);
            }
            insideOld += letter.value.length;
          }
        }

        oldPos += was.length;
        step += 1;
        continue;
      }

      if (part.added) {
        for (let i = 0; i < chunk.length; i += 1) nextKinds.push(layer.kind);
      } else if (part.removed) {
        // Удаление одних пробелов и переносов — не событие, показывать его нечего.
        if (chunk.trim() !== '') deletions.push({at: nextKinds.length, text: chunk, kind: layer.kind});
        oldPos += chunk.length;
      } else {
        for (let i = 0; i < chunk.length; i += 1) nextKinds.push(kinds[oldPos + i] ?? layer.kind);
        oldPos += chunk.length;
      }
    }

    text = layer.text;
    kinds = nextKinds;
  }

  return {segments: merge(kinds), deletions};
}

function merge(kinds: LayerKind[]): Segment[] {
  const segments: Segment[] = [];
  let start = 0;

  for (let i = 1; i <= kinds.length; i += 1) {
    if (i === kinds.length || kinds[i] !== kinds[start]) {
      segments.push({from: start, to: i, kind: kinds[start]});
      start = i;
    }
  }

  return segments;
}
