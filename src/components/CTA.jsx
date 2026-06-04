import React from 'react';
import Translate, {translate} from '@docusaurus/Translate';
import styles from '../css/cta.module.css';

const ctaData = {
  blog: {
    title: translate({id: 'cta.blog.title', message: 'Still figuring things out?'}),
    text: translate({
      id: 'cta.blog.text',
      message: 'Join our community — get answers from real Revit users and download free families for interior and architectural design.',
    }),
    link: 'https://community.bimcore.one/',
    button: translate({id: 'cta.blog.button', message: 'Join the Community'}),
  },
  // ВРЕМЕННО: курса пока нет — lesson CTA уводит в сообщество (поддержка + бесплатные семейства).
  // Вернуть link на '/courses/revit-interior-free' и copy про курс при готовности курса (#45).
  lesson: {
    title: translate({id: 'cta.lesson.title', message: 'Just starting out?'}),
    text: translate({
      id: 'cta.lesson.text',
      message: 'You don\'t have to learn Revit alone. Join the BIMCORE community — ask questions, get answers from real Revit users, and download free families to practice with.',
    }),
    link: 'https://community.bimcore.one/',
    button: translate({id: 'cta.lesson.button', message: 'Join the Community'}),
  },
  course: {
    title: translate({id: 'cta.course.title', message: 'Need help or feedback?'}),
    text: translate({
      id: 'cta.course.text',
      message: 'Join the community — ask questions, share your progress, and get support from other Revit users.',
    }),
    link: 'https://community.bimcore.one/',
    button: translate({id: 'cta.course.button', message: 'Join the Community'}),
  },
  guide: {
    title: translate({id: 'cta.guide.title', message: 'Like these families?'}),
    text: translate({
      id: 'cta.guide.text',
      message: 'These families are part of the Revit Family Set for Interior Designers — everything you need to model interiors in Revit, in one package.',
    }),
    link: 'https://bimcore.one/',
    button: translate({id: 'cta.guide.button', message: 'View the Full Set'}),
  },
  // BIMCORE plugin docs. ВРЕМЕННО → сообщество (отдельной страницы продукта плагина пока нет).
  // Вернуть на страницу плагина, когда появится (аналог guide → продукт).
  plugin: {
    title: translate({id: 'cta.plugin.title', message: 'Using the BIMCORE plugin?'}),
    text: translate({
      id: 'cta.plugin.text',
      message: 'Join the BIMCORE community — get help with the plugin, share feedback, and download free Revit families to use with it.',
    }),
    link: 'https://community.bimcore.one/',
    button: translate({id: 'cta.plugin.button', message: 'Join the Community'}),
  },
  help: {
    title: translate({id: 'cta.help.title', message: "Can't find what you need?"}),
    text: translate({
      id: 'cta.help.text',
      message: 'Ask the community — someone has probably solved this already.',
    }),
    link: 'https://community.bimcore.one/',
    button: translate({id: 'cta.help.button', message: 'Ask a Question'}),
  },
};

export default function CTA({type = 'blog'}) {
  const data = ctaData[type];
  if (!data) return null;

  return (
    <div className={styles.ctaBlock}>
      <p className={styles.ctaTitle}>{data.title}</p>
      <p className={styles.ctaText}>{data.text}</p>
      <a href={data.link} className={styles.ctaButton} target={data.link.startsWith('http') ? '_blank' : '_self'} rel="noopener noreferrer">
        {data.button} →
      </a>
    </div>
  );
}
