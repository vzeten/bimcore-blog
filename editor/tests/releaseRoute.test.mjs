// Имя каждого теста повторяет формулировку правила.
// Ручки предварительного выпуска: план публикации и полная сборка его точной копии. Настоящий
// сборщик не зовётся — он идёт минутами; проверяется то, ЧТО программа делает с его ответом.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {запомнитьСборку, зелёнаяСборка} from '../src/adapters/buildMemory.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {EN, ES, RU, СТАТЬЯ, НАСТРОЙКИ, запрос, сборщик, среда, убратьПесочницы} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

afterEach(() => {
  запомнитьСборку(null);
  убратьПесочницы();
});

const ручка = (место, pathname, тело, запуск) => запрос(releaseRoute, место, pathname, тело, {запуск});

/** Кто-то другой толкнул в ветку сайта, пока человек работал. */
async function чужаяРаботаНаСервере(место) {
  const чужой = path.join(место.корень, 'чужой');
  await место.git.raw(['clone', место.сервер, чужой]);
  const {simpleGit} = await import('simple-git');
  const другой = simpleGit(чужой);
  await другой.addConfig('user.name', 'Другой');
  await другой.addConfig('user.email', 'drugoy@example.com');
  await другой.addConfig('commit.gpgsign', 'false');
  fs.writeFileSync(path.join(чужой, 'ЧУЖОЕ.md'), 'чужое\n', 'utf8');
  await другой.raw(['add', '--', 'ЧУЖОЕ.md']);
  await другой.raw(['commit', '-m', 'чужое']);
  await другой.raw(['push', 'origin', 'main']);
}

describe('план публикации', () => {
  it('уезжает открытая версия, а соседние языки, давно лежащие на сайте, не трогаются', async () => {
    const место = await среда();
    const {взято, status, payload} = await ручка(место, '/api/release', {path: RU});

    expect(взято).toBe(true);
    expect(status).toBe(200);
    expect(payload.файлы.map((файл) => файл.путь)).toEqual([RU]);
    expect(payload.можно).toBe(true);
    expect(payload.отказ).toBe(null);
  });

  it('открыт английский — уезжает английский', async () => {
    const место = await среда();

    expect((await ручка(место, '/api/release', {path: EN})).payload.файлы.map((файл) => файл.путь))
      .toEqual([EN]);
  });

  it('языка нет на сайте — вместе с открытой версией уезжает созданная заглушка', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    const {payload} = await ручка(место, '/api/release', {path: RU});
    const испанская = payload.файлы.find((файл) => файл.путь === ES);

    expect(испанская).toMatchObject({источник: 'создано', локаль: 'es'});
    expect(payload.можно).toBe(true);
  });

  it('начатый человеком перевод соседа в план не входит: уезжает заглушка, а не его работа', async () => {
    const место = await среда(
      {[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: '---\ntitle: "Prueba"\n---\n\nTexto a la mitad.\n'},
      {вКоммите: [RU, EN]},
    );

    const {payload} = await ручка(место, '/api/release', {path: RU});

    expect(payload.файлы.find((файл) => файл.путь === ES).источник).toBe('создано');
    // Файл человека на диске остался нетронутым.
    expect(fs.readFileSync(path.join(место.repo, ES), 'utf8')).toContain('Texto a la mitad');
  });

  it('картинка из папки статьи входит в план, а чужой файл соседнего раздела — нет', async () => {
    const обложка = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/cover.png';
    const место = await среда({
      [RU]: СТАТЬЯ,
      [EN]: СТАТЬЯ,
      [ES]: СТАТЬЯ,
      [обложка]: 'картинка',
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/other/index.mdx': СТАТЬЯ,
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/other/cover.png': 'чужая картинка',
    });

    const пути = (await ручка(место, '/api/release', {path: RU})).payload.файлы.map((файл) => файл.путь);

    expect(пути).toContain(обложка);
    expect(пути.some((путь) => путь.includes('lessons/other'))).toBe(false);
  });

  it('в папке статьи лежит вторая статья — план объявляется недоказанным, выпуск запрещён', async () => {
    const место = await среда({
      [RU]: СТАТЬЯ,
      [EN]: СТАТЬЯ,
      [ES]: СТАТЬЯ,
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/сосед.mdx': СТАТЬЯ,
    });

    const {payload} = await ручка(место, '/api/release', {path: RU});

    expect(payload.можно).toBe(false);
    expect(payload.разрывы[0]).toMatchObject({причина: 'папкаНеОдна'});
  });

  it('картинки во вложенной папке статьи входят в план: молчаливая потеря хуже отказа', async () => {
    const место = await среда({
      [RU]: СТАТЬЯ,
      [EN]: СТАТЬЯ,
      [ES]: СТАТЬЯ,
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/img/один.jpg': 'картинка',
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/img/два.jpg': 'картинка',
    });

    const пути = (await ручка(место, '/api/release', {path: RU})).payload.файлы.map((файл) => файл.путь);

    expect(пути).toContain('i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/img/один.jpg');
    expect(пути).toContain('i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/img/два.jpg');
  });

  it('на сервере появилась чужая работа — план не считается вовсе', async () => {
    const место = await среда();
    await чужаяРаботаНаСервере(место);

    const {status, payload} = await ручка(место, '/api/release', {path: RU});

    expect(status).toBe(409);
    expect(payload.код).toBe('ветвиРазошлись');
    expect(payload.файлы).toBeUndefined();
  });

  it('свой коммит ещё не уехал — новый выпуск не начинается, предлагается доотправить', async () => {
    const место = await среда();
    fs.writeFileSync(path.join(место.repo, RU), `${СТАТЬЯ}Ещё строка.
`, 'utf8');
    await место.git.raw(['add', '--', RU]);
    await место.git.raw(['commit', '-m', 'правка']);

    const {status, payload} = await ручка(место, '/api/release', {path: RU});

    expect(status).toBe(409);
    expect(payload.код).toBe('естьНеотправленное');
  });

  // Перечень этой ручки станет источником записи в хранилище, поэтому заслон стоит здесь, а не в окне.
  const негодные = [
    ['.github/workflows/deploy.yml', 'служебный файл сборки сайта'],
    ['docs/lessons', 'папка, а не статья'],
    ['docs/lessons/proba/cover.png', 'картинка, а не статья'],
    ['docs/../static/robots.txt', 'выход из корней контента через две точки'],
    ['docs\\lessons\\proba\\index.mdx', 'путь с обратными косыми'],
    ['static/img/logo.png', 'файл вне корней контента'],
  ];
  for (const [путь, чем] of негодные) {
    it(`выпуск не даётся на путь, который не файл статьи сайта: ${чем}`, async () => {
      const место = await среда({
        [RU]: СТАТЬЯ,
        [EN]: СТАТЬЯ,
        [ES]: СТАТЬЯ,
        '.github/workflows/deploy.yml': 'служебное',
        'docs/lessons/proba/cover.png': 'картинка',
        'static/img/logo.png': 'картинка',
        'static/robots.txt': 'служебное',
      });

      const план = await ручка(место, '/api/release', {path: путь});
      expect(план.status).toBe(400);
      expect(план.payload.файлы).toBeUndefined();

      let звали = false;
      const сборка = await ручка(место, '/api/release/build', {path: путь}, (...аргументы) => {
        звали = true;
        return сборщик()(...аргументы);
      });
      expect(звали).toBe(false);
      expect(сборка.status).toBe(400);
    });
  }
});

