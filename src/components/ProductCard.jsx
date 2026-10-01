import React, {useEffect, useState} from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {translate} from '@docusaurus/Translate';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import {useBlogPost} from '@docusaurus/plugin-content-blog/client';
import каталог from '@generated/product-cards/default/catalog.js';
import ДАННЫЕ from '../data/products.json';
import {меткаСтатьи} from '../../plugins/shop-utm.mjs';
import styles from '../css/productCard.module.css';
import {ссылкиКарточки} from './productCardLinks.js';

/**
 * Карточка набора: фото, название, описание и до двух кнопок (решение владельца 2026-10-01, база
 * marketing/data/learn-funnel-strategy.md, 12.3).
 *
 * На Learn нет цены, валюты и товарной разметки schema.org Product/Offer — товар описывает магазин
 * (решение 2026-09-24).
 *
 * В статье задаются только товар и число кнопок:
 *   <ProductCard ecwidProductId="543629545" guideButton />
 * Остальное подтягивается само:
 * - адреса магазинов, способы оплаты и инструкция набора — из `src/data/products.json`;
 * - название, описание и картинка — из карточки в инструкции набора на языке страницы (плагин `product-cards`);
 * - надписи — из переводов интерфейса сайта (`i18n/<язык>/code.json`).
 * Записанное в самой статье (`name`, `description`, `image`, `imageAlt`) важнее подтянутого: так работают
 * карточки в самих инструкциях и товары без инструкции на этом языке.
 *
 * Главная кнопка «Посмотреть цену в магазине» одинакова для всех. Где на этом языке страницы предлагается
 * выбор оплаты (таблица `оплата.языкиСВыбором`), нажатие раскрывает под ней способы оплаты; выбор
 * запоминается в браузере и действует на все карточки сайта. Без выбора кнопка ведёт сразу в магазин.
 * Вторая кнопка «Состав набора» ведёт на инструкцию набора — только если задано свойство `guideButton`.
 *
 * @param {string} ecwidProductId Код товара — ключ таблицы товаров. Обязательный.
 * @param {boolean} [guideButton] Вторая кнопка «Состав набора».
 * @param {string} [name] [description] [image] [imageAlt] Свои значения вместо подтянутых из инструкции.
 * @param {string} [buyUrl] Адрес товара на bimcore.one — только для товара, которого нет в таблице.
 * @param {string} [guideUrl] Прежнее свойство: означает то же, что `guideButton`, адрес берётся из таблицы.
 */

/** Ключ, под которым браузер помнит выбранный способ оплаты (общий для всех карточек сайта). */
const КЛЮЧ_ВЫБОРА = 'bimcore-shop-payment';

function прочитатьВыбор() {
  try {
    return window.localStorage.getItem(КЛЮЧ_ВЫБОРА);
  } catch {
    return null;
  }
}

function запомнитьВыбор(код) {
  try {
    if (код) window.localStorage.setItem(КЛЮЧ_ВЫБОРА, код);
    else window.localStorage.removeItem(КЛЮЧ_ВЫБОРА);
  } catch {
    // Хранилище недоступно (приватное окно, запрет сайта) — просто не запоминаем.
  }
}

/** Событие аналитики, если она подключена (в сборке для сайта — да, при разработке — нет). */
function событие(имя, параметры) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') window.gtag('event', имя, параметры);
}

/**
 * Метка статьи (`ru/kitchen-for-revit`) — тем же правилом, что ставит сборка на ссылки из текста
 * (`plugins/shop-utm.mjs`), чтобы переходы из карточки и из текста одной статьи складывались вместе.
 * Хуки вызываются всегда в одном порядке; вне своей страницы каждый бросает ошибку, её и ловим.
 */
