// Медиаподготовка: запуск ЕДИНСТВЕННОГО алгоритма сайта — `scripts/image-prep.py` (решение владельца
// 2026-09-06). Скрипт правит файлы в названной папке, поэтому байты кладутся во временную папку
// редактора под именами, которые он понимает (`img-N`), и результат читается обратно; папка статьи
// ему не видна. Процесс дочерний и асинхронный: сервер отвечает окну, пока Pillow работает.

import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {ApiError} from './httpBody.mjs';

/** `подготовить(набор)` принимает `[{байты, род}]`, отдаёт `[{байты}]` в том же порядке. */
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
        await new Promise((resolve, reject) => execFile(
          команда['python'], [path.join(repo, команда['скрипт']), папка],
          {timeout: команда['пределСекунд'] * 1000, windowsHide: true},
          (ошибка, stdout, stderr) => (ошибка ? reject(new Error(`${ошибка.message}\n${stderr ?? ''}`)) : resolve(stdout)),
        ));
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
