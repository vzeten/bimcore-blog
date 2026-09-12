// Имя каждого теста повторяет формулировку правила.
// Ярлык владельца: открывает 4780 только тогда, когда отвечает именно принятый код принятой копии,
// и верит не словам сервера о себе, а тому, что о принятой копии сказал git.
//
// Проверки здесь структурные — предохранители от возврата дефекта (SPEC 5.2.1): поведение
// командного файла тестом не отыграть, оно проверяется живым прогоном ярлыка против подставного
// сервера (доказательства — в handoff операции). Тестом ловится исчезновение самих условий.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {ПАПКА_ПРИНЯТОГО} from '../src/core/runtimeIdentity.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ЯРЛЫК = fs.readFileSync(path.join(EDITOR, 'launcher', 'BIMCORE-Editor.bat'), 'utf8');
const УСТАНОВКА = fs.readFileSync(path.join(EDITOR, 'launcher', 'install.ps1'), 'utf8');

describe('ярлык доверяет git, а не словам сервера о себе', () => {
  it('точная запущенная версия сверяется с коммитом принятой копии, взятым у git', () => {
    // Найденный дефект: ярлык смотрел только на role, accepted, branch и materials, и подставной
    // ответ с чужим коммитом и чужой папкой кода принимался за рабочий редактор.
    expect(ЯРЛЫК).toContain('rev-parse --short HEAD');
    expect(ЯРЛЫК).toContain("$i.commit -eq '%EDITOR_COMMIT%'");
  });

  it('папка запущенного кода сверяется с папкой принятой рабочей копии', () => {
    expect(ЯРЛЫК).toContain("$same $i.code '%EDITOR_DIR%'");
    expect(ЯРЛЫК).toContain("set \"EDITOR_DIR=%EDITOR_WORKTREE%\\editor\"");
    // Та самая папка, что пришпилена в правиле принятости: два разных места разошлись бы молча.
    expect(ЯРЛЫК).toContain(ПАПКА_ПРИНЯТОГО.split('/').slice(0, -1).join('\\').replace('C:\\', 'C:\\'));
  });

  it('признака accepted самого по себе не хватает: рядом обязаны совпасть коммит, папка и чистота', () => {
    for (const условие of [
      "$i.role -eq 'owner'",
      '$i.accepted -eq $true',
      '$i.clean -eq $true',
      "$i.branch -eq 'editor'",
      "$i.commit -eq '%EDITOR_COMMIT%'",
      '[int]$i.port -eq 4780',
    ]) expect(ЯРЛЫК).toContain(условие);
  });

  it('несохранённые правки в принятой копии останавливают запуск до всякого опроса порта', () => {
    expect(ЯРЛЫК).toContain('status --porcelain');
    expect(ЯРЛЫК).toContain('the accepted worktree has uncommitted changes');
  });

  it('чужой или непроверяемый сервер ничего не теряет: ярлык не открывает, не подменяет, не гасит', () => {
    expect(ЯРЛЫК).toContain('Nothing was opened, started or stopped');
    expect(ЯРЛЫК).not.toMatch(/taskkill|Stop-Process/i);
  });
});

