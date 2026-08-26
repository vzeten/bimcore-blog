// Имя каждого теста повторяет формулировку правила.
// Факты каркаса и материализация плана: что программа спрашивает у сайта, чего не спрашивает у
// диска и во что превращается каркас перед сборкой. Проверяется на НАСТОЯЩЕМ git: подставной здесь
// ничего бы не доказал, а весь смысл правила — в вопросе к закреплённому снимку ветки.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

import {ЖДАТЬ_GIT} from './saveHarness.mjs';

import {естьВОснове, локалиРода, фактыКаркаса} from '../src/adapters/publishFacts.mjs';
import {материализовать, отпечатокПлана} from '../src/adapters/planBytes.mjs';
import {СОЗДАНО, ДИСК, каркасПлана} from '../src/core/publishPlan.mjs';
import {планЛокали} from '../src/core/localeVersion.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
const EN = 'docs/lessons/proba/index.mdx';
const ES = 'i18n/es/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
const СТАТЬЯ = '---\ntitle: "Проба"\nslug: /lessons/proba\ndescription: "Про пробу."\n---\n\nТекст статьи.\n';

// Проверки идут на настоящем git: пять секунд по умолчанию им мало, особенно когда весь набор идёт
// разом. Предел общий с остальными git-проверками программы, а не свой.
vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

const песочницы = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Временный репозиторий: русская версия на диске, а в первом коммите — то, что названо. */
async function среда({вКоммите = [EN], наДиске = [RU, EN]} = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-facts-'));
  песочницы.push(repo);
  const git = simpleGit(repo);

  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Проверка');
  await git.addConfig('user.email', 'proverka@example.com');
  await git.addConfig('commit.gpgsign', 'false');

  const положить = (rel, текст = СТАТЬЯ) => {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), текст, 'utf8');
  };

  for (const rel of new Set([...вКоммите, ...наДиске])) положить(rel);
  if (вКоммите.length > 0) await git.raw(['add', '--', ...вКоммите]);
  fs.writeFileSync(path.join(repo, 'README.md'), 'начало\n', 'utf8');
  await git.raw(['add', '--', 'README.md']);
  await git.raw(['commit', '-m', 'начало']);
  const основа = (await git.raw(['rev-parse', 'HEAD'])).trim();

  // Файлы, которых в коммите быть не должно, кладём уже после него.
  for (const rel of наДиске) if (!вКоммите.includes(rel)) положить(rel);

  return {repo, git, основа, положить};
}

describe('факты каркаса', () => {
  it('язык, чей файл лежит в закреплённой ветке, назван опубликованным', async () => {
    const {repo, git, основа} = await среда({вКоммите: [EN, RU]});
    const факты = await фактыКаркаса({git, repo, rel: RU, settings: НАСТРОЙКИ, основа});

    expect(факты.языки.find((язык) => язык.локаль === 'en').опубликован).toBe(true);
  });

  it('язык, которого в закреплённой ветке нет, назван неопубликованным даже если он есть на диске', async () => {
    const {repo, git, основа} = await среда({вКоммите: [EN], наДиске: [RU, EN, ES]});
    const факты = await фактыКаркаса({git, repo, rel: RU, settings: НАСТРОЙКИ, основа});

    expect(факты.языки.find((язык) => язык.локаль === 'es').опубликован).toBe(false);
  });

  it('местный перевод соседа на факты не влияет ничем: спрашивают сайт, а не диск', async () => {
    const {repo, git, основа, положить} = await среда({вКоммите: [EN], наДиске: [RU, EN, ES]});
    const было = await фактыКаркаса({git, repo, rel: RU, settings: НАСТРОЙКИ, основа});

    // Человек начал переводить испанскую версию. Для фактов не изменилось ничего.
    положить(ES, '---\ntitle: "Prueba"\n---\n\nTexto traducido a la mitad.\n');
    const стало = await фактыКаркаса({git, repo, rel: RU, settings: НАСТРОЙКИ, основа});

    expect(стало).toEqual(было);
  });

  it('текст заглушки берётся у того же генератора, что пишет её при входе в локаль', async () => {
    const {repo, git, основа} = await среда({вКоммите: [EN]});
    const факты = await фактыКаркаса({git, repo, rel: RU, settings: НАСТРОЙКИ, основа});
    const свой = планЛокали({
      путь: RU, локаль: 'es', slug: '/lessons/proba', название: 'Проба', дата: '', авторы: '',
      settings: НАСТРОЙКИ,
    });

    expect(факты.языки.find((язык) => язык.локаль === 'es').заглушка).toBe(свой.text);
  });

  it('у открытого языка путь — его собственный, у остальных — путь их версии', async () => {
    const {repo, git, основа} = await среда();
    const факты = await фактыКаркаса({git, repo, rel: RU, settings: НАСТРОЙКИ, основа});
    const путь = (локаль) => факты.языки.find((язык) => язык.локаль === локаль).путь;

    expect(путь('ru')).toBe(RU);
    expect(путь('en')).toBe(EN);
    expect(путь('es')).toBe(ES);
  });

  it('спросить закреплённую ветку не удалось — про язык говорится «не знаю», а не «нет»', async () => {
    const {repo, git} = await среда();
    const факты = await фактыКаркаса({git, repo, rel: RU, settings: НАСТРОЙКИ, основа: 'нетТакогоSha'});

    expect(факты.языки.every((язык) => язык.опубликован === null)).toBe(true);
    expect(каркасПлана(факты).отказ.чего).toBe('опубликованная');
  });

  it('файла открытой версии нет — фактов нет вовсе', async () => {
    const {repo, git, основа} = await среда();

    expect(await фактыКаркаса({git, repo, rel: 'docs/lessons/нет/index.mdx', settings: НАСТРОЙКИ, основа}))
      .toEqual({ошибка: 'нетФайла'});
  });

  it('языки рода берутся из настроек и папки вне сайта в них не входят', () => {
    expect(локалиРода('docs', НАСТРОЙКИ['контент']).sort()).toEqual(['en', 'es', 'ru']);
    expect(локалиРода('проба', НАСТРОЙКИ['контент'])).toEqual([]);
  });

  it('точные пути спрашиваются у закреплённого снимка, а не у рабочего дерева', async () => {
    const {git, основа} = await среда({вКоммите: [EN], наДиске: [RU, EN]});

    const ответ = await естьВОснове(git, основа, [EN, RU]);
    expect([...ответ.файлы.keys()]).toEqual([EN]);
    expect(ответ.файлы.get(EN)).toMatch(/^[0-9a-f]{40}$/);
    expect(ответ.чужие.size).toBe(0);
    expect(await естьВОснове(git, 'нетТакогоSha', [EN])).toBe(null);
  });
});

