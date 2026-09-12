// Имя каждого теста повторяет формулировку правила.
// Уборка временной рабочей копии не может утащить за собой чужой каталог. Проверяется на НАСТОЯЩЕМ
// git и настоящих связях файловой системы: подставные здесь не доказали бы ничего — весь вопрос
// именно в том, как ведут себя система и git на живом соединении каталогов.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {simpleGit} from 'simple-git';

import {найтиСсылки, разорвать, убратьКопию} from '../src/adapters/safeRemove.mjs';

/** Предел ожидания настоящего git, общий для git-проверок программы: пяти секунд им мало. */
const ЖДАТЬ_GIT = 30_000;

const наWindows = process.platform === 'win32';
/** Соединение каталогов на Windows и обычная ссылка на каталог в прочих системах. */
const видСвязи = () => (наWindows ? 'junction' : 'dir');

const песочницы = [];

afterEach(async () => {
  while (песочницы.length > 0) {
    const корень = песочницы.pop();
    // Свои связи снимаем сами: рекурсивное удаление песочницы не должно уйти по ним наружу.
    const найдено = найтиСсылки(корень);
    for (const связь of найдено.ссылки ?? []) {
      try {
        fs.rmdirSync(связь);
      } catch {
        try {
          fs.unlinkSync(связь);
        } catch {
          // Не сняли — тогда и рекурсивно не удаляем: пусть останется, это безопаснее.
        }
      }
    }
    if ((найдено.ссылки ?? []).length === 0 || найтиСсылки(корень).ссылки?.length === 0) {
      fs.rmSync(корень, {recursive: true, force: true});
    }
  }
});

/** Репозиторий с одной рабочей копией и отдельным внешним каталогом «настоящих зависимостей». */
async function среда() {
  const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-remove-'));
  песочницы.push(корень);

  const repo = path.join(корень, 'работа');
  fs.mkdirSync(repo, {recursive: true});

  const git = simpleGit(repo);
  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Проверка');
  await git.addConfig('user.email', 'proverka@example.com');
  await git.addConfig('commit.gpgsign', 'false');
  fs.writeFileSync(path.join(repo, 'файл.md'), 'начало\n', 'utf8');
  await git.raw(['add', '--', 'файл.md']);
  await git.raw(['commit', '-m', 'начало']);

  // Внешнее дерево: то самое, что однажды было вычищено уборкой рабочей копии.
  const снаружи = path.join(корень, 'настоящие-зависимости');
  fs.mkdirSync(path.join(снаружи, 'пакет'), {recursive: true});
  fs.writeFileSync(path.join(снаружи, 'пакет', 'файл'), 'дорогое содержимое\n', 'utf8');

  const копия = path.join(корень, 'копия');
  await git.raw(['worktree', 'add', '--detach', '--force', копия, 'HEAD']);

  return {корень, repo, git, снаружи, копия};
}

describe('уборка временной рабочей копии', () => {
  it.runIf(наWindows)(
    'соединение каталогов внутри копии снимается, а внешний каталог и его файлы целы',
    {timeout: ЖДАТЬ_GIT},
    async () => {
      const {repo, git, снаружи, копия, корень} = await среда();
      fs.symlinkSync(снаружи, path.join(копия, 'node_modules'), видСвязи());

      const итог = await убратьКопию({git, путь: копия, корни: [корень, repo]});

      expect(итог.ошибка).toBe(undefined);
      expect(итог.убрана).toBe(true);
      expect(fs.existsSync(копия)).toBe(false);
      // Главное свойство: внешнее дерево целиком на месте, до последнего байта.
      expect(fs.readFileSync(path.join(снаружи, 'пакет', 'файл'), 'utf8')).toBe('дорогое содержимое\n');
      expect(await git.raw(['worktree', 'list'])).not.toContain(копия);
    },
  );

  it.runIf(наWindows)(
    'путь, который сам является соединением каталогов, к уборке не принимается вовсе',
    {timeout: ЖДАТЬ_GIT},
    async () => {
      const {repo, git, снаружи, корень} = await среда();
      const ложнаяКопия = path.join(корень, 'похожая-на-копию');
      fs.symlinkSync(снаружи, ложнаяКопия, видСвязи());

      const итог = await убратьКопию({git, путь: ложнаяКопия, корни: [корень, repo]});

      expect(итог.ошибка).toBe('копияСсылка');
      expect(fs.readFileSync(path.join(снаружи, 'пакет', 'файл'), 'utf8')).toBe('дорогое содержимое\n');
      fs.rmdirSync(ложнаяКопия);
    },
  );

  it('обход дерева не спускается внутрь связи и называет саму связь', {timeout: ЖДАТЬ_GIT}, async () => {
    const {снаружи, копия} = await среда();
    const связь = path.join(копия, 'node_modules');
    fs.symlinkSync(снаружи, связь, видСвязи());

    const найдено = найтиСсылки(копия);

    expect(найдено.ссылки).toContain(связь);
    // Ни одного пути ИЗ чужого дерева: обход по связи внутрь не заходил.
    expect(найдено.ссылки.some((путь) => путь.includes(`node_modules${path.sep}пакет`))).toBe(false);
  });

  it('снятая связь не трогает того, на что она смотрела', {timeout: ЖДАТЬ_GIT}, async () => {
    const {снаружи, копия} = await среда();
    const связь = path.join(копия, 'node_modules');
    fs.symlinkSync(снаружи, связь, видСвязи());

    const итог = разорвать(связь);

    expect(итог.ошибка).toBe(undefined);
    expect(fs.existsSync(связь)).toBe(false);
    expect(fs.readFileSync(path.join(снаружи, 'пакет', 'файл'), 'utf8')).toBe('дорогое содержимое\n');
  });

  it('путь вне разрешённых мест не удаляется ни при каком доводе', {timeout: ЖДАТЬ_GIT}, async () => {
    const {repo, git, снаружи} = await среда();

    const итог = await убратьКопию({git, путь: снаружи, корни: [repo]});

    expect(итог.ошибка).toBe('путьНеРазрешён');
    expect(fs.existsSync(path.join(снаружи, 'пакет', 'файл'))).toBe(true);
  });

  it('главная рабочая копия репозитория к уборке не принимается', {timeout: ЖДАТЬ_GIT}, async () => {
    const {repo, git, корень} = await среда();

    const итог = await убратьКопию({git, путь: repo, корни: [корень]});

    expect(итог.ошибка).toBe('этоГлавнаяКопия');
    expect(fs.existsSync(path.join(repo, 'файл.md'))).toBe(true);
  });

  it('каталог, которого git не знает как рабочую копию, не удаляется', {timeout: ЖДАТЬ_GIT}, async () => {
    const {repo, git, корень} = await среда();
    const чужой = path.join(корень, 'просто-папка');
    fs.mkdirSync(чужой, {recursive: true});
    fs.writeFileSync(path.join(чужой, 'файл'), 'чужое\n', 'utf8');

    const итог = await убратьКопию({git, путь: чужой, корни: [корень, repo]});

    expect(итог.ошибка).toBe('копияНеУчтена');
    expect(fs.readFileSync(path.join(чужой, 'файл'), 'utf8')).toBe('чужое\n');
  });

  it('дерево, которое не удалось осмотреть целиком, не удаляется', {timeout: ЖДАТЬ_GIT}, async () => {
    const {корень} = await среда();

    const найдено = найтиСсылки(path.join(корень, 'нет-такой-папки'));

    expect(найдено.ошибка).toBe('обходНеПолон');
    expect(найдено.ссылки).toBe(undefined);
  });
});
