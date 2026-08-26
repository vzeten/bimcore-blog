// Имя каждого теста повторяет формулировку правила.
// Раскладка байтов плана по временной копии: единственное место, где программа пишет файлы за
// пределами репозитория, и потому единственное, откуда она может написать не туда.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {настоящееМестоВнутри, разложить} from '../src/adapters/planBuild.mjs';

const песочницы = [];

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

// Соединение каталогов внутри копии — единственный способ увести запись наружу, не написав в пути
// ни одного `..`. Проверяется на настоящем соединении: рассуждением такое не доказывается.
describe('настоящее место пути', () => {
  it('запись через соединение каталогов наружу не проходит', () => {
    const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-link-'));
    песочницы.push(корень);
    const копия = path.join(корень, 'копия');
    const наружу = path.join(корень, 'наружу');
    fs.mkdirSync(копия);
    fs.mkdirSync(наружу);
    fs.symlinkSync(наружу, path.join(копия, 'мимо'), process.platform === 'win32' ? 'junction' : 'dir');

    const настоящий = fs.realpathSync(копия);
    expect(настоящееМестоВнутри(path.join(копия, 'своё', 'файл.mdx'), настоящий)).toBe(false);
    fs.mkdirSync(path.join(копия, 'своё'));
    expect(настоящееМестоВнутри(path.join(копия, 'своё', 'файл.mdx'), настоящий)).toBe(true);
    expect(настоящееМестоВнутри(path.join(копия, 'мимо', 'файл.mdx'), настоящий)).toBe(false);
  });

  it('раскладка отказывается целиком и наружу ничего не пишет', () => {
    const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-link-'));
    песочницы.push(корень);
    const копия = path.join(корень, 'копия');
    const наружу = path.join(корень, 'наружу');
    fs.mkdirSync(копия);
    fs.mkdirSync(наружу);
    fs.symlinkSync(наружу, path.join(копия, 'мимо'), process.platform === 'win32' ? 'junction' : 'dir');

    const итог = разложить(копия, [{
      путь: 'мимо/чужое.mdx', назначение: 'версия', локаль: 'ru', режим: '100644', источник: 'диск',
      байты: Buffer.from('наружу\n', 'utf8'),
    }]);

    expect(итог).toBe(null);
    expect(fs.existsSync(path.join(наружу, 'чужое.mdx'))).toBe(false);
  });
});

// Отказ обязан случиться ДО первой записи на диск. Иначе путь через соединение наружу успевал бы
// создать там папку — и программа оставляла бы мусор в чужом месте, отказавшись только потом.
describe('раскладка не создаёт ничего за пределами копии', () => {
  it('папка по пути через соединение снаружи не появляется', () => {
    const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-link-'));
    песочницы.push(корень);
    const копия = path.join(корень, 'копия');
    const наружу = path.join(корень, 'наружу');
    fs.mkdirSync(копия);
    fs.mkdirSync(наружу);
    fs.symlinkSync(наружу, path.join(копия, 'мимо'), process.platform === 'win32' ? 'junction' : 'dir');

    const итог = разложить(копия, [{
      путь: 'мимо/новая/чужое.mdx', назначение: 'версия', локаль: 'ru', режим: '100644',
      источник: 'диск', байты: Buffer.from('наружу\n', 'utf8'),
    }]);

    expect(итог).toBe(null);
    expect(fs.existsSync(path.join(наружу, 'новая'))).toBe(false);
    expect(fs.readdirSync(наружу)).toEqual([]);
  });

  it('своя новая папка внутри копии создаётся как обычно', () => {
    const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-link-'));
    песочницы.push(корень);
    const копия = path.join(корень, 'копия');
    fs.mkdirSync(копия);

    const итог = разложить(копия, [{
      путь: 'своя/глубже/файл.mdx', назначение: 'версия', локаль: 'ru', режим: '100644',
      источник: 'диск', байты: Buffer.from('текст\n', 'utf8'),
    }]);

    expect(итог).toEqual(['своя/глубже/файл.mdx']);
    expect(fs.readFileSync(path.join(копия, 'своя', 'глубже', 'файл.mdx'), 'utf8')).toBe('текст\n');
  });
});

// Запись без байтов — уход пути с сайта. В копии, из которой считается будущее дерево, такого файла
// быть не должно: иначе сборка проверила бы сайт с файлом, которого там уже не будет.
describe('раскладка убирает пропавшее', () => {
  const убрать = (путь) => ({
    путь, назначение: 'картинка', локаль: 'ru', режим: null, источник: 'удалено', байты: null,
  });

  it('файл копии по такому пути удаляется, а сам путь остаётся в перечне', () => {
    const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-link-'));
    песочницы.push(корень);
    const копия = path.join(корень, 'копия');
    fs.mkdirSync(path.join(копия, 'своя'), {recursive: true});
    fs.writeFileSync(path.join(копия, 'своя', 'cover.png'), 'картинка', 'utf8');

    expect(разложить(копия, [убрать('своя/cover.png')])).toEqual(['своя/cover.png']);
    expect(fs.existsSync(path.join(копия, 'своя', 'cover.png'))).toBe(false);
  });

  it('уход по пути через соединение наружу не проходит и чужого файла не трогает', () => {
    const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-link-'));
    песочницы.push(корень);
    const копия = path.join(корень, 'копия');
    const наружу = path.join(корень, 'наружу');
    fs.mkdirSync(копия);
    fs.mkdirSync(наружу);
    fs.writeFileSync(path.join(наружу, 'чужое.png'), 'чужое', 'utf8');
    fs.symlinkSync(наружу, path.join(копия, 'мимо'), process.platform === 'win32' ? 'junction' : 'dir');

    expect(разложить(копия, [убрать('мимо/чужое.png')])).toBe(null);
    expect(fs.existsSync(path.join(наружу, 'чужое.png'))).toBe(true);
  });

  it('файла по пути уже нет — это не поломка: на сайте его тоже не станет', () => {
    const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-link-'));
    песочницы.push(корень);
    const копия = path.join(корень, 'копия');
    fs.mkdirSync(path.join(копия, 'своя'), {recursive: true});

    expect(разложить(копия, [убрать('своя/cover.png')])).toEqual(['своя/cover.png']);
  });
});