describe('материализация плана', () => {
  const каркас = (repo) => каркасПлана({
    открытаяВерсия: {путь: RU, локаль: 'ru', состояние: null, файлыПапки: [], статейВПапке: 1},
    наСайте: true,
    языки: [
      {локаль: 'ru', путь: RU, опубликован: false, заглушка: ''},
      {локаль: 'en', путь: EN, опубликован: true, заглушка: 'нет'},
      {локаль: 'es', путь: ES, опубликован: false, заглушка: 'текст заглушки\n'},
    ],
  });

  it('у каждой записи байты одного вида, а рецепта в окончательном плане не остаётся', async () => {
    const {repo} = await среда();
    const {записи, отказ} = материализовать({repo, каркас: каркас(repo)});

    expect(отказ).toBe(null);
    expect(записи.every((запись) => Buffer.isBuffer(запись.байты))).toBe(true);
    expect(записи.every((запись) => запись.текст === undefined)).toBe(true);
  });

  it('байты записи с диска — то, что лежит в файле; байты созданной — её текст', async () => {
    const {repo} = await среда();
    const {записи} = материализовать({repo, каркас: каркас(repo)});
    const по = (путь) => записи.find((запись) => запись.путь === путь);

    expect(по(RU).байты.toString('utf8')).toBe(СТАТЬЯ);
    expect(по(RU).источник).toBe(ДИСК);
    expect(по(ES).байты.toString('utf8')).toBe('текст заглушки\n');
    expect(по(ES).источник).toBe(СОЗДАНО);
  });

  it('каждый собственный файл читается ровно один раз', async () => {
    const {repo} = await среда();
    const чтения = [];
    const настоящее = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((файл, ...прочее) => {
      чтения.push(String(файл));
      return настоящее(файл, ...прочее);
    });

    материализовать({repo, каркас: каркас(repo)});

    expect(чтения).toEqual([path.join(repo, RU)]);
  });

  it('собственный файл исчез между показом и материализацией — отказ, а не пропуск', async () => {
    const {repo} = await среда();
    fs.rmSync(path.join(repo, RU));
    const итог = материализовать({repo, каркас: каркас(repo)});

    expect(итог.записи).toEqual([]);
    expect(итог.отказ).toEqual({код: 'фактыНеизвестны', локали: ['ru'], чего: 'байты'});
  });

  it('порядок окончательного плана устойчив: он такой же, каким его задал каркас', async () => {
    const {repo} = await среда();
    const {записи} = материализовать({repo, каркас: каркас(repo)});

    expect(записи.map((запись) => запись.путь)).toEqual(каркас(repo).записи.map((запись) => запись.путь));
  });
});

