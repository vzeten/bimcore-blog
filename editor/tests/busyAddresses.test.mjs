// Имя каждого теста повторяет формулировку правила.
//
// Занят ли новый адрес статьи другой статьёй (условие контролёра Codex 2026-09-19): занятый адрес
// уборка ссылок не трогает, и любой сбой чтения делает адрес занятым — незнание не выдаётся за
// «свободен». Настоящий git во временном репозитории; сбои подставляются в одну команду.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {занятыеАдреса} from '../src/adapters/busyAddresses.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {EN, RU, ES, СТАТЬЯ, настройкиСервера, среда, убратьПесочницы} from './publishHarness.mjs';

afterEach(() => {
  vi.restoreAllMocks();
  убратьПесочницы();
});

vi.setConfig({testTimeout: ЖДАТЬ_GIT});

// Путь и адрес у чужой статьи разные: пустая шапка вместо непрочитанной дала бы ей адрес по пути.
const ДРУГАЯ = 'docs/lessons/zzz/index.mdx';
const другая = '---\ntitle: "Другая"\nslug: /lessons/other\ndescription: "Другая."\n---\n\nТекст.\n';
const ФАЙЛЫ = {[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ, [ДРУГАЯ]: другая};
const СВОИ = new Set([RU, EN, ES]);
const ИСКОМЫЕ = ['/lessons/other', '/lessons/free'];

/** Git, у которого одна команда отвечает сбоем, а остальные идут в настоящий репозиторий. */
const сбойныйGit = (git, команда) => new Proxy(git, {get(цель, ключ) {
  if (ключ !== 'raw') return typeof цель[ключ] === 'function' ? цель[ключ].bind(цель) : цель[ключ];
  return async (аргументы) => {
    if (аргументы.includes(команда)) throw new Error(`сбой ${команда}`);
    return цель.raw(аргументы);
  };
}});

describe('занят ли адрес другой статьёй', () => {
  it('адрес чужой статьи занят, ничей — свободен', async () => {
    const место = await среда(ФАЙЛЫ);

    const занятые = await занятыеАдреса({git: место.git, repo: место.repo, settings: настройкиСервера(), основа: место.основа, кроме: СВОИ, адреса: ИСКОМЫЕ});

    expect([...занятые]).toEqual(['/lessons/other']);
  });

  it('шапки основы не прочитались (git grep) — заняты все', async () => {
    const место = await среда(ФАЙЛЫ);
    // Чужая статья есть только на сайте: на диске её уже нет, судить можно только по основе.
    fs.rmSync(path.join(место.repo, ДРУГАЯ));
    const git = сбойныйGit(место.git, 'grep');

    const занятые = await занятыеАдреса({git, repo: место.repo, settings: настройкиСервера(), основа: место.основа, кроме: СВОИ, адреса: ИСКОМЫЕ});

    expect([...занятые].sort()).toEqual([...ИСКОМЫЕ].sort());
  });

  it('перечень основы не прочитался (ls-tree) — заняты все', async () => {
    const место = await среда(ФАЙЛЫ);
    // Чужая статья есть только на сайте: на диске её уже нет, судить можно только по основе.
    fs.rmSync(path.join(место.repo, ДРУГАЯ));
    const git = сбойныйGit(место.git, 'ls-tree');

    const занятые = await занятыеАдреса({git, repo: место.repo, settings: настройкиСервера(), основа: место.основа, кроме: СВОИ, адреса: ИСКОМЫЕ});

    expect([...занятые].sort()).toEqual([...ИСКОМЫЕ].sort());
  });

  it('файл статьи на диске не прочитался — заняты все, даже без основы', async () => {
    const место = await среда(ФАЙЛЫ);
    const настоящее = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((файл, ...прочее) => {
      if (String(файл).replace(/\\/g, '/').endsWith(ДРУГАЯ)) throw new Error('сбой чтения');
      return настоящее(файл, ...прочее);
    });

    const занятые = await занятыеАдреса({git: место.git, repo: место.repo, settings: настройкиСервера(), основа: null, кроме: СВОИ, адреса: ИСКОМЫЕ});

    expect([...занятые].sort()).toEqual([...ИСКОМЫЕ].sort());
  });
});
