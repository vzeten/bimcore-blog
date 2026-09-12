// Имя каждого теста повторяет формулировку правила.
// WebM — четвёртый известный формат, но не картинка: свои двери, свой предел веса, без совета сжать.
import {describe, expect, it} from 'vitest';
import {
  НАЧАЛЬНЫХ_БАЙТ_ВИДЕО, видеоМожно, обложкойМожно, похожеНаВидео, похожеНаГиф, теломМожно, типКартинки,
  типыВидео, типыОбложки, типыТелаСтатьи,
} from '../src/core/imageType.mjs';
import {webmПеревесил, весКартинки, гифПеревесил} from '../src/core/imageWeight.mjs';
import {ГИФ} from './gifFixture.mjs';
import {MATROSKA, WEBM, webmВесом} from './webmFixture.mjs';

const МЕГАБАЙТ = 1024 * 1024;

describe('WebM по содержимому', () => {
  it('WebM узнаётся по заголовку EBML с типом документа webm и началом сегмента', () => {
    expect(типКартинки(WEBM)).toBe('webm');
    expect(типКартинки(webmВесом(4096))).toBe('webm');
  });

  it('тот же заголовок EBML с другим типом документа или без сегмента — не WebM', () => {
    expect(типКартинки(MATROSKA)).toBeNull();
    expect(типКартинки(WEBM.subarray(0, 16))).toBeNull();
  });

  it('WebM не бывает ни обложкой, ни картинкой тела статьи — только видео', () => {
    expect(обложкойМожно('webm')).toBe(false);
    expect(теломМожно('webm')).toBe(false);
    expect(видеоМожно('webm')).toBe(true);
    for (const картинка of ['png', 'jpg', 'gif']) expect(видеоМожно(картинка), картинка).toBe(false);
  });

  it('окно выбора картинки не предлагает видео, окно выбора видео предлагает только его', () => {
    expect(типыТелаСтатьи()).toBe('image/png,image/jpeg,image/gif');
    expect(типыОбложки()).toBe('image/png,image/jpeg');
    expect(типыВидео()).toBe('video/webm');
  });

  it('по началу файла WebM узнаётся тем же заголовком, GIF за видео не сходит и наоборот', () => {
    expect(похожеНаВидео(webmВесом(МЕГАБАЙТ).subarray(0, НАЧАЛЬНЫХ_БАЙТ_ВИДЕО))).toBe(true);
    expect(похожеНаВидео(ГИФ)).toBe(false);
    expect(похожеНаВидео(MATROSKA)).toBe(false);
    expect(похожеНаГиф(WEBM)).toBe(false);
  });
});

describe('вес ролика', () => {
  it('WebM ровно в предел принимается, на байт больше — перевесил; предел GIF его не касается', () => {
    expect(webmПеревесил('webm', 10 * МЕГАБАЙТ, 10)).toBe(false);
    expect(webmПеревесил('webm', 10 * МЕГАБАЙТ + 1, 10)).toBe(true);
    expect(webmПеревесил('gif', 10 * МЕГАБАЙТ + 1, 10)).toBe(false);
    expect(гифПеревесил('webm', 6 * МЕГАБАЙТ, 5)).toBe(false);
  });

  it('совета сжать у WebM не бывает, как и у GIF: пережимать ролик человеку нечем', () => {
    expect(весКартинки('webm', 9 * МЕГАБАЙТ, 500)).toEqual({тяжёлая: false, килобайт: 9216});
    expect(весКартинки('png', 9 * МЕГАБАЙТ, 500).тяжёлая).toBe(true);
  });
});