describe('новый ярлык включается только тогда, когда это уже безопасно', () => {
  it('установка спрашивает живой ответ работающего сервера, а не строку в исходнике', () => {
    // Найденный дефект: установка искала `/api/identity` в тексте `server.mjs`. Файл на диске
    // бывает уже новым, когда на `4780` работает прежний сервер и отвечает 404. Ярлык, заменённый
    // в этот миг, отказался бы открывать вполне рабочее окно — привычный запуск ломался бы.
    expect(УСТАНОВКА).toContain("$адрес = \"http://localhost:$порт/api/identity\"");
    expect(УСТАНОВКА).toContain('Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 $адрес');
    expect(УСТАНОВКА).not.toContain("Join-Path $кодDir 'server.mjs'");
    expect(УСТАНОВКА).not.toContain("$server -notmatch");
  });

  it('молчание, старый ответ без ручки и мусор вместо опознания — три отдельных отказа', () => {
    expect(УСТАНОВКА).toContain('про себя молчит (код $код)');
    expect(УСТАНОВКА).toContain('никто не отвечает');
    expect(УСТАНОВКА).toContain('не разобрать: это не опознание редактора');
  });

  it('ожидаемая личность берётся у git принятой копии: ветка, короткий коммит и чистота', () => {
    expect(УСТАНОВКА).toContain('branch --show-current');
    expect(УСТАНОВКА).toContain('status --porcelain');
    expect(УСТАНОВКА).toContain('rev-parse --short HEAD');
    expect(УСТАНОВКА).toContain('if ($и.commit -ne $коммит)');
    expect(УСТАНОВКА).toContain('if ($и.branch -ne $ветка)');
  });

  it('установка сверяет тот же набор полей, что и сам ярлык: разойтись им нельзя', () => {
    // Оба места решают один вопрос «это ли мой редактор». Выпади поле в одном из них — ярлык и
    // установка стали бы отвечать по-разному, и подмена прошла бы там, где открывать нельзя.
    for (const [вЯрлыке, вУстановке] of [
      ["$i.role -eq 'owner'", "$и.role -ne 'owner'"],
      ['$i.accepted -eq $true', '$и.accepted -ne $true'],
      ['$i.clean -eq $true', '$и.clean -ne $true'],
      ["$i.branch -eq 'editor'", '$и.branch -ne $ветка'],
      ["$i.commit -eq '%EDITOR_COMMIT%'", '$и.commit -ne $коммит'],
      ['[int]$i.port -eq 4780', '[int]$и.port -ne $порт'],
      ["$same $i.code '%EDITOR_DIR%'", 'ПутьРавен $и.code $кодDir'],
      ["$same $i.materials '%EDITOR_MATERIALS%'", 'ПутьРавен $и.materials $материалы'],
    ]) {
      expect(ЯРЛЫК).toContain(вЯрлыке);
      expect(УСТАНОВКА).toContain(вУстановке);
    }
  });

  it('ни один отказ не трогает ни ярлык, ни его резерв: подмена идёт последней', () => {
    const проба = УСТАНОВКА.indexOf('Invoke-WebRequest');
    const сверка = УСТАНОВКА.indexOf('$несовпадения.Count -gt 0');
    const резерв = УСТАНОВКА.indexOf('Copy-Item -LiteralPath $ярлык -Destination $резерв');
    const подмена = УСТАНОВКА.indexOf('Move-Item -LiteralPath $временный');

    expect(проба).toBeGreaterThan(0);
    expect(сверка).toBeGreaterThan(проба);
    expect(резерв).toBeGreaterThan(сверка);
    expect(подмена).toBeGreaterThan(резерв);
    expect(УСТАНОВКА).toContain('Ничего не изменено: ни ярлык, ни его резерв.');
  });

  it('отказ называет выполнимый порядок: обновить копию, запустить её, проверить, установить', () => {
    for (const шаг of [
      'обновить принятую копию accepted-editor',
      'запустить её прямым способом',
      'проверить, что $адрес отвечает',
      'запустить эту установку снова',
    ]) expect(УСТАНОВКА).toContain(шаг);
  });

  it('прежний ярлык сохраняется, а подмена идёт одним движением, а не записью поверх', () => {
    expect(УСТАНОВКА).toContain('Copy-Item -LiteralPath $ярлык -Destination $резерв');
    expect(УСТАНОВКА).toContain('Move-Item -LiteralPath $временный -Destination $ярлык -Force');
  });

  it('постоянный ярлык владельца не подменяется самой операцией: кандидат лежит в коде', () => {
    expect(fs.existsSync(path.join(EDITOR, 'launcher', 'BIMCORE-Editor.bat'))).toBe(true);
    expect(fs.existsSync(path.join(EDITOR, 'launcher', 'install.bat'))).toBe(true);
  });
});
