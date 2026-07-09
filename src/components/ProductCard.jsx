import React from 'react';
import {usePluginData} from '@docusaurus/useGlobalData';
import styles from '../css/productCard.module.css';

/**
 * Лёгкая карточка товара для статей (витрина + ссылки в магазин).
 *
 * Почему так, а не встроенный виджет Ecwid:
 *  - Виджет Ecwid тянет весь рантайм магазина (сотни КБ) ради одной кнопки
 *    и грузится сразу при открытии статьи — это бьёт по скорости первого
 *    экрана (LCP) и по SEO. Здесь же блок почти невесомый: своя разметка,
 *    своя schema.org, ссылки в магазин. Покупка — переходом на страницу товара.
 *
 * Цена (опционально) берётся из globalData, которую при СБОРКЕ наполняет
 * плагин `ecwid-prices` (один запрос к Ecwid на весь каталог). Благодаря
 * этому schema.org price/priceCurrency/availability попадают в статический
 * HTML — их видит Googlebot (иначе GSC ругается «Укажите price»). Ключ
 * поиска цены — ecwidProductId. Нет цены в карте (нет id / сбой запроса) —
 * блок просто рендерится без цены, без ошибок.
 *
 * Использование в .mdx (import не нужен — зарегистрирован глобально):
 *   <ProductCard
 *     name="Doors Revit Families"
 *     eyebrow="Revit Family Set"
 *     description="Single, double, sliding and technical doors, doorways and openings."
 *     image={productPreview}
 *     buyUrl="https://bimcore.one/products/door-revit-families"
 *     shopUrl="https://bimcore.one"
 *     ecwidProductId="695706588"
 *   />
 *
 * @param {string} name        Название товара — заголовок и schema.org name. Обязательный.
 * @param {string} [eyebrow]   Мелкая подпись-«надзаголовок» над названием.
 * @param {string} [description] Краткое описание под названием.
 * @param {string} image       Картинка товара (URL или импортированный ресурс). Обязательный.
 * @param {string} [imageAlt]  Alt картинки (по умолчанию = name).
 * @param {string} buyUrl      Ссылка основной кнопки (страница товара / покупка).
 * @param {string} [shopUrl]   Ссылка второй кнопки (витрина магазина).
 * @param {string} [buyLabel]  Текст основной кнопки, по умолчанию 'Buy now'.
 * @param {string} [shopLabel] Текст второй кнопки, по умолчанию 'Go to the shop'.
 * @param {string} [sku]       Артикул (для schema.org), опционально.
 * @param {string} [brand]     Бренд для schema.org, по умолчанию 'BIMCORE'
 *                             (задел под два бренда по доменам — задача #52).
 * @param {string} [ecwidProductId] ID товара в Ecwid — по нему берётся цена из globalData.
 * @param {string} [currency]       Код валюты для schema.org, по умолчанию 'GBP'.
 */
export default function ProductCard({
  name,
  eyebrow = '',
  description = '',
  image,
  imageAlt = '',
  buyUrl,
  shopUrl = 'https://bimcore.one',
  buyLabel = 'Buy now',
  shopLabel = 'Go to the shop',
  sku = '',
  brand = 'BIMCORE',
  ecwidProductId = '',
  currency = 'GBP',
}) {
  // Цена из данных сборки (плагин ecwid-prices). Читается синхронно и при
  // SSG, поэтому микроразметка price/... попадает в статический HTML.
  const data = usePluginData('ecwid-prices');
  const priceInfo =
    (ecwidProductId && data?.prices?.[String(ecwidProductId)]) || null;
  const priceValue = priceInfo?.value || '';
  const priceText = priceInfo?.formatted || '';

  if (!name || !image) return null;

  const primaryLabel = priceText ? `${priceText} · ${buyLabel}` : buyLabel;

  return (
    <div className={styles.card} itemScope itemType="https://schema.org/Product">
      {buyUrl ? (
        <a
          className={styles.media}
          href={buyUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={name}
        >
          <img src={image} alt={imageAlt || name} loading="lazy" itemProp="image" />
        </a>
      ) : (
        <div className={styles.media}>
          <img src={image} alt={imageAlt || name} loading="lazy" itemProp="image" />
        </div>
      )}

      <div className={styles.body}>
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        <span className={styles.title} itemProp="name">
          {name}
        </span>
        {sku && <meta itemProp="sku" content={sku} />}
        {brand && (
          <span itemProp="brand" itemScope itemType="https://schema.org/Brand">
            <meta itemProp="name" content={brand} />
          </span>
        )}
        {description && (
          <p className={styles.desc} itemProp="description">
            {description}
          </p>
        )}

        <div
          className={styles.actions}
          itemProp="offers"
          itemScope
          itemType="https://schema.org/Offer"
        >
          {priceValue && (
            <>
              <meta itemProp="price" content={priceValue} />
              <meta itemProp="priceCurrency" content={currency} />
              <link itemProp="availability" href="https://schema.org/InStock" />
              {buyUrl && <link itemProp="url" href={buyUrl} />}
            </>
          )}
          {buyUrl && (
            <a
              className={`${styles.btn} ${styles.btnPrimary}`}
              href={buyUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {primaryLabel}
            </a>
          )}
          {shopUrl && (
            <a
              className={`${styles.btn} ${styles.btnSecondary}`}
              href={shopUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {shopLabel}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
