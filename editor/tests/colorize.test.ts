import {describe, expect, it} from 'vitest';
import {colorize, type Layer} from '../src/core/colorize';

function kindOf(text: string, layers: Layer[], fragment: string): string | undefined {
  const at = text.indexOf(fragment);
  const {segments} = colorize(layers);
  return segments.find((segment) => at >= segment.from && at < segment.to)?.kind;
}

describe('слои изменений', () => {
  it('нетронутый текст помечен как «на сайте»', () => {
    const layers: Layer[] = [
      {text: 'Первый абзац. Второй абзац.', kind: 'site'},
      {text: 'Первый абзац. Второй абзац.', kind: 'current'},
    ];
    expect(kindOf('Первый абзац. Второй абзац.', layers, 'Первый')).toBe('site');
  });

  it('различает мои прошлые правки, правки ИИ и текущие', () => {
    const site = 'Стены соединяются. Материалы разные.';
    const afterHuman = 'Стены соединяются. Материалы разные. Добавил вчера.';
    const afterAi = 'Стены соединяются. Материалы разные. Добавил вчера. Уточнение ИИ.';
    const now = 'Стены соединяются. Материалы разные. Добавил вчера. Уточнение ИИ. Пишу сейчас.';

    const layers: Layer[] = [
      {text: site, kind: 'site'},
      {text: afterHuman, kind: 'prevHuman'},
      {text: afterAi, kind: 'prevAi'},
      {text: now, kind: 'current'},
    ];

    expect(kindOf(now, layers, 'Стены')).toBe('site');
    expect(kindOf(now, layers, 'вчера')).toBe('prevHuman');
    expect(kindOf(now, layers, 'ИИ.')).toBe('prevAi');
    expect(kindOf(now, layers, 'сейчас')).toBe('current');
  });

  it('удалённое не остаётся в тексте, а попадает в список удалений', () => {
    const layers: Layer[] = [
      {text: 'Начало. Лишнее предложение. Конец.', kind: 'site'},
      {text: 'Начало. Конец.', kind: 'current'},
    ];
    const {segments, deletions} = colorize(layers);

    expect(deletions).toHaveLength(1);
    expect(deletions[0].text).toContain('Лишнее предложение.');
    expect(deletions[0].kind).toBe('current');
    expect(segments.every((segment) => segment.kind === 'site')).toBe(true);
  });

  it('замена слова красит только новое слово', () => {
    const now = 'Стены из разных материалов на плане.';
    const layers: Layer[] = [
      {text: 'Стены из различных материалов на плане.', kind: 'site'},
      {text: now, kind: 'current'},
    ];

    expect(kindOf(now, layers, 'Стены')).toBe('site');
    expect(kindOf(now, layers, 'разных')).toBe('current');
    expect(kindOf(now, layers, 'плане')).toBe('site');
  });

  it('разные переводы строк не считаются изменением', () => {
    const {segments, deletions} = colorize([
      {text: 'Первая строка.\r\nВторая строка.\r\n', kind: 'site'},
      {text: 'Первая строка.\nВторая строка.\n', kind: 'current'},
    ]);

    expect(deletions).toHaveLength(0);
    expect(segments.every((segment) => segment.kind === 'site')).toBe(true);
  });

  it('дописанный символ не выглядит как удаление слова', () => {
    const now = 'Правьте, как угодно.';
    const layers: Layer[] = [
      {text: 'Правьте как угодно.', kind: 'site'},
      {text: now, kind: 'current'},
    ];
    const {deletions} = colorize(layers);

    expect(deletions).toHaveLength(0);
    expect(kindOf(now, layers, 'Правьте')).toBe('site');
    expect(kindOf(now, layers, ',')).toBe('current');
  });

  it('удаление одних пробелов не попадает в список', () => {
    const {deletions} = colorize([
      {text: 'Слово   ещё слово', kind: 'site'},
      {text: 'Слово ещё слово', kind: 'current'},
    ]);

    expect(deletions).toHaveLength(0);
  });

  it('отрезки покрывают весь текст без дыр', () => {
    const now = 'Один. Два. Три.';
    const {segments} = colorize([
      {text: 'Один. Три.', kind: 'site'},
      {text: now, kind: 'current'},
    ]);

    expect(segments[0].from).toBe(0);
    expect(segments.at(-1)?.to).toBe(now.length);
    for (let i = 1; i < segments.length; i += 1) expect(segments[i].from).toBe(segments[i - 1].to);
  });
});

