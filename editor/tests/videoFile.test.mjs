// Имя каждого теста повторяет формулировку правила.
// Видеофайл статьи: одна безопасная запись с диска узнаётся без исполнения JSX, всё прочее — текст.
import {describe, expect, it} from 'vitest';
import {
  видеоТекста, импортВидео, местоИмпорта, новыйВидеоТег, свободнаяПеременная, упоминаетсяВне,
} from '../src/core/videoFile.mjs';

/** Запись образца: `blog/free-revit-families-risks/index.mdx` и его русский двойник. */
const ИМПОРТ = "import sofaVideo from './img/sofa-parameters.webm';";
const ТЕГ = [
  "<video controls muted loop playsInline style={{width: '100%', height: 'auto'}} aria-label=\"Диван\">",
  '  <source src={sofaVideo} type="video/webm" />',
  '</video>',
].join('\n');
const СТАТЬЯ = `${ИМПОРТ}\n\nАбзац до.\n\n${ТЕГ}\n\n*Подпись.*\n`;

describe('какая запись считается роликом статьи', () => {
  it('запись образца узнаётся целиком: границы тега, переменная, адрес и границы импорта', () => {
    expect(видеоТекста(СТАТЬЯ)).toEqual([{
      переменная: 'sofaVideo',
      адрес: './img/sofa-parameters.webm',
      импорт: {от: 0, до: ИМПОРТ.length},
      от: СТАТЬЯ.indexOf('<video'),
      до: СТАТЬЯ.indexOf('</video>') + '</video>'.length,
    }]);
  });

  it('порядок свойств источника и переводы строк Windows делу не мешают', () => {
    const наоборот = СТАТЬЯ.replace('src={sofaVideo} type="video/webm"', 'type="video/webm" src={sofaVideo}');
    expect(видеоТекста(наоборот)).toHaveLength(1);
    expect(видеоТекста(СТАТЬЯ.replace(/\n/g, '\r\n'))).toHaveLength(1);
  });

  it('тег без импорта или с импортом не на .webm роликом не считается: сайт его не покажет', () => {
    expect(видеоТекста(СТАТЬЯ.replace(`${ИМПОРТ}\n\n`, ''))).toEqual([]);
    expect(видеоТекста(СТАТЬЯ.replace('.webm', '.mp4'))).toEqual([]);
  });

  it('выражение JSX в свойстве, второй источник, дети тега и сдвиг с начала строки — текст статьи', () => {
    expect(видеоТекста(СТАТЬЯ.replace('<video controls', '<video onClick={run} controls'))).toEqual([]);
    expect(видеоТекста(СТАТЬЯ.replace('</video>', '  <source src={sofaVideo} type="video/mp4" />\n</video>'))).toEqual([]);
    expect(видеоТекста(СТАТЬЯ.replace('</video>', '  Ваш браузер не показывает видео.\n</video>'))).toEqual([]);
    expect(видеоТекста(СТАТЬЯ.replace('<video controls', '- <video controls'))).toEqual([]);
  });

  it('два тега на один импорт — два ролика с одной переменной', () => {
    expect(видеоТекста(`${СТАТЬЯ}\n${ТЕГ}\n`).map((в) => в.переменная)).toEqual(['sofaVideo', 'sofaVideo']);
  });
});

describe('что программа пишет в статью', () => {
  it('новый тег повторяет запись образца: кнопки, без звука, по кругу, во всю ширину, без автозапуска', () => {
    expect(новыйВидеоТег('img01Video', 'Диван')).toBe([
      "<video controls muted loop playsInline style={{width: '100%', height: 'auto'}} aria-label=\"Диван\">",
      '  <source src={img01Video} type="video/webm" />',
      '</video>',
    ].join('\n'));
    expect(новыйВидеоТег('img01Video', 'Диван')).not.toContain('autoplay');
  });

  it('название с кавычкой или угловой скобкой в ярлык не ставится, пустое — тоже', () => {
    expect(новыйВидеоТег('v', 'Урок "про диван"')).not.toContain('aria-label');
    expect(новыйВидеоТег('v', '<b>')).not.toContain('aria-label');
    expect(новыйВидеоТег('v', '  ')).not.toContain('aria-label');
  });

  it('записанный тег вместе со своим импортом узнаётся тем же разбором', () => {
    const текст = `${импортВидео('img01Video', './img-01.webm')}\n\n${новыйВидеоТег('img01Video', 'Диван')}\n`;
    expect(видеоТекста(текст)).toMatchObject([{переменная: 'img01Video', адрес: './img-01.webm'}]);
  });

  it('импорт встаёт в начало первой строки, которая не пустая и не импорт: отступ и чужие импорты сверху не трогаются', () => {
    expect(местоИмпорта('Текст')).toBe(0);
    expect(местоИмпорта('\n\nТекст')).toBe(2);
    expect(местоИмпорта('')).toBe(0);
    expect(местоИмпорта(`${ИМПОРТ}\n\nТекст`)).toBe(ИМПОРТ.length + 2);
    expect(местоИмпорта("import a from './a.png';\nimport b from './b.webm';\n\n")).toBe("import a from './a.png';\nimport b from './b.webm';\n\n".length);
  });

  it('имя переменной — имя файла латиницей плюс Video, занятое имя получает номер', () => {
    expect(свободнаяПеременная('', './img-01.webm')).toBe('img01Video');
    expect(свободнаяПеременная('', './sofa-parameters.webm')).toBe('sofaParametersVideo');
    expect(свободнаяПеременная('', './01.webm')).toBe('v01Video');
    expect(свободнаяПеременная('import img01Video from "./a.webm";', './img-01.webm')).toBe('img01Video2');
    expect(свободнаяПеременная('img01Video img01Video2', './img-01.webm')).toBe('img01Video3');
  });

  it('упоминание считается целым словом и вне названных кусков', () => {
    const видео = видеоТекста(СТАТЬЯ)[0];
    expect(упоминаетсяВне(СТАТЬЯ, 'sofaVideo', [])).toBe(true);
    expect(упоминаетсяВне(СТАТЬЯ, 'sofaVideo', [{from: видео.от, to: видео.до}, {from: 0, to: ИМПОРТ.length}])).toBe(false);
    expect(упоминаетсяВне('sofaVideo2', 'sofaVideo', [])).toBe(false);
  });
});
