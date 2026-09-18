// Имя каждого теста повторяет формулировку правила.
// Ручка предварительного выпуска: план публикации и быстрые проверки будущего сайта (ссылки,
// картинки, обложка, шапка, блоки текста). Полной сборки сайта на компьютере нет (решение владельца
// 2026-09-18): сайт собирает GitHub.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {publishRoute} from '../src/adapters/publishRoute.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {EN, ES, RU, СТАТЬЯ, запрос, среда, убратьПесочницы} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

afterEach(() => {
  убратьПесочницы();
});

const ручка = (место, pathname, тело) => запрос(releaseRoute, место, pathname, тело);

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

  it('на сервере появилась чужая работа — план считается поверх неё, а не отказывает', async () => {
    const место = await среда();
    await чужаяРаботаНаСервере(место);
    fs.writeFileSync(path.join(место.repo, RU), `${СТАТЬЯ}Ещё строка.\n`, 'utf8');

    const {status, payload} = await ручка(место, '/api/release', {path: RU});

    expect(status).toBe(200);
    expect(payload.можно).toBe(true);
    expect(payload.файлы.map((файл) => файл.путь)).toEqual([RU]);
  });

  it('свой коммит ещё не уехал — новый выпуск не начинается, предлагается доотправить', async () => {
    const место = await среда();
    fs.writeFileSync(path.join(место.repo, RU), `${СТАТЬЯ}Ещё строка.\n`, 'utf8');
    await запрос(publishRoute, место, '/api/publish/commit', {path: RU, подтверждено: true});

    const {status, payload} = await ручка(место, '/api/release', {path: RU});

    expect(status).toBe(409);
    expect(payload.код).toBe('естьНеотправленное');
  });

  it('ручной коммит в местной ветке выпуску не мешает: ветка и HEAD не спрашиваются', async () => {
    const место = await среда();
    fs.writeFileSync(path.join(место.repo, RU), `${СТАТЬЯ}Ещё строка.\n`, 'utf8');
    await место.git.raw(['add', '--', RU]);
    await место.git.raw(['commit', '-m', 'правка']);
    await место.git.raw(['checkout', '-b', 'своя']);

    const {status, payload} = await ручка(место, '/api/release', {path: RU});

    expect(status).toBe(200);
    expect(payload.можно).toBe(true);
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
    });
  }
});

describe('быстрые проверки вместо сборки на компьютере', () => {
  /** Перечень блоков сайта в основе: без распространения темы, чтобы перечень был полным. */
  const БЛОКИ = 'src/theme/MDXComponents.js';
  const СВОИ_БЛОКИ = "import CTA from '@site/src/components/CTA';\n\nexport default {\n  CTA,\n  truncate: () => null,\n};\n";
  const сБлоками = (ещё = {}) => среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ, [БЛОКИ]: СВОИ_БЛОКИ, ...ещё});
  const коды = (payload) => payload.находки.map((находка) => `${находка.уровень}:${находка.код}`);

  it('сборки на компьютере нет: ручки полной сборки больше не существует', async () => {
    const место = await сБлоками();

    expect((await ручка(место, '/api/release/build', {path: RU})).взято).toBe(false);
  });

  it('исправная правка проходит: блокеров нет, разбор текста без разборщика сайта — предупреждение', async () => {
    const место = await сБлоками();
    fs.writeFileSync(path.join(место.repo, RU), `${СТАТЬЯ}См. [английский урок](/lessons/proba/) и <CTA type="lesson" />.\n`, 'utf8');

    const {status, payload} = await ручка(место, '/api/release', {path: RU});

    expect(status).toBe(200);
    expect(payload.можно).toBe(true);
    // Во временном репозитории зависимостей сайта нет: не проверено — так и сказано, но не отказ.
    expect(коды(payload)).toEqual(['предупреждение:mdxНеПроверен']);
  });

  it('ссылка на страницу, которой не будет, — блокер с местом, публиковать нельзя', async () => {
    const место = await сБлоками();
    fs.writeFileSync(path.join(место.repo, RU), `${СТАТЬЯ}См. [урок](/lessons/nope/).\n`, 'utf8');

    const {payload} = await ручка(место, '/api/release', {path: RU});

    expect(payload.можно).toBe(false);
    expect(payload.находки).toContainEqual(expect.objectContaining({
      код: 'ссылкаВНикуда', уровень: 'блокер', путь: RU, строка: 3, значение: '/lessons/nope/',
    }));
  });

  it('картинка, которой нет рядом со статьёй, и обложка на пустое место — блокеры', async () => {
    const место = await сБлоками();
    const шапка = '---\ntitle: "Проба"\nslug: /lessons/proba\ndescription: "Про пробу."\nimage: ./cover.png\n---\n';
    fs.writeFileSync(path.join(место.repo, RU), `${шапка}\n![кадр](./media/kadr.png)\n`, 'utf8');

    const {payload} = await ручка(место, '/api/release', {path: RU});

    expect(payload.можно).toBe(false);
    expect(коды(payload)).toEqual(expect.arrayContaining(['блокер:картинкиНет', 'блокер:обложкиНет']));
  });

  it('блок, которого сайт не знает, — блокер; зарегистрированный блок проходит', async () => {
    const место = await сБлоками();
    fs.writeFileSync(path.join(место.repo, RU), `${СТАТЬЯ}<CTA type="lesson" />\n\n<Nope />\n`, 'utf8');

    const {payload} = await ручка(место, '/api/release', {path: RU});

    expect(payload.находки.filter((находка) => находка.уровень === 'блокер'))
      .toEqual([expect.objectContaining({код: 'компонентНеизвестен', значение: 'Nope', строка: 5})]);
  });

  it('«Недоступно» и «По ссылке» разом — блокер: сайт с такой шапкой не собирается', async () => {
    const место = await сБлоками();
    fs.writeFileSync(path.join(место.repo, RU), СТАТЬЯ.replace('---\n\n', 'draft: true\nunlisted: true\n---\n\n'), 'utf8');

    const {payload} = await ручка(место, '/api/release', {path: RU});

    expect(payload.можно).toBe(false);
    expect(коды(payload)).toContain('блокер:черновикИСкрыта');
  });

  it('ни план, ни проверки не меняют на диске ни одного байта работы человека', async () => {
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

    expect(снимок()).toEqual(было);
  });
});
