// Имя каждого теста повторяет формулировку правила.
// Карточка товара: существующие карточки статей сайта читаются, показываются и правятся.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {EditorState} from '@codemirror/state';
import {сменаСвойства, значениеСвойства, type ОписаниеБлока} from '../src/core/jsxBlocks';
import {blockLayer, видБлока} from '../src/ui/livePreview/blocks';

const КОРЕНЬ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(КОРЕНЬ, 'editor', 'settings.json'), 'utf8'));
const БЛОКИ = НАСТРОЙКИ['блоки'] as Record<string, ОписаниеБлока>;

/** Карточка из живой статьи сайта, а не выдуманная: правило проверяется на том, что есть на диске. */
const СТАТЬЯ = path.join(КОРЕНЬ, 'docs', 'guides', 'families', 'doors-for-revit', 'index.mdx');
const ТЕКСТ_СТАТЬИ = fs.readFileSync(СТАТЬЯ, 'utf8');
const КАРТОЧКА = /<ProductCard[\s\S]*?\/>/.exec(ТЕКСТ_СТАТЬИ)?.[0] ?? '';

/**
 * Что слой показа заменит своим видом. Куски берутся из самого редактора, а не из файла: окно
 * держит текст переводами строк `\n`, и от знаков файла места блоков в нём отличаются.
 */
function блокиОкна(текст: string): string[] {
  const слой = blockLayer(БЛОКИ);
  const состояние = EditorState.create({doc: текст, extensions: [слой]});
  const вОкне = состояние.doc.toString();
  const найдены: string[] = [];
  состояние.field(слой).between(0, вОкне.length, (от, до) => {
    найдены.push(вОкне.slice(от, до));
  });

  return найдены;
}

describe('карточка товара живой статьи', () => {
  it('карточка статьи сайта записана столбиком и программой узнаётся', () => {
    expect(КАРТОЧКА).toContain('\n');
    expect(видБлока(КАРТОЧКА, БЛОКИ, () => '')).toMatchObject({
      имя: 'ProductCard',
      подпись: 'Карточка товара',
      название: 'Door Revit Families',
    });
  });

  it('слой показа накрывает карточку целиком, а текст статьи вокруг не трогает', () => {
    const куски = блокиОкна(ТЕКСТ_СТАТЬИ);

    expect(куски).toContain(КАРТОЧКА.split('\r\n').join('\n'));
  });

  it('тег внутри огороженного кода остаётся примером, а не становится блоком', () => {
    const текст = ['```mdx', '<CTA type="guide" />', '```'].join('\n');

    expect(блокиОкна(текст)).toEqual([]);
  });

  it('правка одного свойства не меняет остальные знаки карточки', () => {
    const стало = сменаСвойства(КАРТОЧКА, 'description', 'Новое описание');

    expect(стало).not.toBeNull();
    expect(значениеСвойства(стало as string, 'description')).toBe('Новое описание');
    expect(разница(КАРТОЧКА, стало as string)).toEqual(['description']);
  });

  it('картинка карточки остаётся импортом статьи: программа её не переписывает', () => {
    expect(значениеСвойства(КАРТОЧКА, 'image')).toBeNull();
    expect(сменаСвойства(КАРТОЧКА, 'image', './product.png')).toBeNull();
  });
});

/** Имена свойств, чьи строки в теге различаются. Сравнение построчное: тег записан столбиком. */
function разница(было: string, стало: string): string[] {
  const слева = было.split('\n');
  const справа = стало.split('\n');
  const имена: string[] = [];

  expect(справа.length).toBe(слева.length);
  for (let номер = 0; номер < слева.length; номер += 1) {
    if (слева[номер] === справа[номер]) continue;
    имена.push(/^\s*([A-Za-z][A-Za-z0-9-]*)=/.exec(слева[номер])?.[1] ?? слева[номер]);
  }

  return имена;
}