describe('маркер списка и знак переноса не меняют авторство слов', () => {
  const кусок = (text: string, r: ReturnType<typeof colorize>) => r.segments.map((s) => [text.slice(s.from, s.to), s.kind]);
  /** Смысл косой здесь не доказывается — это дело окна; ядро лишь обязано спросить и послушаться. */
  const косаяСлужебна = (text: string, from: number, to: number) => text.slice(from, to) === '\\';

  it('маркеры, набранные над строками после Shift+Enter, красятся сами, слова остаются прежними и не удаляются', () => {
    const файл = 'что то\nраз\\\nдва\\\nтри';
    const окно = 'что то\n- раз\n- два\n- три';
    const r = colorize([{text: файл, kind: 'prevHuman'}, {text: окно, kind: 'current'}], косаяСлужебна);
    expect(r.deletions).toEqual([]);
    expect(кусок(окно, r)).toEqual([
      ['что то\n', 'prevHuman'], ['- ', 'current'], ['раз\n', 'prevHuman'], ['- ', 'current'], ['два\n', 'prevHuman'], ['- ', 'current'], ['три', 'prevHuman'],
    ]);
  });

  it('без ответа «служебно» ушедшая косая остаётся удалением: ядро само косую не прячет', () => {
    expect(colorize([{text: 'a\\\nb', kind: 'prevHuman'}, {text: 'a\n- b', kind: 'current'}]).deletions).toEqual([{at: 1, text: '\\', kind: 'current'}]);
    expect(colorize([{text: 'a\\', kind: 'prevHuman'}, {text: 'a', kind: 'current'}]).deletions).toEqual([{at: 1, text: '\\', kind: 'current'}]);
  });

  it('набранный жёсткий перенос внутри абзаца красится текущим, слова вокруг — прежние', () => {
    const окно = 'a\\\nb';
    expect(кусок(окно, colorize([{text: 'a\nb', kind: 'prevHuman'}, {text: окно, kind: 'current'}]))).toEqual([['a', 'prevHuman'], ['\\', 'current'], ['\nb', 'prevHuman']]);
  });

  it('удаление прошлого слоя стоит на своём месте и после правок следующих слоёв', () => {
    const r = colorize([{text: 'начало середина конец', kind: 'site'}, {text: 'начало конец', kind: 'prevHuman'}, {text: 'ВСТАВКА начало конец', kind: 'current'}]);
    expect(r.deletions).toEqual([{at: 'ВСТАВКА начало '.length, text: 'середина ', kind: 'prevHuman'}]);
  });

  it('машинная правка остаётся машинной после маркера и снятого переноса, настоящее удаление видно', () => {
    const окно = '- раз ДВА три';
    const r = colorize([{text: 'раз два три', kind: 'site'}, {text: 'раз ДВА три', kind: 'prevAi'}, {text: 'раз ДВА три\\\nx', kind: 'prevHuman'}, {text: окно, kind: 'current'}], косаяСлужебна);
    expect(кусок(окно, r)).toEqual([['- ', 'current'], ['раз ', 'site'], ['ДВА', 'prevAi'], [' три', 'site']]);
    expect(r.deletions).toEqual([{at: 6, text: 'два', kind: 'prevAi'}, {at: 13, text: '\\\nx', kind: 'current'}]);
  });
});

describe('слой по известным правкам', () => {
  const кусок = (text: string, r: ReturnType<typeof colorize>) => r.segments.map((s) => [text.slice(s.from, s.to), s.kind]);
  const файл = '- фывафыва\n- фывафыва\n- фывафыва\n';
  const окно = '- фывафыва\n- фывафыва\n- фывафыва\n- фывафыва\n';

  it('вставленная одинаковая строка — единственная синяя, соседи прежние', () => {
    const r = colorize([{text: файл, kind: 'prevHuman'}, {text: окно, kind: 'current', правки: [{fromA: 10, toA: 10, fromB: 10, toB: 21}]}]);
    expect(r.deletions).toEqual([]);
    expect(кусок(окно, r)).toEqual([['- фывафыва', 'prevHuman'], ['\n- фывафыва', 'current'], ['\n- фывафыва\n- фывафыва\n', 'prevHuman']]);
  });

  it('сравнение целиком той же пары строк даёт другой ответ — потому правки и нужны', () => {
    const r = colorize([{text: файл, kind: 'prevHuman'}, {text: окно, kind: 'current'}]);
    expect(кусок(окно, r)).not.toEqual([['- фывафыва', 'prevHuman'], ['\n- фывафыва', 'current'], ['\n- фывафыва\n- фывафыва\n', 'prevHuman']]);
  });

  it('внутри правки слова сравниваются как обычно: удалённое видно, прежнее не перекрашивается', () => {
    const r = colorize([{text: 'раз два три', kind: 'site'}, {text: 'раз ДВА три', kind: 'current', правки: [{fromA: 4, toA: 7, fromB: 4, toB: 7}]}]);
    expect(кусок('раз ДВА три', r)).toEqual([['раз ', 'site'], ['ДВА', 'current'], [' три', 'site']]);
    expect(r.deletions).toEqual([{at: 4, text: 'два', kind: 'current'}]);
    const пусто = colorize([{text: 'раз два три', kind: 'site'}, {text: 'раз два три', kind: 'current', правки: []}]);
    expect(пусто.segments).toEqual([{from: 0, to: 11, kind: 'site'}]);
  });
});
