// Имя каждого теста повторяет формулировку правила.
// Карточка товара: существующие карточки статей сайта читаются, показываются и правятся.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {EditorState} from '@codemirror/state';
import {сменаСвойства, значениеСвойства, type ОписаниеБлока, type ПолеБлока} from '../src/core/jsxBlocks';
import {blockLayer, видБлока} from '../src/ui/livePreview/blocks';
import {картинкаКарточки} from '../src/ui/livePreview/productCard';
import {файлКартинки} from '../src/adapters/assets.mjs';
import {чтоЗаписать} from '../src/ui/editor/blockFields';

const КОРЕНЬ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(КОРЕНЬ, 'editor', 'settings.json'), 'utf8'));
const БЛОКИ = НАСТРОЙКИ['блоки'] as Record<string, ОписаниеБлока>;

/** Карточка из живой статьи сайта, а не выдуманная: правило проверяется на том, что есть на диске. */
const СТАТЬЯ = path.join(КОРЕНЬ, 'docs', 'guides', 'families', 'doors-for-revit', 'index.mdx');
const ТЕКСТ_СТАТЬИ = fs.readFileSync(СТАТЬЯ, 'utf8');
/** Путь статьи так, как его знает окно: от корня репозитория. Им сервер ищет файл картинки. */
const АДРЕС_СТАТЬИ = 'docs/guides/families/doors-for-revit/index.mdx';
const ПОДПИСИ = НАСТРОЙКИ['подписи'] as Record<string, string>;
const КАРТОЧКА = /<ProductCard[\s\S]*?\/>/.exec(ТЕКСТ_СТАТЬИ)?.[0] ?? '';

/**
 * Живая статья перевода: её карточка берёт картинку импортом от корня репозитория (`@site/…`),
 * из папки английской версии. Правило проверяется на том, что лежит на диске, а не на выдумке.
 */
const СТАТЬЯ_RU = path.join(
  КОРЕНЬ, 'i18n', 'ru', 'docusaurus-plugin-content-docs', 'current',
  'guides', 'families', 'wardrobe-for-revit', 'index.mdx',
);
const ТЕКСТ_RU = fs.readFileSync(СТАТЬЯ_RU, 'utf8');
const АДРЕС_RU = 'i18n/ru/docusaurus-plugin-content-docs/current/guides/families/wardrobe-for-revit/index.mdx';

/** Компонент сайта: его умолчания — единственный источник правды о штатных подписях кнопок. */
const КОМПОНЕНТ = fs.readFileSync(path.join(КОРЕНЬ, 'src', 'components', 'ProductCard.jsx'), 'utf8');

/** Умолчание пропа так, как оно записано в самом компоненте: `buyLabel = 'Buy now'`. */
function умолчаниеСайта(проп: string): string {
  return new RegExp(проп + " = '([^']*)'").exec(КОМПОНЕНТ)?.[1] ?? '';
}

/**
 * Что слой показа заменит своим видом. Куски берутся из самого редактора, а не из файла: окно
 * держит текст переводами строк `\n`, и от знаков файла места блоков в нём отличаются.
 */
