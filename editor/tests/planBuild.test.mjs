// Имя каждого теста повторяет формулировку правила.
// Сборка ПЛАНА, а не рабочего дерева: программа обязана строить и проверять точную копию будущего
// сайта, а не сегодняшние файлы компьютера. Проверяется на НАСТОЯЩЕМ git с настоящим удалённым
// репозиторием: подставной здесь не доказал бы ничего — весь смысл в вопросе к серверу.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

import {ЖДАТЬ_GIT} from './saveHarness.mjs';

import {закреплённаяОснова} from '../src/adapters/publishBase.mjs';
import {собратьПлан} from '../src/adapters/planBuild.mjs';
import {поставитьЗависимости} from './depsFixture.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
const СТАТЬЯ = '---\ntitle: "Проба"\n---\n\nТекст статьи.\n';

// Проверки идут на настоящем git: пять секунд по умолчанию им мало, особенно когда весь набор идёт
// разом. Предел общий с остальными git-проверками программы, а не свой.
vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

const песочницы = [];

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Рабочий репозиторий с настоящим удалённым: голая копия рядом, ветка `main` отправлена. */
async function среда() {
  const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-base-'));
  песочницы.push(корень);

  const сервер = path.join(корень, 'origin.git');
  const repo = path.join(корень, 'работа');
  fs.mkdirSync(repo, {recursive: true});

  await simpleGit(корень).raw(['init', '--bare', '--initial-branch=main', сервер]);

  const git = simpleGit(repo);
  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Проверка');
  await git.addConfig('user.email', 'proverka@example.com');
  await git.addConfig('commit.gpgsign', 'false');
  await git.raw(['remote', 'add', 'origin', сервер]);

  fs.mkdirSync(path.join(repo, path.dirname(RU)), {recursive: true});
  fs.writeFileSync(path.join(repo, RU), СТАТЬЯ, 'utf8');
  поставитьЗависимости(repo);
  await git.raw(['add', '--', RU]);
  await git.raw(['commit', '-m', 'начало']);
  await git.raw(['push', 'origin', 'main']);

  return {корень, repo, git, сервер};
}

const настройки = {...НАСТРОЙКИ, отправка: {...НАСТРОЙКИ['отправка'], удалённый: 'origin'}};

describe('сборка плана', () => {
  /** Подставной сборщик: запоминает, где его запустили и что там лежало. */
  const сборщик = (виденное) => (файл, аргументы, настройки, готово) => {
    const копия = настройки.cwd;
    виденное.копия = копия;
    виденное.статья = fs.readFileSync(path.join(копия, RU), 'utf8');
    виденное.свои = fs.existsSync(path.join(копия, 'node_modules'));
    виденное.сборщик = аргументы[0];
    готово(null, 'собрано', '');
    return {on: () => {}};
  };

  const план = (текст) => [{
    путь: RU, назначение: 'версия', локаль: 'ru', режим: '100644', источник: 'диск',
    байты: Buffer.from(текст, 'utf8'),
  }];

  it('сборка видит байты ПЛАНА, а не сегодняшний файл компьютера', async () => {
    const {repo, git} = await среда();
    // Человек правит статью прямо сейчас. Сборка обязана проверять не это, а план.
    fs.writeFileSync(path.join(repo, RU), 'испорчено человеком прямо сейчас\n', 'utf8');
    const {основа} = await закреплённаяОснова({git, settings: настройки});
    const виденное = {};

    const итог = await собратьПлан({
      git, repo, основа, записи: план('байты плана\n'), пределМинут: 1, запуск: сборщик(виденное),
    });

    expect(итог.зелёная).toBe(true);
    expect(виденное.статья).toBe('байты плана\n');
    expect(виденное.копия).not.toBe(repo);
  });

  it('копия своих зависимостей не заводит и связи на них не получает', async () => {
    const {repo, git} = await среда();
    const {основа} = await закреплённаяОснова({git, settings: настройки});
    const виденное = {};

    await собратьПлан({git, repo, основа, записи: план('байты\n'), пределМинут: 1, запуск: сборщик(виденное)});

    // Внутри удаляемой копии нет ни зависимостей, ни связи на них: уводить уборку наружу нечему.
    expect(виденное.свои).toBe(false);
    // Сборщик берётся у настоящего проекта, а копия лежит внутри него — Node найдёт зависимости
    // обычным подъёмом по дереву папок, безо всякой связи.
    expect(виденное.сборщик.startsWith(repo)).toBe(true);
    expect(виденное.копия.startsWith(repo + path.sep)).toBe(true);
    // Настоящие зависимости репозитория уборкой не тронуты.
    expect(fs.existsSync(path.join(repo, 'node_modules', '@docusaurus', 'core', 'bin', 'docusaurus.mjs'))).toBe(true);
  });

  it('без своих зависимостей сборка плана не начинается и копии после себя не оставляет', async () => {
    const {repo, git} = await среда();
    const {основа} = await закреплённаяОснова({git, settings: настройки});
    fs.rmSync(path.join(repo, 'node_modules'), {recursive: true, force: true});
    let звали = false;

    const итог = await собратьПлан({
      git, repo, основа, записи: план('байты\n'), пределМинут: 1,
      запуск: () => { звали = true; return {on: () => {}}; },
    });

    expect(звали).toBe(false);
    expect(итог.ошибка).toBe('зависимостейНет');
    expect(fs.readdirSync(repo).some((имя) => имя.startsWith('.editor-plan-'))).toBe(false);
  });

  it('вместе со сборкой считается ожидаемое дерево будущего коммита', async () => {
    const {repo, git} = await среда();
    const {основа} = await закреплённаяОснова({git, settings: настройки});

    const итог = await собратьПлан({git, repo, основа, записи: план('байты\n'), пределМинут: 1, запуск: сборщик({})});

    expect(итог.дерево).toMatch(/^[0-9a-f]{40}$/);
  });

  it('разные планы дают разные ожидаемые деревья', async () => {
    const {repo, git} = await среда();
    const {основа} = await закреплённаяОснова({git, settings: настройки});
    const собрать = (текст) => собратьПлан({
      git, repo, основа, записи: план(текст), пределМинут: 1, запуск: сборщик({}),
    });

    expect((await собрать('один\n')).дерево).not.toBe((await собрать('другой\n')).дерево);
  });

  it('временная копия убирается после сборки, и её не остаётся в учёте git', async () => {
    const {repo, git} = await среда();
    const {основа} = await закреплённаяОснова({git, settings: настройки});
    const виденное = {};

    await собратьПлан({git, repo, основа, записи: план('байты\n'), пределМинут: 1, запуск: сборщик(виденное)});

    expect(fs.existsSync(виденное.копия)).toBe(false);
    expect((await git.raw(['worktree', 'list']))).not.toContain(виденное.копия);
  });

  it('красная сборка остаётся красной и копию всё равно убирает', async () => {
    const {repo, git} = await среда();
    const {основа} = await закреплённаяОснова({git, settings: настройки});
    let копия = null;
    const падает = (файл, аргументы, настройки, готово) => {
      копия = настройки.cwd;
      готово(Object.assign(new Error('упало'), {code: 1}), '', 'ошибка сборки');
      return {on: () => {}};
    };

    const итог = await собратьПлан({git, repo, основа, записи: план('байты\n'), пределМинут: 1, запуск: падает});

    expect(итог.зелёная).toBe(false);
    expect(итог.вывод).toContain('ошибка сборки');
    expect(fs.existsSync(копия)).toBe(false);
  });

  it('путь плана, уводящий за пределы копии, сборку не запускает вовсе', async () => {
    const {repo, git} = await среда();
    const {основа} = await закреплённаяОснова({git, settings: настройки});
    let звали = false;
    const записи = [{
      путь: '../снаружи.mdx', назначение: 'версия', локаль: 'ru', режим: '100644', источник: 'диск',
      байты: Buffer.from('наружу\n', 'utf8'),
    }];

    const итог = await собратьПлан({
      git, repo, основа, записи, пределМинут: 1, запуск: () => { звали = true; return {on: () => {}}; },
    });

    expect(итог.ошибка).toBe('путьЗаПределами');
    expect(звали).toBe(false);
    expect(fs.existsSync(path.join(repo, '..', 'снаружи.mdx'))).toBe(false);
  });
});

