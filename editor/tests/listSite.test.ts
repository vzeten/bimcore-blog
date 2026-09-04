// Имя каждого теста повторяет формулировку правила.
// Результат клавиш и кнопок списка читается тем же разбором, что и сайт: mdast с директивами
// примечаний и настоящий компилятор MDX установленного Docusaurus с плагином примечаний.
// Компактный список у сайта — `spread: false`, разреженный — `spread: true`; примечание — контейнер.
import {beforeAll, describe, expect, it} from 'vitest';
import {кнопка, нажать, состояние} from './listHarness';

type Узел = {type: string; name?: string; ordered?: boolean; spread?: boolean; children?: Узел[]; data?: {directiveLabel?: boolean}};

let разобрать: (text: string) => Узел;
let скомпилировать: (text: string) => Promise<string>;

beforeAll(async () => {
  const {unified} = await import('../../node_modules/unified/index.js');
  const {default: remarkParse} = await import('../../node_modules/remark-parse/index.js');
  const {default: remarkDirective} = await import('../../node_modules/remark-directive/index.js');
  const процессор = unified().use(remarkParse).use(remarkDirective);
  разобрать = (text) => процессор.parse(text) as unknown as Узел;

  const {createProcessorUncached} = await import('../../node_modules/@docusaurus/mdx-loader/lib/processor.js');
  const mdx = await createProcessorUncached({
    format: 'mdx',
    options: {
      admonitions: true, remarkPlugins: [], rehypePlugins: [], beforeDefaultRemarkPlugins: [], beforeDefaultRehypePlugins: [], recmaPlugins: [],
      staticDirs: [], siteDir: process.cwd(),
      markdownConfig: {
        format: 'mdx', mermaid: false, emoji: true, preprocessor: undefined, parseFrontMatter: undefined, remarkRehypeOptions: undefined,
        mdx1Compat: {comments: false, admonitions: false, headingIds: false}, anchors: {maintainCase: false},
        hooks: {onBrokenMarkdownLinks: 'warn', onBrokenMarkdownImages: 'warn'},
      },
    } as never,
  });
  скомпилировать = async (text) => (await mdx.process({content: text, filePath: 'проба.mdx', frontMatter: {}, compilerName: 'client'})).content;
});

/** Сжатая запись дерева сайта: `note>list(unordered,3,tight)`. */
function структура(text: string): string[] {
  const запись = (у: Узел): string => {
    // Разреженность у сайта — свойство списка или любого его пункта (пункт с пустой строкой внутри).
    if (у.type === 'list') {
      const разреженный = у.spread === true || (у.children ?? []).some((п) => п.spread === true);
      return `list(${у.ordered ? 'ordered' : 'unordered'},${у.children?.length ?? 0},${разреженный ? 'loose' : 'tight'})`;
    }
    // Заголовок примечания в квадратных скобках remark-directive хранит отдельным узлом-подписью.
    if (у.type === 'containerDirective') return `${у.name}>${(у.children ?? []).filter((д) => д.data?.directiveLabel !== true).map(запись).join('+')}`;
    return у.type;
  };
  return (разобрать(text).children ?? []).map(запись);
}

describe('сайт читает результат кнопки так же, как окно', () => {
  it('абзацы рядом с соседним списком становятся одним компактным списком', () => {
    const текст = 'Раз\n\nДва\n\nТри\n\n- Сосед';
    expect(структура(кнопка(текст, 0, текст.indexOf('\n\n- Сосед'), 'точки')!.текст)).toEqual(['list(unordered,4,tight)']);
  });

  it('уплотнённый старый список — компактный, список с блочным пунктом остаётся разреженным', () => {
    expect(структура(кнопка('- Раз\n\n- Два\n\n- Три', 0, 20, 'числа')!.текст)).toEqual(['list(ordered,3,tight)']);
    expect(структура(кнопка('- Раз\n\n  ![](./a.png)\n- Два', 0, 27, 'числа')!.текст)).toEqual(['list(ordered,2,loose)']);
  });

  it('внутри примечания список живёт в контейнере и границу не пересекает', () => {
    const текст = ':::note[Примечание]\nРаз\n\nДва\n:::\n\nПосле';
    const итог = кнопка(текст, текст.indexOf('Раз'), текст.indexOf('Два') + 3, 'точки')!.текст;
    expect(структура(итог)).toEqual(['note>list(unordered,2,tight)', 'paragraph']);
    const рядом = ':::tip\n- один\n:::\n\nРаз';
    expect(структура(кнопка(рядом, 21, 21, 'точки')!.текст)).toEqual(['tip>list(unordered,1,tight)', 'list(unordered,1,tight)']);
  });

  it('снятие возвращает отдельные абзацы, а не один склеенный', () => {
    expect(структура(кнопка('- a\n- b\n- c', 0, 11, 'точки')!.текст)).toEqual(['paragraph', 'paragraph', 'paragraph']);
  });
});

describe('сайт читает результат клавиш так же, как окно', () => {
  it('Enter в старом разреженном списке даёт компактный список и внутри примечания тоже', () => {
    expect(структура(нажать('Enter', состояние('- Раз\n\n- Два', 12)).текст)).toEqual(['list(unordered,3,tight)']);
    expect(структура(нажать('Enter', состояние(':::tip\n- a\n\n- b\n:::', 15)).текст)).toEqual(['tip>list(unordered,3,tight)']);
  });

  it('Backspace через зазор даёт компактный список из тех же слов', () => {
    const итог = нажать('Backspace', состояние('- Раз\n\n- Два', 7)).текст;
    expect(структура(итог)).toEqual(['list(unordered,2,tight)']);
    expect(итог.replace(/[-\s]/g, '')).toBe('РазДва');
  });
});

describe('установленный компилятор MDX сайта собирает результат с примечаниями', () => {
  it('компактный список внутри :::note компилируется в примечание со списком без абзацев в пунктах', async () => {
    const текст = ':::note[Примечание]\nРаз\n\nДва\n:::';
    const итог = кнопка(текст, текст.indexOf('Раз'), текст.indexOf('Два') + 3, 'точки')!.текст;
    const код = await скомпилировать(итог);
    expect(код).toContain('admonition');
    expect(код).toContain('_components.ul');
    expect(код).not.toContain('_components.p');
  });

  it('разреженный список с картинкой в пункте компилируется с абзацами в пунктах, слова целы', async () => {
    const итог = кнопка('- Раз\n\n  ![](./a.png)\n- Два', 0, 27, 'числа')!.текст;
    const код = await скомпилировать(итог.replace('./a.png', 'https://example.com/a.png'));
    expect(код).toContain('_components.ol');
    expect(код).toContain('_components.p');
    expect(код).toContain('Раз');
    expect(код).toContain('Два');
  });
});
