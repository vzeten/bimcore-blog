// Медиаподготовка картинок: запуск ЕДИНСТВЕННОГО алгоритма сайта — `scripts/image-prep.py`.
//
// Своего рецепта у программы нет и быть не должно (решение владельца 2026-09-06): скрипт правит
// файлы в названной папке, поэтому байты кладутся во временную папку редактора под именем, которое
// скрипт понимает (`img-N`), а результат читается обратно. Папка статьи скриптом не видна вовсе.
// Процесс дочерний и асинхронный: сервер отвечает окну, пока Pillow работает.

import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {ApiError} from './httpBody.mjs';

/** Инструменты применения: `подготовить(набор)` принимает `[{байты, род}]`, отдаёт `[{байты}]`. */
export function инструментыМедиа({repo, settings}) {
  const команда = settings['доработка']['команда'];

  return {
    async подготовить(набор) {
      if (набор.length === 0) return [];
      const времянки = path.join(repo, 'editor', '.tmp');
      fs.mkdirSync(времянки, {recursive: true});
      const папка = fs.mkdtempSync(path.join(времянки, 'доработка-'));

      try {
        набор.forEach(({байты, род}, i) => fs.writeFileSync(path.join(папка, `img-${i + 1}.${род}`), байты));
        await запуск(команда['python'], [path.join(repo, команда['скрипт']), папка], команда['пределСекунд'] * 1000);
        return набор.map((_, i) => ({байты: fs.readFileSync(path.join(папка, `img-${i + 1}.png`))}));
      } catch (ошибка) {
        console.error(ошибка);
        throw new ApiError(500, settings['ошибкиСервера']['медиаподготовкаНеУдалась']);
      } finally {
        fs.rmSync(папка, {recursive: true, force: true});
      }
    },
  };
}

function запуск(программа, аргументы, timeout) {
  return new Promise((resolve, reject) => {
    execFile(программа, аргументы, {timeout, windowsHide: true}, (ошибка, stdout, stderr) => {
      if (ошибка) reject(new Error(`${ошибка.message}\n${stderr ?? ''}`));
      else resolve(stdout);
    });
  });
}
