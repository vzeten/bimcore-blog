// Имя каждого теста повторяет формулировку правила.
// Своими зависимости считаются только тогда, когда они физически лежат в самом проекте. Проверяется
// на настоящих папках и настоящих связях: весь вопрос в том, что скажет файловая система.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {проверитьЗависимости, средаБезNODE_PATH} from '../src/adapters/rootDeps.mjs';
import {собратьСайт} from '../src/adapters/siteBuild.mjs';

const наWindows = process.platform === 'win32';
const видСвязи = () => (наWindows ? 'junction' : 'dir');

const песочницы = [];

afterEach(() => {
  while (песочницы.length > 0) {
    const корень = песочницы.pop();
    // Связи снимаются до удаления: рекурсия по ним ушла бы в соседнее дерево песочницы.
    for (const имя of ['node_modules']) {
      const путь = path.join(корень, 'проект', имя);
      try {
        if (fs.lstatSync(путь).isSymbolicLink()) fs.rmdirSync(путь);
      } catch {
        // Нет связи — нечего снимать.
      }
    }
    fs.rmSync(корень, {recursive: true, force: true});
  }
});

/** Корень проекта: `package.json` с объявленными зависимостями и, по желанию, установленные пакеты. */
function проект({объявлено = {'@docusaurus/core': '3.10.1', 'clsx': '^2.0.0'}, ставить = true, версия = '3.10.1'} = {}) {
  const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-deps-'));
  песочницы.push(корень);

  const проектПуть = path.join(корень, 'проект');
  fs.mkdirSync(проектПуть, {recursive: true});
  fs.writeFileSync(path.join(проектПуть, 'package.json'), JSON.stringify({dependencies: объявлено}), 'utf8');

  if (ставить) {
    for (const имя of Object.keys(объявлено)) {
      const папка = path.join(проектПуть, 'node_modules', ...имя.split('/'));
      fs.mkdirSync(папка, {recursive: true});
      const своя = имя === '@docusaurus/core' ? версия : '9.9.9';
      fs.writeFileSync(path.join(папка, 'package.json'), JSON.stringify({name: имя, version: своя}), 'utf8');
    }
    const bin = path.join(проектПуть, 'node_modules', '@docusaurus', 'core', 'bin');
    fs.mkdirSync(bin, {recursive: true});
    fs.writeFileSync(path.join(bin, 'docusaurus.mjs'), '// сборщик\n', 'utf8');
  }

  return {корень, проект: проектПуть};
}

describe('корневые зависимости проекта', () => {
  it('установленные свои зависимости и тот самый сборщик признаются годными', () => {
    const {проект: корень} = проект();

    expect(проверитьЗависимости(корень)).toEqual({версия: '3.10.1'});
  });

  it('пустая папка зависимостей означает «их нет», а не «они есть»', () => {
    const {проект: корень} = проект({ставить: false});
    fs.mkdirSync(path.join(корень, 'node_modules'));

    expect(проверитьЗависимости(корень).ошибка).toBe('зависимостейНет');
  });

  it('отсутствующая папка зависимостей — понятный отказ до всякой сборки', () => {
    const {проект: корень} = проект({ставить: false});

    expect(проверитьЗависимости(корень).ошибка).toBe('зависимостейНет');
  });

  it.runIf(наWindows)('папка зависимостей, оказавшаяся связью на чужое дерево, не принимается', () => {
    const {корень, проект: свой} = проект({ставить: false});
    const чужие = path.join(корень, 'чужие', 'node_modules', 'clsx');
    fs.mkdirSync(чужие, {recursive: true});
    fs.writeFileSync(path.join(чужие, 'package.json'), '{"version":"2.1.1"}', 'utf8');
    fs.symlinkSync(path.join(корень, 'чужие', 'node_modules'), path.join(свой, 'node_modules'), видСвязи());

    expect(проверитьЗависимости(свой).ошибка).toBe('зависимостиСсылка');
  });

  it('объявленная зависимость, которой нет на месте, делает проверку красной и называет её', () => {
    const {проект: корень} = проект();
    fs.rmSync(path.join(корень, 'node_modules', 'clsx'), {recursive: true, force: true});

    const итог = проверитьЗависимости(корень);

    expect(итог.ошибка).toBe('зависимостиНеполны');
    expect(итог.подробность).toContain('clsx');
  });

  it('другая версия сборщика сайта годной не считается', () => {
    const {проект: корень} = проект({версия: '3.9.0'});

    const итог = проверитьЗависимости(корень);

    expect(итог.ошибка).toBe('сборщикНеТот');
    expect(итог.подробность).toContain('3.9.0');
  });

  it('папка без package.json корнем проекта не считается', () => {
    const {корень} = проект({ставить: false});

    expect(проверитьЗависимости(корень).ошибка).toBe('нетКорня');
  });

  it('NODE_PATH не передаётся дочерней сборке ни в каком написании', () => {
    const чистая = средаБезNODE_PATH({PATH: 'нужное', NODE_PATH: 'чужое', Node_Path: 'тоже чужое'});

    expect(чистая).toEqual({PATH: 'нужное'});
  });
});

describe('сборка сайта без своих зависимостей', () => {
  it('без своих зависимостей сборщик не запускается вовсе, а отказ называет причину', async () => {
    const {проект: корень} = проект({ставить: false});
    let звали = false;

    const итог = await собратьСайт({
      repo: корень,
      пределМинут: 1,
      запуск: () => {
        звали = true;
        return {on: () => {}};
      },
    });

    expect(звали).toBe(false);
    expect(итог.зелёная).toBe(false);
    expect(итог.зависимости.ошибка).toBe('зависимостейНет');
  });

  it('сборщик берётся из названного корня зависимостей, а не из собираемого дерева', async () => {
    const {корень, проект: свой} = проект();
    const копия = path.join(корень, 'копия');
    fs.mkdirSync(копия, {recursive: true});
    let аргументы = null;

    await собратьСайт({
      repo: копия,
      кореньЗависимостей: свой,
      пределМинут: 1,
      запуск: (файл, доводы, настройки, готово) => {
        аргументы = {доводы, cwd: настройки.cwd, среда: настройки.env};
        готово(null, 'собрано', '');
        return {on: () => {}};
      },
    });

    expect(аргументы.cwd).toBe(копия);
    expect(аргументы.доводы[0].startsWith(свой)).toBe(true);
    expect('NODE_PATH' in аргументы.среда).toBe(false);
  });
});
