import {describe, expect, it} from 'vitest';
import {
  вставкаБлока, значениеПоРазделу, значениеСвойства, новыйТег, разборТега, сборкаТега, сменаСвойства,
} from '../src/core/jsxBlocks';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sectionOf} from '../src/core/articles.mjs';
import {видБлока} from '../src/ui/livePreview/blocks';
import type {ОписаниеБлока} from '../src/core/jsxBlocks';

const РЕЕСТР: Record<string, ОписаниеБлока> = {
  CTA: {
    подпись: 'Призыв к действию',
    поля: [{
      имя: 'type',
      подпись: 'Заготовка',
      поРазделу: true,
      значения: {guide: 'Семейства', template: 'Шаблон', plugin: 'Плагин'},
    }],
  },
  truncate: {подпись: 'Граница анонса', поля: []},
};

describe('разбор и обратная сборка тега', () => {
  it('простой самозакрывающийся тег разбирается в имя и свойства', () => {
    expect(разборТега('<CTA type="guide" />')).toEqual({
      имя: 'CTA',
      свойства: [{имя: 'type', значение: 'guide'}],
    });
  });

  it('тег без свойств разбирается: у границы анонса свойств нет вовсе', () => {
    expect(разборТега('<truncate />')).toEqual({имя: 'truncate', свойства: []});
  });

  it('разбор и сборка — пара: собранный обратно тег совпадает с исходным', () => {
    const текст = '<YouTube id="abc" title="Урок" duration="PT5M" />';
    const блок = разборТега(текст);

    expect(блок).not.toBeNull();
    expect(сборкаТега(блок!)).toBe(текст);
  });
});

describe('неизвестный и неполный JSX сохраняется дословно', () => {
  const чужие = [
    '<truncate',
    '<CTA type="guide">',
    '<CTA type={тип} />',
    "<CTA type='guide' />",
    '<CTA\n  type="guide"\n/>',
    '</CTA>',
    'просто текст',
  ];

  for (const текст of чужие) {
    it(`разбор отказывается и текст не трогается: ${JSON.stringify(текст)}`, () => {
      expect(разборТега(текст)).toBeNull();
      expect(сменаСвойства(текст, 'type', 'blog')).toBeNull();
    });
  }

  it('незнакомый программе блок не показывается видом: тег остаётся текстом статьи', () => {
    expect(видБлока('<ProductCard id="7" />', РЕЕСТР, () => '')).toBeNull();
  });
});

describe('смена свойства правит только его', () => {
  it('незнакомые свойства и их порядок сохраняются', () => {
    expect(сменаСвойства('<CTA data-x="1" type="guide" data-y="2" />', 'type', 'template'))
      .toBe('<CTA data-x="1" type="template" data-y="2" />');
  });

  it('свойства не было — оно дописывается в конец, остальное не трогается', () => {
    expect(сменаСвойства('<CTA />', 'type', 'blog')).toBe('<CTA type="blog" />');
  });

  it('значение, которое сломало бы запись тега, не записывается вовсе', () => {
    expect(сменаСвойства('<CTA type="guide" />', 'type', 'a"b')).toBeNull();
    expect(сменаСвойства('<CTA type="guide" />', 'type', '<b>')).toBeNull();
  });

  it('значение свойства читается, а отсутствующее не выдумывается', () => {
    expect(значениеСвойства('<CTA type="guide" />', 'type')).toBe('guide');
    expect(значениеСвойства('<CTA />', 'type')).toBeNull();
  });
});

describe('раздел предлагает заготовку, побеждает самое глубокое совпадение', () => {
  const карта = {
    'blog': 'blog',
    'docs/lessons': 'lesson',
    'docs/guides': 'guide',
    'docs/guides/templates': 'template',
    'docs/guides/bimcore-plugin': 'plugin',
    'умолчание': 'guide',
  };

  it('вложенный раздел не сводится к родительскому', () => {
    expect(значениеПоРазделу(карта, {kind: 'docs', path: 'guides/templates'})).toBe('template');
    expect(значениеПоРазделу(карта, {kind: 'docs', path: 'guides/bimcore-plugin'})).toBe('plugin');
  });

  it('раздел без своей записи берёт ближайшего родителя', () => {
    expect(значениеПоРазделу(карта, {kind: 'docs', path: 'guides/families'})).toBe('guide');
  });

  it('раздел верхнего уровня узнаётся по роду папки', () => {
    expect(значениеПоРазделу(карта, {kind: 'blog', path: ''})).toBe('blog');
  });

  it('незнакомый раздел получает умолчание из настроек, а не догадку кода', () => {
    expect(значениеПоРазделу(карта, {kind: 'проба', path: ''})).toBe('guide');
    expect(значениеПоРазделу({}, {kind: 'docs', path: 'guides'})).toBeNull();
  });
});