describe('полная сборка плана', () => {
  it('зелёная сборка разрешает переход к подтверждению публикации и запоминается вместе с деревом', async () => {
    const место = await среда();
    const {status, payload} = await ручка(место, '/api/release/build', {path: RU}, сборщик());

    expect(status).toBe(200);
    expect(payload.зелёная).toBe(true);
    expect(payload.причина).toBe('');
    expect(зелёнаяСборка()).toMatchObject({путь: RU, основа: место.основа});
    expect(зелёнаяСборка().дерево).toMatch(/^[0-9a-f]{40}$/);
  });

  it('упавшая сборка не пускает дальше, называет причину и сохраняет вывод сборщика целиком', async () => {
    const место = await среда();
    const вывод = 'Docusaurus build\nошибка сборки: страница не собралась\nподробности где-то тут';
    const {payload} = await ручка(
      место, '/api/release/build', {path: RU},
      сборщик({ошибка: Object.assign(new Error('провал'), {code: 1}), stdout: вывод}),
    );

    expect(payload.зелёная).toBe(false);
    expect(payload.вывод).toBe(вывод);
    expect(payload.причина).toContain('ошибка сборки');
    expect(зелёнаяСборка()).toBe(null);
  });

  it('сборка, оборванная по пределу времени, называется своим ответом, а не тишиной', async () => {
    const место = await среда();
    const убит = Object.assign(new Error('таймаут'), {killed: true, signal: 'SIGTERM'});
    const {payload} = await ручка(место, '/api/release/build', {path: RU}, сборщик({ошибка: убит}));

    expect(payload.зелёная).toBe(false);
    expect(payload.оборвана).toBe(true);
  });

  it('план не доказан — сборка не запускается вовсе', async () => {
    const место = await среда({
      [RU]: СТАТЬЯ,
      [EN]: СТАТЬЯ,
      [ES]: СТАТЬЯ,
      'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/сосед.mdx': СТАТЬЯ,
    });
    let звали = false;

    const {status, payload} = await ручка(место, '/api/release/build', {path: RU}, (...аргументы) => {
      звали = true;
      return сборщик()(...аргументы);
    });

    expect(звали).toBe(false);
    expect(status).toBe(409);
    expect(payload.error).toBe(НАСТРОЙКИ['ошибкиСервера']['составНеДоказан']);
  });

  it('сборщик зовётся сам собой, без оболочки, и НЕ в рабочей папке человека', async () => {
    const место = await среда();
    let вызов = null;

    await ручка(место, '/api/release/build', {path: RU}, (файл, аргументы, опции, готово) => {
      вызов = {файл, аргументы, опции};
      setTimeout(() => готово(null, '', ''), 0);
      return {on: () => {}};
    });

    expect(вызов.файл).toBe(process.execPath);
    expect(вызов.аргументы).toContain('build');
    // Ключа языка нет намеренно: без него сборщик собирает все локали сайта.
    expect(вызов.аргументы.some((аргумент) => String(аргумент).includes('locale'))).toBe(false);
    // Собирается точная копия будущего сайта, а не рабочая папка человека.
    expect(вызов.опции.cwd).not.toBe(место.repo);
    expect(вызов.опции.timeout).toBe(НАСТРОЙКИ['сборка']['пределМинут'] * 60 * 1000);
  });

  it('ни план, ни сборка не меняют на диске ни одного байта работы человека', async () => {
    const место = await среда(
      {[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: '---\ntitle: "Prueba"\n---\n\nMi trabajo.\n'},
      {вКоммите: [RU, EN]},
    );
    const снимок = () => ({
      ru: fs.readFileSync(path.join(место.repo, RU), 'utf8'),
      es: fs.readFileSync(path.join(место.repo, ES), 'utf8'),
      статус: (fs.readdirSync(место.repo)).sort().join(','),
    });
    const было = снимок();

    await ручка(место, '/api/release', {path: RU});
    await ручка(место, '/api/release/build', {path: RU}, сборщик());

    expect(снимок()).toEqual(было);
  });
});
