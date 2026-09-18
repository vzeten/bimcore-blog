// Имя каждого теста повторяет формулировку правила.
// Правила записи статьи: ветка выпуска и сверка индекса с утверждённым перечнем.
import {describe, expect, it} from 'vitest';

import {ВЕТКА_ВЫПУСКА, индексВПеречне} from '../src/core/publish.mjs';

const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
const EN = 'docs/lessons/proba/index.mdx';

describe('сверка индекса с утверждённым перечнем', () => {
  it('индекс, совпавший с перечнем, лишнего не показывает', () => {
    expect(индексВПеречне([EN, RU], [EN, RU])).toEqual([]);
  });

  it('индекс уже перечня — это не беда: неизменившийся файл в индекс не попадает', () => {
    expect(индексВПеречне([RU], [EN, RU])).toEqual([]);
  });

  it('лишний путь в индексе назван поимённо: в коммит уехало бы чужое', () => {
    expect(индексВПеречне([RU, 'docs/чужое.mdx'], [EN, RU])).toEqual(['docs/чужое.mdx']);
  });
});

describe('ветка выпуска', () => {
  it('сайт живёт в ветке main', () => {
    expect(ВЕТКА_ВЫПУСКА).toBe('main');
  });
});