describe('вставка блока отдельной строкой', () => {
  it('блок встаёт после абзаца, а не внутри него', () => {
    const текст = 'Первый абзац.\n\nВторой абзац.';
    const правка = вставкаБлока(текст, {from: 20, to: 20}, '<truncate />');
    const итог = текст.slice(0, правка.from) + правка.insert + текст.slice(правка.to);

    expect(итог).toBe('Первый абзац.\n\nВторой абзац.\n\n<truncate />');
  });

  it('на пустой строке блок встаёт в неё саму, лишних пустых строк не добавляется', () => {
    const текст = 'Абзац.\n\n\n\nСледующий.';
    const правка = вставкаБлока(текст, {from: 8, to: 8}, '<truncate />');
    const итог = текст.slice(0, правка.from) + правка.insert + текст.slice(правка.to);

    expect(итог).toBe('Абзац.\n\n<truncate />\n\nСледующий.');
  });

  it('соседний текст не переписывается: правка вставляет и ничего не удаляет', () => {
    const правка = вставкаБлока('Абзац.', {from: 3, to: 3}, '<truncate />');

    expect(правка.from).toBe(правка.to);
    expect(правка.insert).toBe('\n\n<truncate />');
  });

  it('курсор остаётся у самого блока, а не за добавленными пустыми строками', () => {
    const правка = вставкаБлока('Абзац.\n\nЕщё.', {from: 3, to: 3}, '<truncate />');

    expect(правка.insert.slice(0, правка.caret)).toBe('\n\n<truncate />');
  });
});

describe('новый тег для вставки', () => {
  it('свойство, которое умеет предлагать раздел, программа подставляет сама', () => {
    expect(новыйТег('CTA', РЕЕСТР['CTA'], () => 'template')).toBe('<CTA type="template" />');
  });

  it('предложить нечего — свойство не пишется вовсе, а не остаётся пустым', () => {
    expect(новыйТег('CTA', РЕЕСТР['CTA'], () => null)).toBe('<CTA />');
  });

  it('блок без полей вставляется как есть и вопросов не задаёт', () => {
    expect(новыйТег('truncate', РЕЕСТР['truncate'], () => null)).toBe('<truncate />');
  });
});

describe('как блок показан в окне', () => {
  it('человек видит подпись блока и название выбранной заготовки, а не JSX', () => {
    expect(видБлока('<CTA type="template" />', РЕЕСТР, () => '')).toEqual({
      имя: 'CTA', подпись: 'Призыв к действию', выбор: ['Шаблон'],
    });
  });

  it('блок без свойств показан одной подписью', () => {
    expect(видБлока('<truncate />', РЕЕСТР, () => '')).toEqual({
      имя: 'truncate', подпись: 'Граница анонса', выбор: [],
    });
  });

  it('заготовка не из списка не проглатывается, а показывается как есть', () => {
    expect(видБлока('<CTA type="старая" />', РЕЕСТР, (значение) => `нет такой: ${значение}`))
      .toEqual({имя: 'CTA', подпись: 'Призыв к действию', выбор: ['нет такой: старая']});
  });
});

describe('настоящие настройки предлагают заготовку по настоящим путям статей', () => {
  const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const settings = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

  const случаи: Array<[string, string]> = [
    ['docs/guides/bimcore-plugin/installation/index.mdx', 'plugin'],
    ['docs/guides/templates/faq/index.mdx', 'template'],
    ['docs/guides/families/chairs-for-revit/index.mdx', 'guide'],
    ['docs/lessons/what-is-revit/index.mdx', 'lesson'],
    ['docs/help/placeholder/index.mdx', 'help'],
    ['blog/welcome/index.mdx', 'blog'],
    ['i18n/ru/docusaurus-plugin-content-blog/welcome/index.mdx', 'blog'],
    ['i18n/ru/docusaurus-plugin-content-docs/current/guides/templates/faq/index.mdx', 'template'],
  ];

  for (const [путь, ожидание] of случаи) {
    it(`${путь} — ${ожидание}`, () => {
      expect(значениеПоРазделу(settings['призывПоРазделу'], sectionOf(путь, settings))).toBe(ожидание);
    });
  }
});
