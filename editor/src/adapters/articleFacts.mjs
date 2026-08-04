// Что известно об открытой статье: её языковые версии, их состояние, категория, готовность.
// Вынесено из сервера, чтобы он оставался в пределах лимита размера файла (SPEC 4.9).
// Правил здесь нет — сборка ответа из уже готового свода статей.

import {articlePlace} from '../core/frontmatterRules.mjs';
import {versionStates} from '../core/articles.mjs';

const ПУСТО = {versions: {}, states: {}, category: '', нетНаСайте: false, служебная: false, готовность: null};

/** `свод` — все статьи с диска; `rel` — путь открытой языковой версии. */
export function articleFacts(свод, rel, settings) {
  const article = свод.find((item) => Object.values(item.versions).some((v) => v.path === rel));
  if (!article) return {...ПУСТО};

  const times = Object.fromEntries(
    Object.entries(article.versions).map(([locale, version]) => [locale, version.когда]),
  );

  // Готовность и скрытость открытой версии — как у её файла, а не всегда «первый статус».
  const своя = article.versions[articlePlace(rel, settings['контент']).locale];

  return {
    versions: Object.fromEntries(Object.entries(article.versions).map(([l, v]) => [l, v.path])),
    states: versionStates(article, times, settings),
    category: article.category,
    нетНаСайте: article.нетНаСайте,
    служебная: article.служебная,
    готовность: своя?.готовность ?? null,
    скрыта: своя?.скрыта ?? false,
  };
}
