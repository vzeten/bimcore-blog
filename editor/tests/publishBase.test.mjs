// Имя каждого теста повторяет формулировку правила.
// Закреплённая основа публикации: план обещает, чем станет САЙТ, поэтому основа берётся у сервера,
// а `HEAD`, ветка и местная `main` подменой не служат. Проверяется на НАСТОЯЩЕМ git с настоящим
// удалённым репозиторием: подставной здесь не доказал бы ничего — весь смысл в вопросе к серверу.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {simpleGit} from 'simple-git';

import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {RU, СТАТЬЯ, наСервере, настройкиСервера, среда, убратьПесочницы} from './publishHarness.mjs';

import {закреплённаяОснова} from '../src/adapters/publishBase.mjs';

// Проверки идут на настоящем git: пять секунд по умолчанию им мало, особенно когда весь набор идёт
// разом. Предел общий с остальными git-проверками программы, а не свой.
vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

afterEach(() => убратьПесочницы());

const настройки = настройкиСервера();

/** Кто-то другой толкнул в ветку сайта, пока человек работал. Возвращает SHA чужого коммита. */
async function чужаяРаботаНаСервере(место) {
  const чужой = path.join(место.корень, 'чужой');
  await simpleGit(место.корень).raw(['clone', место.сервер, чужой]);
  const другой = simpleGit(чужой);
  await другой.addConfig('user.name', 'Другой');
  await другой.addConfig('user.email', 'drugoy@example.com');
  await другой.addConfig('commit.gpgsign', 'false');
  fs.writeFileSync(path.join(чужой, 'README.md'), 'чужое\n', 'utf8');
  await другой.raw(['add', '--', 'README.md']);
  await другой.raw(['commit', '-m', 'чужое']);
  await другой.raw(['push', 'origin', 'main']);

  return (await другой.raw(['rev-parse', 'HEAD'])).trim();
}

describe('закреплённая основа', () => {
  it('основа — свежий SHA опубликованной ветки на сервере, и ничего кроме него', async () => {
    const место = await среда();
    const итог = await закреплённаяОснова({git: место.git, settings: настройки});

    expect(итог.ошибка).toBe(undefined);
    expect(итог.основа).toBe(await наСервере(место));
    expect(итог.основа).toMatch(/^[0-9a-f]{40}$/);
    expect(итог.голова).toBeUndefined();
  });

  it('человек на своей рабочей ветке — основа та же: ветка и HEAD не спрашиваются', async () => {
    const место = await среда(undefined, {ветка: 'feature/proba'});
    место.положить('editor/src/что-то.mjs', 'работа над программой\n');
    await место.git.raw(['add', '--', 'editor/src/что-то.mjs']);
    await место.git.raw(['commit', '-m', 'своя работа']);

    const итог = await закреплённаяОснова({git: место.git, settings: настройки});

    expect(итог.ошибка).toBe(undefined);
    expect(итог.основа).toBe(место.основа);
  });

  it('местный коммит в main, не уехавший на сайт, основу не сдвигает: основа — сервер', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Ещё строка.\n`);
    await место.git.raw(['add', '--', RU]);
    await место.git.raw(['commit', '-m', 'правка']);

    const итог = await закреплённаяОснова({git: место.git, settings: настройки});

    expect(итог.основа).toBe(место.основа);
    expect(итог.основа).not.toBe((await место.git.raw(['rev-parse', 'HEAD'])).trim());
  });

  it('на сервере появилась чужая работа — основой становится она, рабочий файл человека не тронут', async () => {
    const место = await среда();
    const чужой = await чужаяРаботаНаСервере(место);

    const итог = await закреплённаяОснова({git: место.git, settings: настройки});

    expect(итог.основа).toBe(чужой);
    expect(fs.readFileSync(path.join(место.repo, RU), 'utf8')).toBe(СТАТЬЯ);
    expect((await место.git.raw(['rev-parse', 'HEAD'])).trim()).toBe(место.основа);
  });

  it('удалённой ветки не спросить — отказ, а не подмена головой', async () => {
    const место = await среда();
    const итог = await закреплённаяОснова({
      git: место.git,
      settings: {...настройки, отправка: {...настройки['отправка'], удалённый: 'нетТакого'}},
    });

    expect(итог.ошибка).toBe('удалённыйНеизвестен');
    expect(итог.основа).toBe(undefined);
  });
});
