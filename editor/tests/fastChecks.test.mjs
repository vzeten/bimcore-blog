// Имя каждого теста повторяет формулировку правила.
// Разбор MDX тем разборщиком, которым собирает сайт (`@mdx-js/mdx` из зависимостей корня материалов,
// динамически и только чтением). Сентябрьская сборка 2026 на GitHub упала на `{#id}` в заголовке:
// с `future.v4` сайт этих старых поблажек не делает, и разбор обязан сказать то же самое.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {разобратьMdx} from '../src/adapters/fastChecks.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Основная папка материалов владельца: её зависимости читаются, ничего не пишется. */
const МАТЕРИАЛЫ = path.resolve(EDITOR, '..', '..', '..', '..', '..');
const естьРазборщик = fs.existsSync(path.join(МАТЕРИАЛЫ, 'node_modules', '@mdx-js', 'mdx', 'index.js'));
const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/what-is-revit/index.mdx';

describe('разбор MDX', () => {
  it('разборщика сайта нет — одно предупреждение «не проверено», а не отказ', async () => {
    const пусто = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-mdx-'));
    try {
      const находки = await разобратьMdx(пусто, [{путь: RU, текст: '---\ntitle: x\n---\nТекст.\n'}]);
      expect(находки.map((н) => `${н.уровень}:${н.код}`)).toEqual(['предупреждение:mdxНеПроверен']);
    } finally {
      fs.rmSync(пусто, {recursive: true, force: true});
    }
  });

  it.skipIf(!естьРазборщик)('`{#id}` в заголовке — блокер со строкой тела, как у упавшей сборки сентября', async () => {
    const текст = '---\ntitle: "Что такое Revit"\n---\n\nВступление.\n\n## 1. Что такое Revit простым языком {#what-is-revit}\n\nТекст.\n';

    const находки = await разобратьMdx(МАТЕРИАЛЫ, [{путь: RU, текст}]);

    expect(находки).toEqual([expect.objectContaining({код: 'mdxОшибка', уровень: 'блокер', путь: RU, строка: 4})]);
    expect(находки[0].значение).toContain('acorn');
  }, 60_000);

  it.skipIf(!естьРазборщик)('исправный текст с блоками, картинками и советами разбирается без находок', async () => {
    const текст = "---\ntitle: x\n---\n\nimport pic from './a.png';\n\n:::tip[Совет]\nТекст **жирно**.\n:::\n\n![кадр](./a.png)\n\n<CTA type=\"lesson\" />\n";

    expect(await разобратьMdx(МАТЕРИАЛЫ, [{путь: RU, текст}])).toEqual([]);
  }, 60_000);
});
