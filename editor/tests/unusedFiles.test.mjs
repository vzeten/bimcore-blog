// Имя каждого теста повторяет формулировку правила.
// Лишние файлы статьи: что считается лишним, что не считается никогда, как уборка входит в состав
// публикации и как лишнее уходит в корзину. Часть проверок идёт на НАСТОЯЩЕМ git: записи `УДАЛЕНО`
// каркас берёт из закреплённой ветки, и подставной снимок здесь ничего бы не доказал.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

import {ЖДАТЬ_GIT} from './saveHarness.mjs';

import {лишниеФайлы} from '../src/core/unusedFiles.mjs';
import {лишниеВерсий, убратьЛишнее} from '../src/adapters/unusedFacts.mjs';
import {фактыКаркаса} from '../src/adapters/publishFacts.mjs';
import {КАРТИНКА, каркасПлана, УДАЛЕНО} from '../src/core/publishPlan.mjs';
import {вернутьИзКорзины, списокКорзины} from '../src/adapters/trashStore.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
const EN = 'docs/lessons/proba/index.mdx';
const ES = 'i18n/es/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
const ПАПКА = {[RU]: path.posix.dirname(RU), [EN]: path.posix.dirname(EN), [ES]: path.posix.dirname(ES)};

const шапка = (тело) => `---\ntitle: "Проба"\nslug: /lessons/proba\ndescription: "Про пробу."\n---\n\n${тело}\n`;
const СТАТЬЯ = шапка('Текст статьи.');

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

const песочницы = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/**
 * Временный репозиторий с настоящим git. `тексты` — текст каждой версии, `файлы` — прочие файлы
 * папок (путь → содержимое); `вКоммите` — что лежит в закреплённой ветке.
 */
async function среда({тексты = {[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, файлы = {}, вКоммите = []} = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-unused-'));
  песочницы.push(repo);
  const editorDir = path.join(repo, 'editor');
  const git = simpleGit(repo);

  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Проверка');
  await git.addConfig('user.email', 'proverka@example.com');
  await git.addConfig('commit.gpgsign', 'false');

  const положить = (rel, содержимое) => {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), содержимое, 'utf8');
  };
  for (const [rel, текст] of Object.entries(тексты)) положить(rel, текст);
  for (const [rel, содержимое] of Object.entries(файлы)) положить(rel, содержимое);

  fs.writeFileSync(path.join(repo, 'README.md'), 'начало\n', 'utf8');
  await git.raw(['add', '--', 'README.md', ...вКоммите]);
  await git.raw(['commit', '-m', 'начало']);
  const основа = (await git.raw(['rev-parse', 'HEAD'])).trim();

  return {repo, editorDir, git, основа};
}

describe('правило лишнего файла', () => {
  it('файл, на который ссылается соседняя локаль, лишним не считается', () => {
    const пути = ['docs/a/img-01.png'];
    const тексты = ['Текст без картинок.', 'Aquí: ![foto](@site/docs/a/img-01.png)'];

    expect(лишниеФайлы({пути, тексты, имяОбложки: 'cover'})).toEqual([]);
  });

  it('файл, чьё имя не встретилось ни в одном языке, назван лишним', () => {
    const пути = ['docs/a/img-01.png', 'docs/a/старая.jpg'];
    const тексты = ['![](./img-01.png)', '![](./img-01.png)'];

    expect(лишниеФайлы({пути, тексты, имяОбложки: 'cover'})).toEqual(['docs/a/старая.jpg']);
  });

  it('служебные файлы и обложка лишними не бывают никогда', () => {
    const пути = ['docs/a/_state.json', 'docs/a/_category_.json', 'docs/a/cover.png', 'docs/a/.черновик.tmp'];

    expect(лишниеФайлы({пути, тексты: ['Ни одного имени.'], имяОбложки: 'cover'})).toEqual([]);
  });

  it('ссылка в другом регистре удерживает файл: на Windows это один и тот же файл', () => {
    const пути = ['docs/a/IMG-01.PNG'];

    expect(лишниеФайлы({пути, тексты: ['![](./img-01.png)'], имяОбложки: 'cover'})).toEqual([]);
  });

  it('вход не того вида ничего не называет лишним: незнание значит «не убирать»', () => {
    expect(лишниеФайлы({пути: ['docs/a/x.png'], тексты: null, имяОбложки: 'cover'})).toEqual([]);
    expect(лишниеФайлы({пути: ['docs/a/x.png'], тексты: [null], имяОбложки: 'cover'})).toEqual([]);
  });
});

