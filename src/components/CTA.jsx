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
  lesson: {
    title: translate({id: 'cta.lesson.title', message: 'Want the full picture?'}),
    text: translate({
      id: 'cta.lesson.text',
      message: 'This lesson is part of a bigger journey. Start the free Interior Design in Revit course — from zero to a finished project.',
    }),
    link: '/courses/revit-interior-free',
    button: translate({id: 'cta.lesson.button', message: 'Start Free Course'}),
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
    title: translate({id: 'cta.guide.title', message: 'Like what you see?'}),
    text: translate({
      id: 'cta.guide.text',
      message: 'This family is part of the Complete Interior Designer Kit — everything you need to model interiors in Revit, in one package.',
    }),
    link: 'https://bimcore.one/products',
    button: translate({id: 'cta.guide.button', message: 'View the Full Kit'}),
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
