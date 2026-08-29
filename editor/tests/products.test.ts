// Что программа дописывает в статью при вставке карточки товара: тег и строка импорта картинки.
import {describe, expect, it} from 'vitest';
import {вставкаКарточки, карточкаУжеЕсть, названиеТовара, type Товар} from '../src/ui/editor/products';

const ТОВАР: Товар = {
  id: '577113367',
  названия: {en: 'Armchair Revit Families', ru: 'Кресла для Revit'},
  адрес: 'https://bimcore.one/products/armchair-revit-families',
  картинка: 'https://cdn/armchair.jpg',
  категория: {en: 'Revit Families', ru: 'Семейства Revit'},
  sku: 'BC-1',
};

const ВХОД = {
  текст: 'Первый абзац.\n',
  at: {from: 0, to: 0},
  товар: ТОВАР,
  название: 'Кресла для Revit',
  описание: 'Набор семейств кресел.',
  локаль: 'ru',
  src: './img-01.jpg',
  кнопки: {buyLabel: 'Купить', shopLabel: 'В магазин'},
};

/** Текст статьи после вставки: обе правки применяются одной транзакцией, как это делает окно. */
function применить(вход: typeof ВХОД): string {
  const итог = вставкаКарточки(вход);
  if (итог === null) throw new Error('вставка отказала');

  let текст = вход.текст;
  for (const правка of [...итог.правки].sort((a, b) => b.from - a.from)) {
    текст = текст.slice(0, правка.from) + правка.insert + текст.slice(правка.to);
  }
  return текст;
}

describe('вставка карточки товара', () => {
  it('пишет импорт картинки и тег карточки, какими их читает сам сайт', () => {
    const текст = применить(ВХОД);

    expect(текст).toContain("import productPreview from './img-01.jpg';");
    expect(текст).toContain('<ProductCard');
    expect(текст).toContain('  name="Кресла для Revit"');
    expect(текст).toContain('  eyebrow="Семейства Revit"');
    expect(текст).toContain('  buyUrl="https://bimcore.one/products/armchair-revit-families"');
    expect(текст).toContain('  buyLabel="Купить"');
    expect(текст).toContain('  ecwidProductId="577113367"');
    expect(текст).toContain('  image={productPreview}');
    expect(текст).toContain('/>');
    // Цены и валюты в статье нет вовсе: их по коду товара подставляет сборка сайта.
    expect(текст).not.toContain('price');
    expect(текст).not.toContain('currency');
  });

  it('написанный тег читается собственным разбором программы', async () => {
    const {разборТега} = await import('../src/core/jsxBlocks');
    const текст = применить(ВХОД);
    const тег = текст.slice(текст.indexOf('<ProductCard'), текст.indexOf('/>') + 2);

    const блок = разборТега(тег);
    expect(блок?.имя).toBe('ProductCard');
    expect(блок?.свойства.find((с) => с.имя === 'image')?.выражение).toBe(true);
    expect(блок?.свойства.find((с) => с.имя === 'name')?.значение).toBe('Кресла для Revit');
  });

  it('надзаголовка чужого языка не бывает: нет своего — свойства нет вовсе', () => {
    const текст = применить({...ВХОД, локаль: 'es', название: 'Sillones para Revit'});

    expect(текст).toContain('  name="Sillones para Revit"');
    expect(текст).not.toContain('eyebrow');
  });

  it('пустое описание не пишется: сайт его всё равно не покажет', () => {
    expect(применить({...ВХОД, описание: '   '})).not.toContain('description');
  });

  it('вторая карточка в статью не вставляется: имя переменной картинки одно на статью', () => {
    const текст = применить(ВХОД);

    expect(карточкаУжеЕсть(текст)).toBe(true);
    expect(вставкаКарточки({...ВХОД, текст})).toBeNull();
  });

  it('кавычка в названии или описании отказывает вставке: от неё ломается сам тег', () => {
    expect(вставкаКарточки({...ВХОД, название: 'Кресла "мягкие"'})).toBeNull();
    expect(вставкаКарточки({...ВХОД, описание: 'Набор <b>кресел</b>'})).toBeNull();
  });

  it('без названия вставки нет: без него сайт не показывает карточку вовсе', () => {
    expect(вставкаКарточки({...ВХОД, название: '  '})).toBeNull();
  });

  it('название берётся только своего языка, чужое не подставляется', () => {
    expect(названиеТовара(ТОВАР, 'ru')).toBe('Кресла для Revit');
    expect(названиеТовара(ТОВАР, 'es')).toBe('');
    expect(названиеТовара(ТОВАР, null)).toBe('');
  });
});

describe('отмена вставки товара', () => {
  // Предохранитель от найденного дефекта (P1): окно выбора закрывали во время запроса, а признак
  // актуальности смотрел только на `view.dom.isConnected` — зона статьи остаётся смонтированной,
  // признак оставался верным, и поздний ответ вписывал карточку в статью уже после отмены.
  // Проверяется строкой, а не поведением: отрисовать окно в тесте нечем — рендерера в зависимостях
  // нет и добавлять его запрещено (SPEC 4.10), правило же живёт в React-хуке (SPEC 5.2.1).
  it('закрытие окна выбора делает начатую вставку неактуальной', async () => {
    const fs = await import('node:fs');
    const url = await import('node:url');
    const path = await import('node:path');
    const корень = path.dirname(url.fileURLToPath(import.meta.url));
    const окно = fs.readFileSync(path.join(корень, '../src/ui/editor/ProductPicker.tsx'), 'utf8');

    expect(окно).toContain('актуально: () => живо.current && статья.current === props.article');
    expect(окно).toContain('живо.current = false;');
    expect(окно).not.toContain('актуально: () => props.view.dom.isConnected');
  });
});
