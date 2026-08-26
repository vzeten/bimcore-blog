// Имя каждого теста повторяет формулировку правила.
// Закреплённая основа публикации: план обещает, чем станет САЙТ, поэтому основа берётся у сервера,
// а `HEAD` подменой не служит. Проверяется на НАСТОЯЩЕМ git с настоящим удалённым репозиторием:
// подставной здесь не доказал бы ничего — весь смысл в вопросе к серверу.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

import {ЖДАТЬ_GIT} from './saveHarness.mjs';

import {закреплённаяОснова} from '../src/adapters/publishBase.mjs';

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
  fs.mkdirSync(path.join(repo, 'node_modules', 'сборщик'), {recursive: true});
  fs.writeFileSync(path.join(repo, 'node_modules', 'сборщик', 'файл'), 'зависимость\n', 'utf8');
  await git.raw(['add', '--', RU]);
  await git.raw(['commit', '-m', 'начало']);
  await git.raw(['push', 'origin', 'main']);

  return {корень, repo, git, сервер};
}

const настройки = {...НАСТРОЙКИ, отправка: {...НАСТРОЙКИ['отправка'], удалённый: 'origin'}};

describe('закреплённая основа', () => {
  it('голова равна опубликованной ветке — основа закреплена', async () => {
    const {git} = await среда();
    const итог = await закреплённаяОснова({git, settings: настройки});

    expect(итог.ошибка).toBe(undefined);
    expect(итог.основа).toBe(итог.голова);
    expect(итог.основа).toMatch(/^[0-9a-f]{40}$/);
  });

  it('свой коммит ещё не уехал — новый выпуск не начинается', async () => {
    const {repo, git} = await среда();
    fs.writeFileSync(path.join(repo, RU), `${СТАТЬЯ}Ещё строка.\n`, 'utf8');
    await git.raw(['add', '--', RU]);
    await git.raw(['commit', '-m', 'правка']);

    expect((await закреплённаяОснова({git, settings: настройки})).ошибка).toBe('естьНеотправленное');
  });

  it('на сервере появилась чужая работа — публикация не начинается', async () => {
    const {корень, repo, git, сервер} = await среда();
    const чужой = path.join(корень, 'чужой');
    await simpleGit(корень).raw(['clone', сервер, чужой]);
    const чужойGit = simpleGit(чужой);
    await чужойGit.addConfig('user.name', 'Другой');
    await чужойGit.addConfig('user.email', 'drugoy@example.com');
    await чужойGit.addConfig('commit.gpgsign', 'false');
    fs.writeFileSync(path.join(чужой, 'README.md'), 'чужое\n', 'utf8');
    await чужойGit.raw(['add', '--', 'README.md']);
    await чужойGit.raw(['commit', '-m', 'чужое']);
    await чужойGit.raw(['push', 'origin', 'main']);

    expect((await закреплённаяОснова({git, settings: настройки})).ошибка).toBe('ветвиРазошлись');
    // Рабочий файл человека чужой публикацией не тронут.
    expect(fs.readFileSync(path.join(repo, RU), 'utf8')).toBe(СТАТЬЯ);
  });

  it('не та ветка — отказ до всякого вопроса серверу', async () => {
    const {git} = await среда();
    await git.raw(['checkout', '-b', 'другая']);

    expect((await закреплённаяОснова({git, settings: настройки})).ошибка).toBe('неТаВетка');
  });

  it('удалённой ветки не спросить — отказ, а не подмена головой', async () => {
    const {git} = await среда();
    const итог = await закреплённаяОснова({
      git,
      settings: {...настройки, отправка: {...настройки['отправка'], удалённый: 'нетТакого'}},
    });

    expect(итог.ошибка).toBe('удалённыйНеизвестен');
    expect(итог.основа).toBe(undefined);
  });
});