describe('факты о лишних файлах', () => {
  it('счёт ссылок общий по статье, а уборка — в папке каждой отмеченной версии', async () => {
    const {repo} = await среда({
      тексты: {[RU]: шапка('![](./общая.png)'), [EN]: шапка('Без картинок.')},
      файлы: {
        [`${ПАПКА[RU]}/общая.png`]: 'ru', [`${ПАПКА[RU]}/сирота.png`]: 'ru',
        [`${ПАПКА[EN]}/общая.png`]: 'en', [`${ПАПКА[EN]}/сирота.png`]: 'en',
      },
    });
    const карта = лишниеВерсий({repo, settings: НАСТРОЙКИ, версии: [RU, EN]});

    // Английский текст картинок не называет вовсе, но `общая.png` его папки спасена русской ссылкой.
    expect(карта.get(RU)).toEqual([`${ПАПКА[RU]}/сирота.png`]);
    expect(карта.get(EN)).toEqual([`${ПАПКА[EN]}/сирота.png`]);
  });

  it('сбой чтения любой языковой версии — не убирается ничего', async () => {
    const {repo} = await среда({
      тексты: {[RU]: шапка('Текст.'), [EN]: шапка('Текст.')},
      файлы: {[`${ПАПКА[RU]}/сирота.png`]: 'ru'},
    });
    const настоящий = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((цель, ...прочее) => {
      if (String(цель).replace(/\\/g, '/').endsWith(EN)) throw new Error('диск не отвечает');
      return настоящий(цель, ...прочее);
    });

    expect(лишниеВерсий({repo, settings: НАСТРОЙКИ, версии: [RU]})).toBe(null);
  });

  it('вторая статья в папке отменяет уборку в ней: чьи там файлы, по путям не видно', async () => {
    const {repo} = await среда({
      тексты: {[RU]: шапка('Текст.'), [EN]: шапка('Текст.')},
      файлы: {
        [`${ПАПКА[RU]}/сирота.png`]: 'ru',
        [`${ПАПКА[RU]}/соседка/index.mdx`]: СТАТЬЯ,
      },
    });

    expect(лишниеВерсий({repo, settings: НАСТРОЙКИ, версии: [RU]}).get(RU)).toEqual([]);
  });
});

