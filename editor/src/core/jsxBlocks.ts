import {lineBounds, type Edit, type Selection} from './commands';

export interface Свойство {
  имя: string;
  значение: string;
}

export interface Блок {
  имя: string;
  свойства: Свойство[];
}

export interface ПолеБлока {
  имя: string;
  подпись: string;
  значения: Record<string, string>;
  поРазделу?: boolean;
}

export interface ОписаниеБлока {
  подпись: string;
  поля: ПолеБлока[];
}

const ТЕГ = /^<([A-Za-z][A-Za-z0-9]*)((?:[ \t]+[A-Za-z][A-Za-z0-9-]*="[^"<>]*")*)[ \t]*\/>$/;
const СВОЙСТВО = /([A-Za-z][A-Za-z0-9-]*)="([^"<>]*)"/g;
const ОПАСНЫЕ_ЗНАКИ = /["<>]/;

export function разборТега(текст: string): Блок | null {
  const найдено = ТЕГ.exec(текст);
  if (найдено === null) return null;

  const свойства: Свойство[] = [];
  for (const [, имя, значение] of найдено[2].matchAll(СВОЙСТВО)) свойства.push({имя, значение});

  return {имя: найдено[1], свойства};
}

export function сборкаТега(блок: Блок): string {
  const хвост = блок.свойства.map(({имя, значение}) => ` ${имя}="${значение}"`).join('');
  return `<${блок.имя}${хвост} />`;
}

/** Незнакомые свойства остаются на своих местах и в своём порядке: правится только выбранное. */
export function сменаСвойства(текст: string, имя: string, значение: string): string | null {
  const блок = разборТега(текст);
  if (блок === null || ОПАСНЫЕ_ЗНАКИ.test(значение)) return null;

  const было = блок.свойства.some((свойство) => свойство.имя === имя);
  const свойства = было
    ? блок.свойства.map((свойство) => (свойство.имя === имя ? {имя, значение} : свойство))
    : [...блок.свойства, {имя, значение}];

  return сборкаТега({имя: блок.имя, свойства});
}

export function значениеСвойства(текст: string, имя: string): string | null {
  const блок = разборТега(текст);
  if (блок === null) return null;

  return блок.свойства.find((свойство) => свойство.имя === имя)?.значение ?? null;
}

export function значениеПоРазделу(
  карта: Record<string, string>,
  раздел: {kind: string; path: string},
): string | null {
  const узел = раздел.path === '' ? раздел.kind : `${раздел.kind}/${раздел.path}`;
  const части = узел.split('/');

  for (let глубина = части.length; глубина > 0; глубина -= 1) {
    const значение = карта[части.slice(0, глубина).join('/')];
    if (значение !== undefined) return значение;
  }

  return карта['умолчание'] ?? null;
}

export function новыйТег(
  имя: string,
  описание: ОписаниеБлока,
  предложение: (поле: ПолеБлока) => string | null,
): string {
  const свойства: Свойство[] = [];

  for (const поле of описание.поля) {
    if (поле.поРазделу !== true) continue;
    const значение = предложение(поле);
    if (значение !== null) свойства.push({имя: поле.имя, значение});
  }

  return сборкаТега({имя, свойства});
}

export function вставкаБлока(текст: string, at: Selection, тег: string): Edit {
  const строка = lineBounds(текст, at);
  const пустая = текст.slice(строка.from, строка.to).trim() === '';
  const место = пустая ? строка.from : строка.to;

  const до = текст.slice(0, место);
  const после = текст.slice(место);
  const отступДо = до === '' ? '' : отступ(своиПереводы(до, 'конец'));
  const отступПосле = после === '' ? '' : отступ(своиПереводы(после, 'начало'));

  const insert = `${отступДо}${тег}${отступПосле}`;
  return {from: место, to: место, insert, caret: отступДо.length + тег.length};
}

function своиПереводы(сосед: string, край: 'начало' | 'конец'): number {
  const найдено = край === 'конец' ? /\n{1,2}$/.exec(сосед) : /^\n{1,2}/.exec(сосед);
  return найдено === null ? 0 : найдено[0].length;
}

function отступ(есть: number): string {
  return '\n'.repeat(Math.max(0, 2 - есть));
}