function useМеткаСтатьи() {
  let документ = '';
  let запись = '';
  try {
    документ = useDoc().metadata.source;
  } catch {
    // не документ
  }
  try {
    запись = useBlogPost().metadata.source;
  } catch {
    // не статья блога
  }
  const источник = документ || запись;
  return источник ? меткаСтатьи(источник.replace(/^@site\//, '')) : '';
}

/** Надписи способов оплаты — из переводов интерфейса; код способа — из таблицы. */
function подписиОплаты() {
  return {
    rub: {
      имя: translate({id: 'productCard.payment.rub', message: 'Russia and Belarus'}),
      подсказка: translate({id: 'productCard.payment.rub.hint', message: 'pay in rubles'}),
    },
    kzt: {
      имя: translate({id: 'productCard.payment.kzt', message: 'Kazakhstan'}),
      подсказка: translate({id: 'productCard.payment.kzt.hint', message: 'pay in tenge'}),
    },
    world: {
      имя: translate({id: 'productCard.payment.world', message: 'Other countries'}),
      подсказка: translate({id: 'productCard.payment.world.hint', message: 'BIMCORE international store'}),
    },
  };
}

export default function ProductCard({
  ecwidProductId,
  guideButton = false,
  name,
  description,
  image,
  imageAlt,
  buyUrl = '',
  guideUrl,
}) {
  const {i18n} = useDocusaurusContext();
  const язык = i18n.currentLocale;
  const статья = useМеткаСтатьи();
  const код = String(ecwidProductId ?? '');
  const подтянуто = каталог[код] ?? {};

  const {оплата, главная, инструкция} = ссылкиКарточки({данные: ДАННЫЕ, код, язык, кампания: статья, buyUrl});
  // Хук зовётся всегда (правило хуков); адрес инструкции — с префиксом языка страницы.
  const адресИнструкции = useBaseUrl(инструкция ?? '/');

  const [выбор, setВыбор] = useState(null);
  const [открыт, setОткрыт] = useState(false);
  // Запомненный выбор читается только в браузере после показа: при сборке страницы его нет, и первая
  // отрисовка обязана совпасть с готовым HTML.
  useEffect(() => {
    setВыбор(прочитатьВыбор());
  }, []);

  const название = name || подтянуто.name;
  const картинка = image || подтянуто.image;
  if (!название || !картинка) return null;
  const описание = description ?? подтянуто.description ?? '';
  const подпись = imageAlt || подтянуто.imageAlt || название;

  const подписи = подписиОплаты();
  const выбрано = оплата.find((с) => с.код === выбор) ?? null;
  const адресКнопки = выбрано?.href ?? главная;
  const нуженВыбор = оплата.length > 0 && !выбрано;
  const показатьИнструкцию = (guideButton || Boolean(guideUrl)) && Boolean(инструкция);

  // В магазин — новая вкладка; `noreferrer` не ставится, чтобы магазин видел, что переход с learn.
  const магазин = {target: '_blank', rel: 'noopener'};
  const параметры = {article: статья, language: язык};

  // Без выбора ссылка обычная. С выбором первое нажатие раскрывает способы оплаты; без скриптов у ссылки
  // остаётся адрес магазина для всех стран, и она по-прежнему ведёт в магазин.
  // Картинка ведёт себя так же, как главная кнопка: иначе на русской странице она уводила бы мимо выбора
  // в магазин для других стран, где российская карта не проходит.
  const нажатьГлавную = (e) => {
    if (!нуженВыбор) return;
    e.preventDefault();
    if (!открыт) событие('shop_choice_open', параметры);
    setОткрыт(!открыт);
  };

  const выбрать = (с) => {
    запомнитьВыбор(с.код);
    setВыбор(с.код);
    setОткрыт(false);
    событие('shop_choice', {...параметры, payment: с.код});
  };

  const сменить = () => {
    запомнитьВыбор(null);
    setВыбор(null);
    setОткрыт(true);
    событие('shop_choice_open', параметры);
  };

  const главнаяПодпись = translate({id: 'productCard.buy', message: 'Check price'});

  return (
    <div className={styles.card}>
      {адресКнопки ? (
        <a className={styles.media} href={адресКнопки} {...магазин} onClick={нажатьГлавную} aria-label={название}>
          <img src={картинка} alt={подпись} loading="lazy" />
        </a>
      ) : (
        <div className={styles.media}>
          <img src={картинка} alt={подпись} loading="lazy" />
        </div>
      )}

      <div className={styles.body}>
        <span className={styles.title}>{название}</span>
        {описание && <p className={styles.desc}>{описание}</p>}

        {(адресКнопки || показатьИнструкцию) && (
          <div className={styles.actions}>
            {адресКнопки && (
              <a
                className={`${styles.btn} ${styles.btnPrimary}`}
                href={адресКнопки}
                {...магазин}
                onClick={нажатьГлавную}
                aria-expanded={нуженВыбор ? открыт : undefined}>
                {главнаяПодпись}
              </a>
            )}
            {показатьИнструкцию && (
              <a className={`${styles.btn} ${styles.btnSecondary}`} href={адресИнструкции}>
                {translate({id: 'productCard.guide', message: "What's included"})}
              </a>
            )}
          </div>
        )}

        {нуженВыбор && открыт && (
          <div className={styles.choice}>
            <p className={styles.choiceTitle}>
              {translate({id: 'productCard.payment.title', message: 'Where will you pay?'})}
            </p>
            {оплата.map((с) => (
              <a key={с.код} className={styles.choiceItem} href={с.href} {...магазин} onClick={() => выбрать(с)}>
                <span>{подписи[с.код]?.имя ?? с.код}</span>
                {подписи[с.код]?.подсказка && <span className={styles.choiceHint}>{подписи[с.код].подсказка}</span>}
              </a>
            ))}
          </div>
        )}

        {выбрано && (
          <p className={styles.chosen}>
            {translate(
              {id: 'productCard.payment.chosen', message: 'Store: {store}.'},
              {store: подписи[выбрано.код]?.имя ?? выбрано.код},
            )}{' '}
            <button type="button" className={styles.change} onClick={сменить}>
              {translate({id: 'productCard.payment.change', message: 'Change'})}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
