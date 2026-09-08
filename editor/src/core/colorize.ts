// Единственное место, где решается, каким слоем помечен каждый кусок текста.
// Чистая функция: на входе слои, на выходе отрезки. Ни файлов, ни интерфейса.
import {diffArrays, diffChars} from 'diff';

/**
 * Разбивка на слова и промежутки между ними.
 * Своя, а не библиотечная: готовые сравнения слов не знают кириллицы
 * и режут русские слова по буквам — цвет тогда превращается в кашу.
 * Косые — отдельный кусок: косая перед переводом строки есть знак переноса markdown, а не часть
 * слова, и её появление или уход не должны менять авторство самого слова.
 * Склейка кусков обратно даёт исходный текст символ в символ.
 */
function tokenize(text: string): string[] {
  return text.match(/[^\s\\]+|\\+|\s+/gu) ?? [];
}

/** Границы одной правки: что стояло в прошлом слое и что стоит вместо этого в новом. */
export interface Правка {
  fromA: number;
  toA: number;
  fromB: number;
  toB: number;
}

type Части = {value: string[]; added?: boolean; removed?: boolean}[];

/**
 * Сравнение по известным правкам: нетронутое между ними берётся как есть, слова сравниваются
 * только внутри каждой правки. Без этого две одинаковые строки не отличить: сравнение текстов
 * вправе счесть новой любую из них, и синий цвет перескакивает на соседа.
 */
function поПравкам(старый: string, новый: string, правки: Правка[]): Части {
  const части: Части = [];
  let a = 0;
  for (const правка of правки) {
    if (правка.fromA > a) части.push({value: [старый.slice(a, правка.fromA)]});
    части.push(...diffArrays(tokenize(старый.slice(правка.fromA, правка.toA)), tokenize(новый.slice(правка.fromB, правка.toB))));
    a = правка.toA;
  }
  if (a < старый.length) части.push({value: [старый.slice(a)]});
  return части;
}

/** Удаление этого куска прошлого текста — служебное, показывать его нечего. Смысл знает вызывающий. */
export type Служебное = (text: string, from: number, to: number) => boolean;

/**
 * Позиция из прошлого слоя в координатах следующего: удаление, найденное раньше, обязано стоять
 * там же после всех правок, что были после него.
 */
function перенести(parts: Части, at: number): number {
  let oldPos = 0;
  let newPos = 0;
  for (const part of parts) {
    const len = part.value.join('').length;
    if (part.added) {
      newPos += len;
      continue;
    }
    if (at <= oldPos + len) return part.removed ? newPos : newPos + (at - oldPos);
    oldPos += len;
    if (!part.removed) newPos += len;
  }
  return newPos;
}

/**
 * Кто оставил кусок текста. `prevOther` — правка постороннего автора: не моя и не машинная.
 * Так выглядит внешняя правка файла и работа человека, которого нет в справочнике настроек.
 */
export type LayerKind = 'site' | 'prevHuman' | 'prevAi' | 'prevOther' | 'current';

export interface Layer {
  /** Текст статьи на конец этого слоя. */
  text: string;
  /** Чем помечать то, что появилось именно в этом слое. */
  kind: LayerKind;
  /** Известные границы правок от прошлого слоя к этому; нет — слои сравниваются целиком. */
  правки?: Правка[];
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
export function colorize(input: Layer[], служебное: Служебное = () => false): Colorized {
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

    const parts = layer.правки
      ? поПравкам(text, layer.text, layer.правки)
      : diffArrays(tokenize(text), tokenize(layer.text));
    for (const deletion of deletions) deletion.at = перенести(parts, deletion.at);

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
        // Удаление одних пробелов и переводов строк — не событие; что ещё служебно, решает вызывающий.
        if (chunk.trim() !== '' && !служебное(text, oldPos, oldPos + chunk.length)) {
          deletions.push({at: nextKinds.length, text: chunk, kind: layer.kind});
        }
        oldPos += chunk.length;
      } else {
        for (let i = 0; i < chunk.length; i += 1) nextKinds.push(kinds[oldPos + i] ?? layer.kind);
        oldPos += chunk.length;
      }
    }

    жирноеЦеликом(layer.text, nextKinds, layer.kind);

    text = layer.text;
    kinds = nextKinds;
  }

  return {segments: merge(kinds), deletions};
}

/**
 * Жирные куски текста: пара `**` вокруг непустого содержимого в пределах одной строки.
 * Разбора markdown здесь нет и быть не должно — цвету достаточно самих знаков, а перенос строки
 * границу закрывает: незакрытая пара иначе утянула бы окраску на весь остальной текст.
 */
const ЖИРНЫЙ_КУСОК = /\*\*(?=\S)[^\n]*?\S\*\*/g;

/**
 * Жирность, поставленная в этом слое, красит весь свой кусок целиком. Человек изменил вид
 * словосочетания, а не два знака по краям: буквы внутри не менялись, и посимвольное сравнение
 * оставило бы их прошлому слою — правка формата пропала бы из цвета вовсе, потому что сами `**`
 * в окне не показываются. Чужая жирность так не перекрашивается: знаки должны принадлежать
 * ЭТОМУ слою, иначе давняя `**жирность**` при каждом открытии считалась бы новой.
 */
function жирноеЦеликом(text: string, kinds: LayerKind[], kind: LayerKind): void {
  for (const кусок of text.matchAll(ЖИРНЫЙ_КУСОК)) {
    const from = кусок.index;
    const to = from + кусок[0].length;
    const знаки = [from, from + 1, to - 2, to - 1];
    if (!знаки.every((at) => kinds[at] === kind)) continue;
    for (let at = from; at < to; at += 1) kinds[at] = kind;
  }
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