// Три беды, которых обычный удачный прогон не видит: режим файла, ссылка внутри копии и уборка,
// которая не удалась. Каждая из них тиха и каждая дорога.
describe('сборка плана: аварийные границы', () => {
  const запись = (путь, текст) => ({
    путь, назначение: 'версия', локаль: 'ru', режим: '100644', источник: 'диск',
    байты: Buffer.from(текст, 'utf8'),
  });

  const пустой = () => ({on: () => {}});
  const удачный = (файл, аргументы, настройки, готово) => {
    готово(null, 'собрано', '');
    return пустой();
  };

  it('режим будущего дерева берётся из плана, а не наследуется у основы', async () => {
    const {repo, git} = await среда();
    // В опубликованной ветке файл однажды стал исполняемым. План обещает обычный файл.
    await git.raw(['update-index', '--chmod=+x', '--', RU]);
    await git.raw(['commit', '-m', 'исполняемый']);
    await git.raw(['push', 'origin', 'main']);
    const {основа} = await закреплённаяОснова({git, settings: настройки});

    const итог = await собратьПлан({
      git, repo, основа, записи: [запись(RU, 'байты\n')], пределМинут: 1, запуск: удачный,
    });

    const строка = await git.raw(['ls-tree', итог.дерево, '--', RU]);
    expect(строка.startsWith('100644 blob')).toBe(true);
  });

  it('связь, появившаяся внутри копии во время сборки, снимается, а её цель цела', async () => {
    const {корень, repo, git} = await среда();
    const {основа} = await закреплённаяОснова({git, settings: настройки});
    // Внешнее дерево — то самое, что однажды было вычищено уборкой рабочей копии.
    const снаружи = path.join(корень, 'дорогое');
    fs.mkdirSync(снаружи, {recursive: true});
    fs.writeFileSync(path.join(снаружи, 'файл'), 'дорогое содержимое\n', 'utf8');

    const связьВКопии = (файл, аргументы, настройки, готово) => {
      const вид = process.platform === 'win32' ? 'junction' : 'dir';
      fs.symlinkSync(снаружи, path.join(настройки.cwd, 'наружу'), вид);
      готово(null, 'собрано', '');
      return пустой();
    };

    const итог = await собратьПлан({
      git, repo, основа, записи: [запись(RU, 'байты\n')], пределМинут: 1, запуск: связьВКопии,
    });

    expect(итог.зелёная).toBe(true);
    // Главное свойство: внешнее дерево целиком на месте, а копии не осталось.
    expect(fs.readFileSync(path.join(снаружи, 'файл'), 'utf8')).toBe('дорогое содержимое\n');
    expect(fs.readdirSync(repo).some((имя) => имя.startsWith('.editor-plan-'))).toBe(false);
  });
});
