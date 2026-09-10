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
 * Позиции из прошлого слоя в координатах следующего: удаление, найденное раньше, обязано стоять
 * там же после всех правок, что были после него.
 *
 * Все позиции переносятся ОДНИМ проходом по частям, а не проходом на каждую. По длинной статье
 * удалений набираются сотни, и отдельный проход на каждое означал бы сотни обходов всего текста.
 */
function перенести(parts: Части, куски: string[], места: number[]): number[] {
  // Позиции разбираются по возрастанию: проход по частям идёт только вперёд.
  const порядок = места.map((_, i) => i).sort((a, b) => места[a] - места[b]);
  const итог = new Array<number>(места.length);
  let oldPos = 0;
  let newPos = 0;
  let next = 0;

  for (let i = 0; i < parts.length; i += 1) {
    const len = куски[i].length;
    if (parts[i].added) {
      newPos += len;
      continue;
    }
    for (; next < порядок.length && места[порядок[next]] <= oldPos + len; next += 1) {
      const at = места[порядок[next]];
      итог[порядок[next]] = parts[i].removed ? newPos : newPos + (at - oldPos);
    }
    oldPos += len;
    if (!parts[i].removed) newPos += len;
  }

  for (; next < порядок.length; next += 1) итог[порядок[next]] = newPos;
  return итог;
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

/** Расчёт на конец слоя: во что сложился текст, чем помечен каждый его знак и что из него ушло. */
interface Состояние {
  text: string;
  kinds: LayerKind[];
  deletions: Deletion[];
}

/** Переводы строк не сравниваются: на диске файл бывает windows-вида, а в git — unix-вида (SPEC 3.6). */
function норма(layer: Layer): Layer {
  return {...layer, text: layer.text.replace(/\r\n/g, '\n')};
}

/** Первый слой красится целиком собой: сравнивать его не с чем. */
function начало(layer: Layer): Состояние {
  return {text: layer.text, kinds: new Array<LayerKind>(layer.text.length).fill(layer.kind), deletions: []};
}

/**
 * Один слой поверх прошлого расчёта. Прошлое состояние не меняется: оно принадлежит уже
 * посчитанному началу цепочки и переживает этот шаг, чтобы следующая буква считалась от него.
 */
function шаг(было: Состояние, layer: Layer, служебное: Служебное): Состояние {
  const {text, kinds} = было;
  const deletions = было.deletions.map((deletion) => ({...deletion}));
  const nextKinds: LayerKind[] = [];
  let oldPos = 0;

  const parts = layer.правки
    ? поПравкам(text, layer.text, layer.правки)
    : diffArrays(tokenize(text), tokenize(layer.text));
  // Склейка каждой части считается один раз на слой: и перенос удалений, и разбор ниже берут её отсюда.
  const куски = parts.map((part) => part.value.join(''));
  const места = перенести(parts, куски, deletions.map((deletion) => deletion.at));
  for (let i = 0; i < deletions.length; i += 1) deletions[i].at = места[i];

  for (let step = 0; step < parts.length; step += 1) {
    const part = parts[step];
    const chunk = куски[step];

    // Слово заменили на почти такое же (дописали букву, поставили запятую).
    // Показывать это как «удалили слово и добавили слово» нельзя — глазам больно.
    // Поэтому такую пару разбираем по буквам: красится только то, что правда изменилось.
    const pair = parts[step + 1];
    const was = chunk;
    const now = куски[step + 1] ?? '';
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

  оформленноеЦеликом(layer.text, nextKinds, layer.kind);

  return {text: layer.text, kinds: nextKinds, deletions};
}

/** Служебного нет — своё значение, а не новая функция на каждый вызов: по ней сверяется память. */
const НЕТ_СЛУЖЕБНОГО: Служебное = () => false;

/**
 * Память о прошлом расчёте: цепочка, которую сравнивали в прошлый раз, и состояние на конец каждого
 * её слоя. История статьи при наборе не меняется — меняется только последний слой, набранный текст.
 * Без памяти каждая буква заново сравнивала бы всю статью со всеми прошлыми состояниями, и на статье
 * в двадцать с лишним тысяч знаков буква появлялась бы почти через секунду. Второго источника правды
 * тут нет: в памяти лежит итог тех же самых шагов, слой с другим текстом или другими границами
 * правок считается заново вместе со всем, что за ним, и ответ на одни и те же слои от прошлых
 * вызовов не зависит.
 */
let память: {служебное: Служебное; слои: Layer[]; шаги: Состояние[]} | null = null;

/** Тот же самый слой: и происхождение, и текст, и те же границы правок внутри него. */
function тотЖеСлой(a: Layer, b: Layer): boolean {
  return a.kind === b.kind && a.text === b.text && a.правки === b.правки;
}

/**
 * Слои идут по времени: первый — то, что стоит на сайте, последний — текущий текст.
 * Между ними могут стоять прошлые правки человека и правки ИИ.
 */
export function colorize(input: Layer[], служебное: Служебное = НЕТ_СЛУЖЕБНОГО): Colorized {
  if (input.length === 0) return {segments: [], deletions: []};

  // Служебное решает, что считать удалением, поэтому чужое правило обнуляет память целиком.
  const прежнее = память?.служебное === служебное ? память : null;
  let общее = 0;
  while (общее < input.length && общее < (прежнее?.слои.length ?? 0) && тотЖеСлой(input[общее], прежнее!.слои[общее])) {
    общее += 1;
  }

  const шаги = общее === 0 ? [начало(норма(input[0]))] : прежнее!.шаги.slice(0, общее);
  for (let i = шаги.length; i < input.length; i += 1) шаги.push(шаг(шаги[i - 1], норма(input[i]), служебное));

  память = {служебное, слои: input.slice(), шаги};
  const итог = шаги[шаги.length - 1];
  // Итог отдаётся копией: он же лежит в памяти, и правка ответа снаружи испортила бы следующий счёт.
  return {segments: merge(итог.kinds), deletions: итог.deletions.map((deletion) => ({...deletion}))};
}

/**
 * Оформленные куски текста: пара знаков вокруг непустого содержимого в пределах одной строки.
 * Разбора markdown здесь нет и быть не должно — цвету достаточно самих знаков, а перенос строки
 * границу закрывает: незакрытая пара иначе утянула бы окраску на весь остальной текст.
 *
 * Жирный и курсив описаны одинаково и различаются только длиной знака. Звёздочка курсива вдобавок
 * не соседствует со звёздочкой: половину чужого `**` он за свою не принимает, жирный кусок красится
 * своим правилом, а `***оба***` целиком забирает жирное.
 */
const КУСКИ_ФОРМАТА: {выражение: RegExp; знак: number}[] = [
  {выражение: /\*\*(?=\S)[^\n]*?\S\*\*/g, знак: 2},
  {выражение: /(?<!\*)\*(?!\*)(?=\S)[^\n]*?\S(?<!\*)\*(?!\*)/g, знак: 1},
];

/**
 * Оформление, поставленное в этом слое, красит весь свой кусок целиком. Человек изменил вид
 * словосочетания, а не знаки по краям: буквы внутри не менялись, и посимвольное сравнение оставило
 * бы их прошлому слою — правка формата пропала бы из цвета вовсе. Правило одно на жирный и курсив:
 * разный цвет у одинаковых по смыслу правок человек читает как поломку.
 *
 * Чужое оформление так не перекрашивается: знаки должны принадлежать ЭТОМУ слою, иначе давняя
 * `**жирность**` при каждом открытии считалась бы новой. Показ служебных знаков в окне живёт своим
 * правилом и об этом расчёте не знает: цвет отвечает за происхождение правки, а не за вид.
 */
function оформленноеЦеликом(text: string, kinds: LayerKind[], kind: LayerKind): void {
  for (const {выражение, знак} of КУСКИ_ФОРМАТА) {
    for (const кусок of text.matchAll(выражение)) {
      const from = кусок.index;
      const to = from + кусок[0].length;
      const знаки: number[] = [];
      for (let сдвиг = 0; сдвиг < знак; сдвиг += 1) знаки.push(from + сдвиг, to - 1 - сдвиг);
      if (!знаки.every((at) => kinds[at] === kind)) continue;
      for (let at = from; at < to; at += 1) kinds[at] = kind;
    }
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
