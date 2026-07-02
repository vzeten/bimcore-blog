import React, {useEffect, useState} from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
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
 * Цена (опционально) подтягивается из Ecwid лёгким запросом к REST API —
 * это один маленький JSON (пара КБ), а НЕ рантайм магазина. Чтобы цена
 * показалась, нужны ecwidProductId + ecwidToken (публичный токен магазина).
 * Без токена блок просто не показывает цену — никакой нагрузки.
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
 *     ecwidToken="public_xxx"
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
 * @param {string} [ecwidProductId] ID товара в Ecwid — включает авто-подгрузку цены.
 * @param {string} [ecwidStoreId]   ID магазина Ecwid, по умолчанию '86326685'.
 * @param {string} [ecwidToken]     Переопределить публичный токен Ecwid (обычно не нужно —
 *                                  берётся из customFields.ecwidPublicToken в конфиге).
 * @param {string} [currency]       Код валюты для schema.org, по умолчанию 'GBP'.
 */
const DEFAULT_STORE_ID = '86326685';

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
  ecwidStoreId = DEFAULT_STORE_ID,
  ecwidToken = '',
  currency = 'GBP',
}) {
  // Токен берём из конфига (customFields.ecwidPublicToken); проп — на случай переопределения.
  const {siteConfig} = useDocusaurusContext();
  const token = ecwidToken || siteConfig?.customFields?.ecwidPublicToken || '';

  // Цена, подтянутая из Ecwid: text — для показа (с символом валюты),
  // value — число для schema.org.
  const [priceText, setPriceText] = useState('');
  const [priceValue, setPriceValue] = useState('');

  useEffect(() => {
    if (!ecwidProductId || !ecwidStoreId || !token) return undefined;

    let cancelled = false;
    const url =
      `https://app.ecwid.com/api/v3/${ecwidStoreId}/products/${ecwidProductId}` +
      `?token=${token}&responseFields=price,defaultDisplayedPriceFormatted`;

    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.defaultDisplayedPriceFormatted) {
          setPriceText(data.defaultDisplayedPriceFormatted);
        }
        if (data.price != null) setPriceValue(String(data.price));
      })
      .catch(() => {
        /* цена необязательна — молча игнорируем сбой запроса */
      });

    return () => {
      cancelled = true;
    };
  }, [ecwidProductId, ecwidStoreId, token]);

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
