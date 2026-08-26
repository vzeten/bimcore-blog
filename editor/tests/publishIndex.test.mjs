// Имя каждого теста повторяет формулировку правила.
// Индекс человека при публикации: программа не кладёт в него план вовсе, а после сдвига ветки
// освежает только то, что доказанно отстало. Проверяется на НАСТОЯЩЕМ git.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {simpleGit} from 'simple-git';

import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {запомнитьСборку} from '../src/adapters/buildMemory.mjs';
import {прочитатьОчередь} from '../src/adapters/commitQueue.mjs';
import {разницаСИндексом} from '../src/adapters/gitFile.mjs';
import {довестиНезаконченное} from '../src/adapters/publishRepair.mjs';
import {отпустить} from '../src/adapters/publishLock.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {RU, СТАТЬЯ, запрос, сборщик, среда, убратьПесочницы, настройкиСервера} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

afterEach(() => {
  запомнитьСборку(null);
  отпустить();
  убратьПесочницы();
});

const собрать = (место) => запрос(releaseRoute, место, '/api/release/build', {path: RU}, {запуск: сборщик()});
const записать = (место) => запрос(publishRoute, место, '/api/publish/commit', {path: RU, подтверждено: true});
const очередь = (место) => прочитатьОчередь(место.editorDir, настройкиСервера());

// Индекс человека — его работа. Освежать его после сдвига ветки можно только там, где он доказанно
// отстал; всё прочее снимать нельзя, даже если очень похоже.
describe('чужая индексация не снимается', () => {
  it('восстановление после обрыва индекс не трогает вовсе: происхождение из него не выводится', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    await записать(место);

    // После записи человек правит ту же статью и кладёт правку в индекс. Чья это правка, из
    // состояния индекса не выводится вовсе, поэтому восстановление её и не трогает.
    место.положить(RU, `${СТАТЬЯ}Совсем своя строка.\n`);
    await место.git.raw(['add', '--', RU]);
    const своё = await место.git.raw(['--literal-pathspecs', 'ls-files', '-s', '--', RU]);

    await довестиНезаконченное({
      git: место.git, repo: место.repo, editorDir: место.editorDir, settings: настройкиСервера(),
    });

    expect(await место.git.raw(['--literal-pathspecs', 'ls-files', '-s', '--', RU])).toBe(своё);
  });

  it('индексированный возврат ровно к основе тоже не трогается', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    await записать(место);

    // Человек намеренно кладёт в индекс отмену опубликованной правки. Состояние индекса при этом
    // совпадает с основой — то есть выглядит ровно как наш отставший, а работа за ним чужая.
    место.положить(RU, СТАТЬЯ);
    await место.git.raw(['add', '--', RU]);
    const своё = await место.git.raw(['--literal-pathspecs', 'ls-files', '-s', '--', RU]);

    await довестиНезаконченное({
      git: место.git, repo: место.repo, editorDir: место.editorDir, settings: настройкиСервера(),
    });

    expect(await место.git.raw(['--literal-pathspecs', 'ls-files', '-s', '--', RU])).toBe(своё);
    expect(await разницаСИндексом(место.git, 'HEAD')).toEqual([RU]);
  });

  it('индекс отстал после сдвига ветки — он освежается, и дерево становится чистым', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    await записать(место);

    expect((await место.git.raw(['status', '--porcelain'])).trim()).toBe('');
  });
});

describe('git не смог ответить', () => {
  it('положение коммита неизвестно — очередь не трогается вовсе', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    await записать(место);
    const было = очередь(место).записи;

    // Дверь к git, которая отвечает на всё, кроме вопроса о положении коммита.
    const немой = {
      raw: async (аргументы) => {
        if (аргументы.includes('merge-base')) throw new Error('git молчит');
        return место.git.raw(аргументы);
      },
    };

    const итог = await довестиНезаконченное({
      git: немой, repo: место.repo, editorDir: место.editorDir, settings: настройкиСервера(),
    });

    expect(итог.ошибка).toBe('состояниеНеизвестно');
    expect(очередь(место).записи).toEqual(было);
  });
});

// Собственный признак на сервере ловит только второй запрос этой же программы. Команда, набранная
// человеком в терминале, его не видит — значит проверка и замена индекса обязаны идти под замком
// самого git.
describe('замена индекса под замком git', () => {
  it('внешняя индексация в этот миг не проходит вовсе, а индекс остаётся ожидаемым', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);

    // Дверь к git, которая ровно в миг замены пытается сделать то же, что человек в терминале.
    let внешняя = null;
    const сГонкой = {
      raw: async (аргументы) => {
        // `diff-index` — сверка индекса, и идёт она уже ПОД замком: ровно тот миг, в который
        // посторонняя команда и могла бы вклиниться.
        if (аргументы.includes('diff-index') && внешняя === null) {
          try {
            await simpleGit(место.repo).raw(['add', '--', RU]);
            внешняя = 'прошла';
          } catch {
            внешняя = 'не прошла';
          }
        }

        return место.git.raw(аргументы);
      },
    };

    const {status} = await запрос(
      publishRoute,
      {...место, git: сГонкой},
      '/api/publish/commit',
      {path: RU, подтверждено: true},
    );

    expect(status).toBe(200);
    // Замок git не пустил постороннюю индексацию: снимать было нечего.
    expect(внешняя).toBe('не прошла');
    expect((await место.git.raw(['status', '--porcelain'])).trim()).toBe('');
  });

  it('индекс уже занят другим git — замена не делается, и индекс не трогается', async () => {
    const место = await среда();
    место.положить(RU, `${СТАТЬЯ}Новая строка.\n`);
    await собрать(место);
    const замок = path.join(место.repo, '.git', 'index.lock');
    fs.writeFileSync(замок, '', 'utf8');

    const {status, payload} = await записать(место);
    fs.rmSync(замок, {force: true});

    // Запись состоялась, а индекс не тронут: программа честно называет путь, который не свела.
    expect(status).toBe(200);
    expect(payload.невосстановленные).toContain('?');
  });
});
