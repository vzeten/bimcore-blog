// Нормализатор каталога Ecwid: один на сборку сайта и на сервер редактора.
import {describe, expect, it} from 'vitest';
import {нормализовать, собратьКаталог} from '../../plugins/ecwid-prices/catalog.mjs';

const ОТВЕТ = {
  язык: 'en',
  категории: [
    {id: 1, name: 'Revit Families', nameTranslated: {ru: 'Семейства Revit', en: 'Revit Families'}},
  ],
  товары: [
    {
      id: 577113367,
      sku: 'BC-1',
      name: 'Armchair Revit Families',
      nameTranslated: {ru: 'Кресла для Revit'},
      url: 'https://bimcore.one/products/armchair-revit-families',
      imageUrl: 'https://cdn/armchair.jpg',
      thumbnailUrl: 'https://cdn/armchair-small.jpg',
      defaultCategoryId: 1,
      price: 11,
      defaultDisplayedPriceFormatted: '£11.00',
    },
  ],
};

describe('каталог товаров', () => {
  it('названия отдаются по языкам: непереведённое лежит под языком самого магазина', () => {
    const {товары} = нормализовать(ОТВЕТ);

    expect(товары[0].названия).toEqual({en: 'Armchair Revit Families', ru: 'Кресла для Revit'});
    expect(товары[0].категория).toEqual({en: 'Revit Families', ru: 'Семейства Revit'});
    expect(товары[0]).toMatchObject({id: '577113367', sku: 'BC-1', картинка: 'https://cdn/armchair.jpg'});
  });

  it('цена уходит отдельной картой: в каталоге её нет', () => {
    const {цены, товары} = нормализовать(ОТВЕТ);

    expect(цены['577113367']).toEqual({value: '11', formatted: '£11.00'});
    expect(Object.keys(товары[0])).not.toContain('цена');
  });

  it('товар без адреса или без картинки в каталог не идёт: карточку без них сайт не покажет', () => {
    const {товары, цены} = нормализовать({
      ...ОТВЕТ,
      товары: [
        {id: 2, name: 'Без адреса', imageUrl: 'https://cdn/2.jpg', price: 3},
        {id: 3, name: 'Без картинки', url: 'https://bimcore.one/products/3', price: 4},
      ],
    });

    expect(товары).toEqual([]);
    // Цена при этом остаётся: она ищется по коду товара из уже написанных карточек статей.
    expect(Object.keys(цены).sort()).toEqual(['2', '3']);
  });

  it('картинкой становится уменьшенная, только когда полной у товара нет', () => {
    const {товары} = нормализовать({
      ...ОТВЕТ,
      товары: [{...ОТВЕТ.товары[0], imageUrl: ''}],
    });

    expect(товары[0].картинка).toBe('https://cdn/armchair-small.jpg');
  });

  it('неизвестная категория оставляет надзаголовок пустым, а товар — в каталоге', () => {
    const {товары} = нормализовать({...ОТВЕТ, категории: []});

    expect(товары[0].категория).toEqual({});
  });
});

/** Ответ магазина на один запрос; `путь` решает, какой из трёх спрашивают. */
const ответ = (данные) => ({ok: true, json: async () => данные});

/** Магазин, у которого перечисленные запросы отказали, а остальные отвечают как обычно. */
function магазин(отказали) {
  return async (адрес) => {
    const путь = new URL(адрес).pathname.split('/').pop();
    if (отказали.includes(путь)) return {ok: false, status: 500};
    if (путь === 'profile') return ответ({languages: {defaultLanguage: 'ru'}});
    if (путь === 'categories') return ответ({items: ОТВЕТ.категории});
    return ответ({items: ОТВЕТ.товары});
  };
}

describe('запросы к магазину', () => {
  it('главный запрос один — товары: цены и каталог приходят с ним', async () => {
    const {цены, товары} = await собратьКаталог({token: 'т', запрос: магазин([])});

    expect(цены['577113367']).toEqual({value: '11', formatted: '£11.00'});
    // Язык магазина взят из профиля: непереведённое имя легло бы под `ru`, но там уже перевод.
    expect(товары[0].названия).toEqual({ru: 'Кресла для Revit'});
  });

  it('сбой профиля не обнуляет цены: непереведённое ложится под язык по умолчанию', async () => {
    const {цены, товары, язык} = await собратьКаталог({token: 'т', запрос: магазин(['profile'])});

    expect(цены['577113367']).toEqual({value: '11', formatted: '£11.00'});
    expect(язык).toBe('en');
    expect(товары[0].названия.en).toBe('Armchair Revit Families');
  });

  it('сбой категорий не обнуляет цены: товар остаётся без названия категории', async () => {
    const {цены, товары} = await собратьКаталог({token: 'т', запрос: магазин(['categories'])});

    expect(цены['577113367']).toEqual({value: '11', formatted: '£11.00'});
    expect(товары[0].категория).toEqual({});
  });

  it('сбой обоих вспомогательных запросов цены всё равно оставляет', async () => {
    const {цены} = await собратьКаталог({token: 'т', запрос: магазин(['profile', 'categories'])});

    expect(цены['577113367']).toEqual({value: '11', formatted: '£11.00'});
  });

  it('сбой самих товаров остаётся общей ошибкой: догадываться о ценах не из чего', async () => {
    await expect(собратьКаталог({token: 'т', запрос: магазин(['products'])})).rejects.toThrow('products');
  });
});