describe('лишнее в плане публикации', () => {
  it('лишний файл выпадает из состава и уходит с сайта записью УДАЛЕНО', async () => {
    const сирота = `${ПАПКА[RU]}/сирота.png`;
    const своя = `${ПАПКА[RU]}/img-01.png`;
    const {repo, git, основа} = await среда({
      тексты: {[RU]: шапка('![](./img-01.png)'), [EN]: шапка('Текст.')},
      файлы: {[сирота]: 'старое', [своя]: 'нужное'},
      вКоммите: [RU, EN, сирота, своя],
    });
    const факты = await фактыКаркаса({git, repo, rel: RU, settings: НАСТРОЙКИ, основа, версии: [RU]});
    const каркас = каркасПлана(факты);
    const запись = (путь) => каркас.записи.find((своя1) => своя1.путь === путь);

    expect(факты.лишние).toEqual([{локаль: 'ru', путь: RU, файлы: [сирота]}]);
    expect(запись(своя)).toMatchObject({назначение: КАРТИНКА, источник: 'диск'});
    expect(запись(сирота)).toMatchObject({источник: УДАЛЕНО, режим: null});
  });

  it('несколько отмеченных локалей одной публикацией убирают лишнее у каждой', async () => {
    const сиротаRU = `${ПАПКА[RU]}/сирота.png`;
    const сиротаEN = `${ПАПКА[EN]}/сирота.png`;
    const {repo, git, основа} = await среда({
      тексты: {[RU]: шапка('Текст.'), [EN]: шапка('Текст.')},
      файлы: {[сиротаRU]: 'ru', [сиротаEN]: 'en'},
      вКоммите: [RU, EN, сиротаRU, сиротаEN],
    });
    const факты = await фактыКаркаса({git, repo, rel: RU, settings: НАСТРОЙКИ, основа, версии: [RU, EN]});
    const каркас = каркасПлана(факты);
    const убираемые = каркас.записи.filter((запись) => запись.источник === УДАЛЕНО).map((запись) => запись.путь);

    expect(убираемые.sort()).toEqual([сиротаRU, сиротаEN].sort());
  });

  it('файл, на который ссылается соседняя локаль, в плане остаётся составом статьи', async () => {
    const общая = `${ПАПКА[EN]}/общая.png`;
    const {repo, git, основа} = await среда({
      тексты: {[RU]: шапка(`![](@site/${общая})`), [EN]: шапка('Текст.')},
      файлы: {[общая]: 'en'},
      вКоммите: [RU, EN, общая],
    });
    const факты = await фактыКаркаса({git, repo, rel: EN, settings: НАСТРОЙКИ, основа, версии: [EN]});
    const каркас = каркасПлана(факты);

    expect(каркас.записи.find((запись) => запись.путь === общая)).toMatchObject({назначение: КАРТИНКА, источник: 'диск'});
  });
});

describe('уборка лишнего в корзину', () => {
  it('лишний файл уходит в корзину и возвращается оттуда целым', async () => {
    const сирота = `${ПАПКА[RU]}/сирота.png`;
    const {repo, editorDir} = await среда({
      тексты: {[RU]: шапка('Текст.'), [EN]: шапка('Текст.')},
      файлы: {[сирота]: 'старое'},
    });
    const итог = убратьЛишнее({repo, editorDir, settings: НАСТРОЙКИ, версии: [RU]});

    expect(итог.убрано).toEqual([сирота]);
    expect(fs.existsSync(path.join(repo, сирота))).toBe(false);
    const записи = списокКорзины({repo, settings: НАСТРОЙКИ});
    expect(записи).toHaveLength(1);
    expect(записи[0].название).toContain('Проба');

    expect(вернутьИзКорзины({repo, editorDir, settings: НАСТРОЙКИ, id: итог.корзина}).возвращено).toEqual([сирота]);
    expect(fs.readFileSync(path.join(repo, сирота), 'utf8')).toBe('старое');
  });

  it('нужный файл и служебные записи остаются на диске нетронутыми', async () => {
    const своя = `${ПАПКА[RU]}/img-01.png`;
    const состояние = `${ПАПКА[RU]}/_state.json`;
    const {repo, editorDir} = await среда({
      тексты: {[RU]: шапка('![](./img-01.png)'), [EN]: шапка('Текст.')},
      файлы: {[своя]: 'нужное', [состояние]: '{}'},
    });
    const итог = убратьЛишнее({repo, editorDir, settings: НАСТРОЙКИ, версии: [RU]});

    expect(итог).toEqual({убрано: [], корзина: null});
    expect(fs.existsSync(path.join(repo, своя))).toBe(true);
    expect(fs.existsSync(path.join(repo, состояние))).toBe(true);
  });

  it('сбой чтения соседней локали не уносит в корзину ничего', async () => {
    const сирота = `${ПАПКА[RU]}/сирота.png`;
    const {repo, editorDir} = await среда({
      тексты: {[RU]: шапка('Текст.'), [EN]: шапка('Текст.')},
      файлы: {[сирота]: 'старое'},
    });
    const настоящий = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((цель, ...прочее) => {
      if (String(цель).replace(/\\/g, '/').endsWith(EN)) throw new Error('диск не отвечает');
      return настоящий(цель, ...прочее);
    });

    expect(убратьЛишнее({repo, editorDir, settings: НАСТРОЙКИ, версии: [RU]})).toEqual({убрано: [], корзина: null});
    expect(fs.existsSync(path.join(repo, сирота))).toBe(true);
  });
});
