import React from 'react';
import Layout from '@theme/Layout';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import ProductCard from '@site/src/components/ProductCard';
import styles from './styles.module.css';

// Черновики продающей страницы плагина (три варианта на выбор владельца, 24.10.2026).
// Закрыты от поиска: noindex убирает их и из карты сайта. В меню не стоят.
// Снимки временные, пока «Плагин BIMCORE» не снимет живой Revit.

export function LandingPage({copy, variant, children}) {
  return (
    <Layout title={copy.seoTitle} description={copy.description}>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className={`${styles.page} ${styles[`variant${variant}`] || ''}`}>{children}</main>
    </Layout>
  );
}

export function Button({href, children, kind = 'primary'}) {
  const cls = kind === 'primary' ? styles.btnPrimary : styles.btnSecondary;
  if (href && href.startsWith('#')) {
    return (
      <a className={cls} href={href}>
        {children}
      </a>
    );
  }
  return (
    <Link className={cls} to={href}>
      {children}
    </Link>
  );
}

export function Shot({src, alt, wide}) {
  return (
    <figure className={`${styles.shot} ${wide ? styles.shotWide : ''}`}>
      <img src={useBaseUrl(src)} alt={alt} loading="lazy" />
      <figcaption className={styles.temp}>временный снимок</figcaption>
    </figure>
  );
}

export function Hero({hero, shot, dark}) {
  return (
    <section className={`${styles.hero} ${dark ? styles.heroDark : ''}`}>
      <div className={styles.heroText}>
        <div className={styles.eyebrow}>{hero.eyebrow}</div>
        <h1 className={styles.heroTitle}>{hero.title}</h1>
        <p className={styles.lead}>{hero.lead}</p>
        <div className={styles.buttons}>
          <Button href={hero.primaryHref}>{hero.primary}</Button>
          <Button href={hero.secondaryHref} kind="secondary">
            {hero.secondary}
          </Button>
        </div>
      </div>
      <div className={styles.heroShot}>{shot}</div>
    </section>
  );
}

export function Section({id, title, text, tint, children}) {
  return (
    <section id={id} className={`${styles.section} ${tint ? styles.tint : ''}`}>
      <div className={styles.inner}>
        {title && <h2 className={styles.h2}>{title}</h2>}
        {text && <p className={styles.sectionText}>{text}</p>}
        {children}
      </div>
    </section>
  );
}

export function Cards({items, cols = 3, numbered}) {
  return (
    <div className={styles.cards} style={{'--cols': cols}}>
      {items.map((it, i) => (
        <div className={styles.card} key={i}>
          {it.shot}
          {numbered && <div className={styles.num}>{i + 1}</div>}
          <h3 className={styles.cardTitle}>{it.title}</h3>
          <p>{it.text}</p>
          {it.buttons && (
            <div className={styles.buttons}>
              {it.buttons.map((b, j) => (
                <Button key={j} href={b.href} kind={j === 0 && it.primary ? 'primary' : 'secondary'}>
                  {b.text}
                </Button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Rows({items}) {
  return (
    <div className={styles.rows}>
      {items.map((it, i) => (
        <div className={`${styles.row} ${i % 2 ? styles.rowFlip : ''}`} key={i}>
          <div className={styles.rowShot}>{it.shot}</div>
          <div>
            <h3 className={styles.rowTitle}>{it.title}</h3>
            <p>{it.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Links({buttons}) {
  if (!buttons || !buttons.length) return null;
  return (
    <div className={styles.buttons}>
      {buttons.map((b, i) => (
        <Button key={i} href={b.href} kind="secondary">
          {b.text}
        </Button>
      ))}
    </div>
  );
}

export function Sets() {
  return (
    <div className={styles.sets}>
      <ProductCard ecwidProductId="543629545" guideButton />
      <ProductCard ecwidProductId="560800271" guideButton />
      <ProductCard ecwidProductId="543746528" guideButton />
    </div>
  );
}

export function Final({final}) {
  return (
    <section className={styles.final}>
      <h2 className={styles.finalTitle}>{final.title}</h2>
      <p className={styles.finalText}>{final.text}</p>
      <div className={styles.buttons} style={{justifyContent: 'center'}}>
        {final.buttons.map((b, i) => (
          <Button key={i} href={b.href}>
            {b.text}
          </Button>
        ))}
      </div>
      <p className={styles.support}>
        Вопросы по плагину: <a href="https://t.me/IntLinesSupportBot">поддержка в Telegram</a> ·{' '}
        <Link to="/guides/bimcore-plugin/faq">вопросы и ответы</Link>
      </p>
    </section>
  );
}

export const SHOTS = {
  panel: {src: '/img/plugin-landing/panel-sets.png', alt: 'Панель плагина BIMCORE с наборами семейств'},
  open: {src: '/img/plugin-landing/set-open.png', alt: 'Раскрытый набор и кнопка Разместить'},
  info: {src: '/img/plugin-landing/set-info.png', alt: 'Карточка Информация о Наборе'},
  lang: {src: '/img/plugin-landing/settings-language.png', alt: 'Язык контента в настройках плагина'},
};
