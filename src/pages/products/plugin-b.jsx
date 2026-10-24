import React from 'react';
import COPY from '@site/src/data/plugin-landing-ru.json';
import {LandingPage, Hero, Section, Cards, Rows, Links, Shot, Sets, Final, SHOTS, HeroScene, INTERIORS} from '@site/src/components/PluginLanding';
import styles from '@site/src/components/PluginLanding/styles.module.css';

// Вариант B «Два пути»: сразу делим читателя на «уже приобрёл» и «ещё выбирает».
const c = COPY.B;
const rowShots = [SHOTS.panel, SHOTS.open, SHOTS.info];

export default function PluginB() {
  return (
    <LandingPage copy={c} variant="B">
      <Hero hero={c.hero} shot={<HeroScene {...INTERIORS.dopamine} />} />
      <Section id="paths" title={c.paths.title} tint>
        <Cards cols={2} items={c.paths.items.map((it, i) => ({...it, primary: i === 1}))} />
      </Section>
      <Section title={c.rows.title}>
        <Rows items={c.rows.items.map((it, i) => ({...it, shot: <Shot {...rowShots[i]} />}))} />
        <Links buttons={c.rows.buttons} />
      </Section>
      <Section title={c.ecosystem.title} text={c.ecosystem.text} tint>
        <Sets />
        <div style={{marginTop: 24}}>
          <Links buttons={c.ecosystem.lessons.buttons} />
        </div>
      </Section>
      <Section title="Коротко о главном">
        <div className={styles.qa}>
          {c.qa.map((q, i) => (
            <details key={i} open={i === 0}>
              <summary>{q.q}</summary>
              <p>{q.a}</p>
            </details>
          ))}
        </div>
      </Section>
      <Final final={c.final} />
    </LandingPage>
  );
}
