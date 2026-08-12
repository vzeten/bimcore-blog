// Карта модулей MAP.md не врёт: каждый файл кода в ней есть, несуществующих файлов в ней нет.
// Структурный тест-предохранитель (SPEC 5.2.1): поведение здесь проверять нечем, правило — про полноту карты.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const карта = fs.readFileSync(path.join(EDITOR, 'MAP.md'), 'utf8');

/** Код программы и команд по определению SPEC 4.9, кроме тестов: их перечень — вывод `editor:test`. */
function кодовые(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) кодовые(full, out);
    else if (/\.(mjs|ts|tsx|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('карта модулей', () => {
  // Папка команд входит сюда наравне с `src`: определение кода в SPEC 4.9 у обеих машинных
  // проверок одно, и разойдись они — третий файл команды завёлся бы без строки в карте.
  const файлы = [
    ...кодовые(path.join(EDITOR, 'src')),
    ...кодовые(path.join(EDITOR, 'scripts')),
    path.join(EDITOR, 'server.mjs'),
  ].map((file) => path.relative(EDITOR, file).split(path.sep).join('/'));

  for (const файл of файлы) {
    it(`файл кода имеет свою строку-запись в карте модулей: ${файл}`, () => {
      // Именно запись карты (строка списка, начинающаяся с имени файла), а не любое упоминание:
      // упоминание во вторичной ссылке («правила — в …») не заменяет собственную строку.
      const запись = new RegExp('^- `' + файл.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`', 'm');
      expect(запись.test(карта)).toBe(true);
    });
  }

  it('карта модулей не указывает на несуществующие файлы', () => {
    const упомянутые = [...карта.matchAll(/`([^`\n]+\.(?:mjs|ts|tsx|css))`/g)]
      .map((m) => m[1])
      .filter((p) => p === 'server.mjs' || p.startsWith('src/') || p.startsWith('scripts/'));
    const мёртвые = упомянутые.filter((p) => !fs.existsSync(path.join(EDITOR, p)));

    expect(мёртвые).toEqual([]);
  });
});
