// Настоящие корневые зависимости для временного репозитория проверок. Правил здесь нет.
//
// Ранняя проверка зависимостей (`src/adapters/rootDeps.mjs`) не пускает сборку в корень, где их
// нет. Для проверок это работа, а не помеха: без такой заготовки каждая проверка сборки упиралась
// бы в отказ. Живёт отдельным файлом, чтобы обвязки не заводили по своей копии одного и того же.

import fs from 'node:fs';
import path from 'node:path';

/** Версия сборщика для проверок. Совпадать с настоящей необязательно: сверяется сама сверка. */
const ВЕРСИЯ = '3.10.1';

/**
 * Объявить и «установить» зависимости во временном репозитории.
 *
 * Зовётся ПОСЛЕ коммита основы: в опубликованной ветке сайта зависимостей не бывает, и попав в
 * коммит, они изменили бы состав плана в каждой проверке.
 */
export function поставитьЗависимости(repo, версия = ВЕРСИЯ) {
  fs.writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({dependencies: {'@docusaurus/core': версия}}),
    'utf8',
  );

  const пакет = path.join(repo, 'node_modules', '@docusaurus', 'core');
  fs.mkdirSync(path.join(пакет, 'bin'), {recursive: true});
  fs.writeFileSync(path.join(пакет, 'package.json'), JSON.stringify({version: версия}), 'utf8');
  fs.writeFileSync(path.join(пакет, 'bin', 'docusaurus.mjs'), '// сборщик\n', 'utf8');
}
