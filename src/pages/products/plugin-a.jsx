import React from 'react';
import COPY from '@site/src/data/plugin-landing-ru.json';
import {LandingPage, Hero, Section, Cards, Links, Shot, Sets, Final, SHOTS, HeroScene, INTERIORS} from '@site/src/components/PluginLanding';
import styles from '@site/src/components/PluginLanding/styles.module.css';

// Вариант A «Экосистема»: от общей картины BIMCORE к плагину.
const c = COPY.A;
const featureShots = [SHOTS.panel, SHOTS.open, SHOTS.info, SHOTS.lang];

export default function PluginA() {
  return (
    <LandingPage copy={c} variant="A">
      <Hero hero={c.hero} shot={<HeroScene {...INTERIORS.apartment} />} />
      <Section id="ecosystem" title={c.ecosystem.title} text={c.ecosystem.text} tint>
        <Cards items={c.ecosystem.items} cols={4} />
        <Links buttons={c.ecosystem.lessons.buttons} />
      </Section>
      <Section title={c.features.title}>
        <Cards cols={4} items={c.features.items.map((it, i) => ({...it, shot: <Shot {...featureShots[i]} wide />}))} />
        <Links buttons={c.features.buttons} />
      </Section>
      <Section tint>
        <div className={styles.cards} style={{'--cols': 2}}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>{c.bought.title}</h3>
            <p>{c.bought.text}</p>
            <Links buttons={c.bought.buttons} />
          </div>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Что бесплатно</h3>
            <ul className={styles.check}>
              {c.free.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
      <Section title={c.sets.title} text={c.sets.text}>
        <Sets />
      </Section>
      <Final final={c.final} />
    </LandingPage>
  );
}
