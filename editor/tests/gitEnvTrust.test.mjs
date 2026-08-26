// Имя каждого теста повторяет формулировку правила.
//
// Ради чего набор заведён: чистка среды git имеет ПРЕДЕЛ, и предел этот обязан быть названным, а не
// подразумеваемым. Часть имён остаётся намеренно — они описывают самого человека: где лежит git и
// где лежат его собственные настройки. Отсюда прямо следует, что задающий среду запуска отправку
// увести может; программа поэтому и обещает узко. Здесь этот предел сторожится и доказывается.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {simpleGit} from 'simple-git';

import {ГРАНИЦА_ДОВЕРИЯ, ЗАПРЕЩЁННЫЕ, дверьGit, средаДляGit} from '../src/adapters/gitEnv.mjs';

const песочницы = [];
const было = new Map();

afterEach(() => {
  for (const [ключ, значение] of было) {
    if (значение === undefined) delete process.env[ключ];
    else process.env[ключ] = значение;
  }
  было.clear();

  while (песочницы.length > 0) {
    try {
      fs.rmSync(песочницы.pop(), {recursive: true, force: true});
    } catch (ошибка) {
      console.error(ошибка);
    }
  }
});

/** Поставить переменную среды на время одной проверки: `afterEach` вернёт прежнее значение. */
function наВремя(ключ, значение) {
  if (!было.has(ключ)) было.set(ключ, process.env[ключ]);
  // Пустое значение и ОТСУТСТВИЕ переменной — разные вещи: git выбирает домашний каталог из пары
  // `HOMEDRIVE`+`HOMEPATH` только когда `HOME` не задан вовсе, а не когда он пуст.
  if (значение === undefined) delete process.env[ключ];
  else process.env[ключ] = значение;
}

/** Репозиторий с одним коммитом: на нём проверяется настоящая дверь программы. */
async function репозиторий(текст = 'текст') {
  const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-gitgran-'));
  песочницы.push(корень);
  const repo = path.join(корень, 'работа');
  fs.mkdirSync(repo, {recursive: true});

  const git = simpleGit(repo);
  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Проверка');
  await git.addConfig('user.email', 'proverka@example.com');
  await git.addConfig('commit.gpgsign', 'false');
  fs.writeFileSync(path.join(repo, 'начало.txt'), `${текст}
`, 'utf8');
  await git.raw(['add', '--', 'начало.txt']);
  await git.raw(['commit', '-m', 'начало']);

  return {корень, repo, git};
}

describe('предел защиты среды git', () => {
  it('граница доверия названа поимённо и молча не растёт', () => {
    // Эти имена остаются НАМЕРЕННО: они описывают не подмену, а самого человека — где лежит git и
    // где лежат его собственные настройки. Перечень назван в коде и сторожится здесь, чтобы к нему
    // нельзя было тихо дописать ещё одно имя «заодно».
    expect(ГРАНИЦА_ДОВЕРИЯ).toEqual([
      'path', 'home', 'homedrive', 'homepath', 'userprofile', 'xdg_config_home',
    ]);
    for (const имя of ГРАНИЦА_ДОВЕРИЯ) expect(ЗАПРЕЩЁННЫЕ).not.toContain(имя);

    const среда = средаДляGit(Object.fromEntries(ГРАНИЦА_ДОВЕРИЯ.map((имя) => [имя.toUpperCase(), 'своё'])));

    expect(Object.keys(среда).map((ключ) => ключ.toLowerCase()).sort()).toEqual([...ГРАНИЦА_ДОВЕРИЯ].sort());
  });

  it('граница доверия настоящая: через профиль человека настройки git и вправду подменяются', async () => {
    // Проверка доказывает НЕ защиту, а её честный предел. Обещание программы звучит узко —
    // «среда не подменяет настройки команды», — и оно обязано быть правдой ровно в этих словах.
    // Кто задаёт среду запуска, тот и так распоряжается программой: через `PATH` он подставит
    // вместо git что угодно, и никакая чистка среды этого уже не решает.
    const {корень, repo} = await репозиторий();
    const профиль = path.join(корень, 'профиль');
    fs.mkdirSync(профиль, {recursive: true});
    fs.writeFileSync(path.join(профиль, '.gitconfig'), '[remote "origin"]\n\tpushurl = https://чужой/\n', 'utf8');

    наВремя('HOME', профиль);
    наВремя('USERPROFILE', профиль);
    const ответ = await дверьGit(repo).raw(['config', '--get', 'remote.origin.pushurl']).catch(() => '');

    // Значение из подставленного профиля дверь ВИДИТ: это и есть названная граница, а не недосмотр.
    expect(ответ.trim()).toBe('https://чужой/');
  });

  it('домашний каталог Windows — это пара HOMEDRIVE и HOMEPATH, и она в границе названа', async () => {
    // На Windows `HOME` обычно пуст вовсе, и git собирает домашний каталог из этой пары. Назови
    // программа только `HOME` — перечень выглядел бы полным, оставаясь дырявым ровно там, где
    // она и работает.
    const {корень, repo} = await репозиторий();
    const профиль = path.join(корень, 'профиль-пары');
    fs.mkdirSync(профиль, {recursive: true});
    fs.writeFileSync(path.join(профиль, '.gitconfig'), '[remote "origin"]\n\tpushurl = https://пара/\n', 'utf8');

    наВремя('HOME', undefined);
    наВремя('HOMEDRIVE', профиль.slice(0, 2));
    наВремя('HOMEPATH', профиль.slice(2));
    // Запасной путь уводится в сторону: настроек там нет, и зелёный ответ докажет именно пару.
    наВремя('USERPROFILE', корень);
    const среда = средаДляGit();
    const ответ = await дверьGit(repo).raw(['config', '--get', 'remote.origin.pushurl']).catch(() => '');

    expect(среда.HOMEDRIVE).toBe(профиль.slice(0, 2));
    expect(среда.HOMEPATH).toBe(профиль.slice(2));
    expect(ответ.trim()).toBe('https://пара/');
  });
});
