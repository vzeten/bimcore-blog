import React from 'react';
import COPY from '@site/src/data/plugin-landing-ru.json';
import {LandingPage, Hero, Section, Cards, Links, Shot, Sets, Final, SHOTS} from '@site/src/components/PluginLanding';
import styles from '@site/src/components/PluginLanding/styles.module.css';

// Вариант C «Результат первым»: тёмный первый экран про проект интерьера, плагин вторым.
const c = COPY.C;
const stepShots = [SHOTS.panel, SHOTS.open, SHOTS.info];

export default function PluginC() {
  const hero = {
    ...c.hero,
    lead: (
      <>
        {c.hero.lead}
        <span className={styles.facts}>
          {c.facts.map((f, i) => (
            <span className={styles.fact} key={i}>
              {f}
            </span>
          ))}
        </span>
      </>
    ),
  };
  return (
    <LandingPage copy={c} variant="C">
      <Hero hero={hero} dark shot={<Shot {...SHOTS.panel} />} />
      <Section id="steps3" title={c.steps3.title}>
        <Cards
          cols={3}
          items={c.steps3.items.map((it, i) => ({
            ...it,
            title: it.title.replace(/^\d+\.\s*/, ''),
            shot: <Shot {...stepShots[i]} wide />,
          }))}
          numbered
        />
        <Links buttons={c.steps3.buttons} />
      </Section>
      <Section title={c.ecosystem.title} text={c.ecosystem.text} tint>
        <Sets />
        <div style={{marginTop: 24}}>
          <Links buttons={[{text: 'Интерьерный шаблон', href: '/guides/templates'}, ...c.ecosystem.lessons.buttons]} />
        </div>
      </Section>
      <Final final={c.final} />
    </LandingPage>
  );
}