function блокиОкна(текст: string): string[] {
  const слой = blockLayer(БЛОКИ, () => АДРЕС_СТАТЬИ);
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

describe('карточка товара показывается видом сайта', () => {
  it('в карточке на своих местах надзаголовок, название, описание и две кнопки', () => {
    const вид = видБлока(КАРТОЧКА, БЛОКИ, () => '');

    expect(вид?.карточка).toMatchObject({
      надзаголовок: 'Revit Family Set',
      название: 'Door Revit Families',
      переменнаяКартинки: 'productPreview',
    });
    expect(вид?.карточка?.описание).not.toBe('');
    expect(вид?.карточка?.кнопки).toHaveLength(2);
  });

  it('картинка карточки берётся из импорта статьи, а не из самого тега', () => {
    expect(картинкаКарточки(ТЕКСТ_СТАТЬИ, АДРЕС_СТАТЬИ, 'productPreview'))
      .toBe('/api/asset?article=docs%2Fguides%2Ffamilies%2Fdoors-for-revit%2Findex.mdx&src=.%2Fproduct.png');
  });

  it('импорта в статье нет — карточка остаётся без картинки, а не без карточки', () => {
    expect(картинкаКарточки(КАРТОЧКА, АДРЕС_СТАТЬИ, 'productPreview')).toBeNull();
    expect(видБлока(КАРТОЧКА, БЛОКИ, () => '')?.карточка).not.toBeUndefined();
  });

  it('блок без картинки-импорта карточкой не показывается', () => {
    expect(видБлока('<CTA type="guide" />', БЛОКИ, () => '')?.карточка).toBeUndefined();
  });
});

describe('название карточки обязательно', () => {
  const поле = БЛОКИ.ProductCard.поля.find((поле) => поле.имя === 'name') as ПолеБлока;

  it('пустое название получает понятный отказ, и в статью не пишется ничего', () => {
    const решение = чтоЗаписать(поле, {name: '   '}, () => true, ПОДПИСИ);

    expect(решение.вид).toBe('беда');
    expect(решение).toMatchObject({беда: expect.stringContaining(поле.подпись)});
  });

  it('заполненное название записывается как обычно', () => {
    expect(чтоЗаписать(поле, {name: 'Двери для Revit'}, () => true, ПОДПИСИ))
      .toEqual({вид: 'записать', значение: 'Двери для Revit'});
  });

  it('в поле не заходили — не пишется даже пустое: просмотр свойств статью не меняет', () => {
    expect(чтоЗаписать(поле, {name: ''}, () => false, ПОДПИСИ)).toEqual({вид: 'нечего'});
  });
});

describe('штатные подписи кнопок карточки', () => {
  it('подписи в теге не записаны — карточка показывает те же подписи, что поставит сайт', () => {
    // В карточках статей сайта `buyLabel` и `shopLabel` не записаны вовсе: подписи ставит компонент.
    expect(значениеСвойства(КАРТОЧКА, 'buyLabel')).toBeNull();
    expect(умолчаниеСайта('buyLabel')).not.toBe('');

    expect(видБлока(КАРТОЧКА, БЛОКИ, () => '')?.карточка?.кнопки)
      .toEqual([умолчаниеСайта('buyLabel'), умолчаниеСайта('shopLabel')]);
  });

  it('своя подпись из тега перебивает штатную', () => {
    const свои = сменаСвойства(КАРТОЧКА, 'buyLabel', 'Купить набор') as string;

    expect(видБлока(свои, БЛОКИ, () => '')?.карточка?.кнопки)
      .toEqual(['Купить набор', умолчаниеСайта('shopLabel')]);
  });
});

describe('картинка карточки из импорта статьи', () => {
  it('импорт от корня репозитория ведёт к настоящему файлу, а не к папке статьи', () => {
    const записан = /from '([^']+)'/.exec(ТЕКСТ_RU)?.[1] ?? '';

    expect(записан.startsWith('@site/')).toBe(true);
    expect(fs.existsSync(файлКартинки(КОРЕНЬ, АДРЕС_RU, записан))).toBe(true);
  });

  it('путь рядом со статьёй и файл общей папки сайта читаются по-прежнему', () => {
    expect(файлКартинки(КОРЕНЬ, АДРЕС_СТАТЬИ, './product.png'))
      .toBe(path.join(КОРЕНЬ, 'docs', 'guides', 'families', 'doors-for-revit', 'product.png'));
    expect(файлКартинки(КОРЕНЬ, АДРЕС_СТАТЬИ, '/img/logo.png'))
      .toBe(path.join(КОРЕНЬ, 'static', 'img', 'logo.png'));
  });

  it('карточка живой статьи перевода доходит до своего файла на диске', () => {
    const карточка = /<ProductCard[\s\S]*?\/>/.exec(ТЕКСТ_RU)?.[0] ?? '';
    const переменная = видБлока(карточка, БЛОКИ, () => '')?.карточка?.переменнаяКартинки ?? '';
    const адрес = картинкаКарточки(ТЕКСТ_RU, АДРЕС_RU, переменная) ?? '';
    const src = new URLSearchParams(адрес.slice(адрес.indexOf('?'))).get('src') ?? '';

    expect(fs.existsSync(файлКартинки(КОРЕНЬ, АДРЕС_RU, src))).toBe(true);
  });

  it('строка импорта карточки человеку не показывается, а из файла не исчезает', () => {
    const строка = /^import .*$/m.exec(ТЕКСТ_RU.split('\r\n').join('\n'))?.[0] ?? '';

    expect(строка).toContain('@site/');
    expect(блокиОкна(ТЕКСТ_RU).join('\n')).toContain(строка);
    expect(fs.readFileSync(СТАТЬЯ_RU, 'utf8')).toContain(строка);
  });
});
