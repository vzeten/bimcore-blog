import React from 'react';
import styles from '../css/productCard.module.css';

/**
 * Лёгкая визуальная карточка товара для инструкций (фото + ссылка в магазин).
 *
 * Роль блока: инструкция на Learn только показывает, о каком товаре речь, и
 * ведёт на его страницу. Товар, цена, валюта, наличие и товарная разметка
 * живут только на bimcore.one (Ecwid) и в Merchant Center, поэтому здесь нет
 * цены и нет schema.org Product/Offer. Разметка страницы — Article (см.
 * src/theme/DocItem/Content/index.js).
 *
 * Почему не встроенный виджет Ecwid: он тянет весь рантайм магазина (сотни КБ)
 * ради одной кнопки и бьёт по скорости первого экрана (LCP) и по SEO.
 *
 * Использование в .mdx (import не нужен — зарегистрирован глобально):
 *   <ProductCard
 *     name="Doors Revit Families"
 *     description="Single, double, sliding and technical doors, doorways and openings."
 *     image={productPreview}
 *     buyUrl="https://bimcore.one/products/door-revit-families"
 *     ecwidProductId="695706588"
 *   />
 *
 * @param {string} name        Название товара — заголовок карточки. Обязательный.
 * @param {string} [description] Краткое описание под названием.
 * @param {string} image       Картинка товара (URL или импортированный ресурс). Обязательный.
 * @param {string} [imageAlt]  Alt картинки (по умолчанию = name).
 * @param {string} buyUrl      Ссылка кнопки на точный товар в магазине.
 * @param {string} [buyLabel]  Текст кнопки, по умолчанию 'View price in store'.
 *
 * ecwidProductId в .mdx сохраняется как идентификатор товара для редактора и
 * каталога; сам компонент его не использует.
 */
export default function ProductCard({
  name,
  description = '',
  image,
  imageAlt = '',
  buyUrl,
  buyLabel = 'View price in store',
}) {
  if (!name || !image) return null;

  return (
    <div className={styles.card}>
      {buyUrl ? (
        <a
          className={styles.media}
          href={buyUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={name}
        >
          <img src={image} alt={imageAlt || name} loading="lazy" />
        </a>
      ) : (
        <div className={styles.media}>
          <img src={image} alt={imageAlt || name} loading="lazy" />
        </div>
      )}

      <div className={styles.body}>
        <span className={styles.title}>{name}</span>
        {description && <p className={styles.desc}>{description}</p>}

        {buyUrl && (
          <div className={styles.actions}>
            <a
              className={`${styles.btn} ${styles.btnPrimary}`}
              href={buyUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {buyLabel}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
