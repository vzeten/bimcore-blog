// Запуск и остановка экземпляра: единственное место, где панель трогает процессы Windows.
// Правила «можно ли» живут в `instanceControl.mjs`; здесь только сам разговор с системой
// (SPEC 4.3, 4.7).
//
// Два свойства здесь обязательны и объясняют весь файл. Первое: обычное управление идёт без
// чёрных окон, поэтому экземпляр поднимается скрытым отдельным процессом, а его слова уходят не в
// консоль, а в файл рядом с памятью панели — оттуда их видно, даже когда сервер отказался
// стартовать. Второе: завершается только тот номер процесса, который система назвала владельцем
// нужного порта и командная строка которого — запуск названной сервером папки кода.

import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

import {ПАПКА_ВЛАДЕЛЬЦА} from '../core/materialRoot.mjs';
import {ПЕРЕКЛЮЧАТЕЛЬ, ПОРТ_ЗАПУСКА} from './materialSource.mjs';
import {ДОМ_ПАНЕЛИ} from './instanceProbe.mjs';

/** Сколько последних строк слов сервера показывать человеку, если экземпляр не поднялся. */
const СТРОК_ОТЧЁТА = 12;

/** Куда уходят слова запущенного экземпляра: свой файл на каждый порт. */
export const журнал = (порт) => path.join(ДОМ_ПАНЕЛИ, `${порт}.log`);

/**
 * Поднять экземпляр скрытым процессом. Чужой корень материалов называется переключателем только
 * когда он действительно чужой: забытая переменная среды увела бы обычное окно на чужое дерево
 * молча (SPEC 7.1.3).
 */
export function поднять({порт, код, материалы}) {
  fs.mkdirSync(ДОМ_ПАНЕЛИ, {recursive: true});
  const файл = журнал(порт);
  const поток = fs.openSync(файл, 'w');

  const среда = {...process.env};
  delete среда[ПЕРЕКЛЮЧАТЕЛЬ];
  delete среда[ПОРТ_ЗАПУСКА];
  const чужиеМатериалы = материалы.split('\\').join('/').replace(/\/+$/, '').toLowerCase()
    !== ПАПКА_ВЛАДЕЛЬЦА.toLowerCase();
  if (чужиеМатериалы) среда[ПЕРЕКЛЮЧАТЕЛЬ] = материалы;
  // Порт называется всегда, включая `4780`. Заявка на него — не обход правила, а его проверка:
  // принятый код получит свой номер, а любой другой откажется стартовать понятными словами
  // (SPEC 7.1.6). Молчаливая заявка дала бы непринятой копии невнятное «назовите свой порт».
  среда[ПОРТ_ЗАПУСКА] = String(порт);

  const дитя = spawn(process.execPath, [path.join(код, 'server.mjs')], {
    cwd: код, env: среда, detached: true, windowsHide: true, stdio: ['ignore', поток, поток],
  });
  дитя.unref();

  return {номер: дитя.pid ?? null, журнал: файл};
}

/** Последние слова экземпляра из его файла: ими объясняется отказ подняться. */
export function словаЗапуска(порт) {
  try {
    return fs.readFileSync(журнал(порт), 'utf8').trim().split(/\r?\n/).slice(-СТРОК_ОТЧЁТА).join('\n');
  } catch {
    return '';
  }
}

/**
 * Кто держит порт: номер процесса и его командная строка. Спрашивается у самой системы, а не у
 * сервера: слово `accepted` в ответе напишет кто угодно, а владелец слушающего сокета — факт.
 * Ничего не найдено или PowerShell не ответил — `null`, и остановка не разрешается.
 */
export async function владелецПорта(порт, запустить = powershell) {
  const скрипт = [
    '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;',
    `$c = Get-NetTCPConnection -LocalPort ${Number(порт)} -State Listen -ErrorAction SilentlyContinue |`,
    'Select-Object -First 1;',
    'if (-not $c) { "{}"; exit 0 };',
    '$p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue;',
    '[pscustomobject]@{pid=[int]$c.OwningProcess; cmd=[string]$p.CommandLine} | ConvertTo-Json -Compress',
  ].join(' ');

  let вывод;
  try {
    вывод = await запустить(скрипт);
  } catch (error) {
    console.error(error);
    return null;
  }

  let разобрано;
  try {
    разобрано = JSON.parse(вывод.trim() || '{}');
  } catch {
    return null;
  }

  if (!Number.isInteger(разобрано['pid'])) return null;
  return {номер: разобрано['pid'], командная: разобрано['cmd'] ?? ''};
}

/** Один разговор с PowerShell без окна. Отдельной дверью, чтобы правило можно было проверить. */
function powershell(скрипт) {
  return new Promise((готово, беда) => {
    const дитя = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', скрипт], {
      windowsHide: true,
    });
    let вывод = '';
    let ошибка = '';
    дитя.stdout.setEncoding('utf8');
    дитя.stdout.on('data', (кусок) => {
      вывод += кусок;
    });
    дитя.stderr.setEncoding('utf8');
    дитя.stderr.on('data', (кусок) => {
      ошибка += кусок;
    });
    дитя.on('error', беда);
    дитя.on('close', (код) => (код === 0 ? готово(вывод) : беда(new Error(ошибка || `powershell: ${код}`))));
  });
}

/**
 * Завершить названный номер процесса. Решение о том, можно ли, принято до вызова и здесь не
 * повторяется: этот файл умеет только выполнить его. Процесс уже исчез сам — это успех, а не
 * беда: цель была в том, чтобы его не стало.
 */
export function завершить(номер) {
  try {
    process.kill(номер);
    return true;
  } catch (error) {
    if (error && error.code === 'ESRCH') return true;
    console.error(error);
    return false;
  }
}