describe('отпечаток плана', () => {
  const запись = (путь, байты, ещё = {}) => ({
    путь, назначение: 'версия', локаль: 'ru', режим: '100644', источник: ДИСК,
    байты: Buffer.from(байты, 'utf8'), ...ещё,
  });

  it('одинаковый план даёт одинаковый отпечаток', () => {
    const один = {основа: 'a', родитель: 'b', записи: [запись(RU, 'текст')]};

    expect(отпечатокПлана(один)).toBe(отпечатокПлана({...один}));
  });

  it('сдвиг основы и смена родителя меняют отпечаток при тех же байтах', () => {
    const записи = [запись(RU, 'текст')];

    expect(отпечатокПлана({основа: 'a', родитель: 'b', записи}))
      .not.toBe(отпечатокПлана({основа: 'z', родитель: 'b', записи}));
    expect(отпечатокПлана({основа: 'a', родитель: 'b', записи}))
      .not.toBe(отпечатокПлана({основа: 'a', родитель: 'z', записи}));
  });

  it('переименование, смена назначения и смена источника меняют отпечаток', () => {
    const общий = {основа: 'a', родитель: 'b'};

    expect(отпечатокПлана({...общий, записи: [запись(RU, 'текст')]}))
      .not.toBe(отпечатокПлана({...общий, записи: [запись(ES, 'текст')]}));
    expect(отпечатокПлана({...общий, записи: [запись(RU, 'текст')]}))
      .not.toBe(отпечатокПлана({...общий, записи: [запись(RU, 'текст', {назначение: 'картинка'})]}));
    expect(отпечатокПлана({...общий, записи: [запись(RU, 'текст')]}))
      .not.toBe(отпечатокПлана({...общий, записи: [запись(RU, 'текст', {источник: СОЗДАНО})]}));
  });

  it('границу кусков задаёт длина: два разных плана не сходятся в один поток', () => {
    const общий = {основа: 'a', родитель: 'b'};
    const слева = [запись('a', ''), запись('b', '')];
    const справа = [запись('a', 'b')];

    expect(отпечатокПлана({...общий, записи: слева})).not.toBe(отпечатокПлана({...общий, записи: справа}));
  });
});

// Наличия объекта по точному пути мало: в дереве по нему может лежать каталог, ссылка, подмодуль
// или исполняемый файл. Все они существуют, но обычной страницей сайта не являются — и сочти
// программа их опубликованной версией, она промолчала бы там, где на сайте лежит непонятно что.
describe('в закреплённой ветке по точному пути лежит не файл', () => {
  it('каталог с тем же именем не считается опубликованной версией', async () => {
    const каталогом = `${EN}/внутри.txt`;
    const {repo, git, основа} = await среда({вКоммите: [каталогом], наДиске: [RU]});
    const ответ = await естьВОснове(git, основа, [EN]);

    expect(ответ.файлы.has(EN)).toBe(false);
    expect(ответ.чужие.has(EN)).toBe(true);
    expect(await фактыКаркаса({git, repo, rel: RU, settings: НАСТРОЙКИ, основа})
      .then((факты) => факты.языки.find((язык) => язык.локаль === 'en').опубликован)).toBe(null);
  });

  it('исполняемый файл по пути статьи опубликованной версией не считается', async () => {
    const {git, основа: было, repo} = await среда({вКоммите: [EN]});
    await git.raw(['update-index', '--chmod=+x', '--', EN]);
    await git.raw(['commit', '-m', 'исполняемый']);
    const основа = (await git.raw(['rev-parse', 'HEAD'])).trim();

    const ответ = await естьВОснове(git, основа, [EN]);
    expect(ответ.чужие.has(EN)).toBe(true);
    expect(было).not.toBe(основа);

    const факты = await фактыКаркаса({git, repo, rel: RU, settings: НАСТРОЙКИ, основа});
    expect(факты.языки.find((язык) => язык.локаль === 'en').опубликован).toBe(null);
  });
});

// Git читает путь как шаблон, если ему не сказать иначе. Имя со знаком шаблона внутри — редкость,
// но ответ на него неверен молча, а цена ошибки — заглушка поверх живой страницы сайта.
describe('пути спрашиваются буквально, а не шаблоном', () => {
  const ШАБЛОННЫЙ = 'docs/lessons/pro[b]a/index.mdx';

  it('путь со знаком шаблона не выдаёт за себя соседний файл', async () => {
    const {git, основа} = await среда({вКоммите: [EN], наДиске: [RU, EN]});
    const ответ = await естьВОснове(git, основа, [ШАБЛОННЫЙ]);

    // В ветке лежит `proba`, а спрашивают про `pro[b]a`. Это разные файлы.
    expect(ответ.файлы.has(ШАБЛОННЫЙ)).toBe(false);
    expect(ответ.чужие.size).toBe(0);
  });

  it('путь со знаком шаблона находит сам себя', async () => {
    const {git, основа} = await среда({вКоммите: [ШАБЛОННЫЙ], наДиске: [RU]});

    expect((await естьВОснове(git, основа, [ШАБЛОННЫЙ])).файлы.has(ШАБЛОННЫЙ)).toBe(true);
  });
});
