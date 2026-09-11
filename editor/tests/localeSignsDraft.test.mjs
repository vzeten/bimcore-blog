// Имя каждого теста повторяет формулировку правила.
// Красная точка означает работу, надёжно сохранённую программой и ещё не уехавшую на сайт, где бы
// она ни лежала — в файле статьи или в подтверждённом черновике автосохранения (решение владельца
// 2026-09-07). Проверяется на настоящем временном git и настоящей ручке автосохранения: свод,
// реестр и шапка спрашиваются тем же путём, каким их собирает сервер.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

import {listArticles, опубликованные, черновыеПравки} from '../src/adapters/library.mjs';
import {расхождениеССайтом} from '../src/adapters/gitFile.mjs';
import {articleFacts} from '../src/adapters/articleFacts.mjs';
import {draftRoute} from '../src/adapters/draftRoute.mjs';
import {fingerprint} from '../src/adapters/draftStore.mjs';
import {loadDraft} from '../src/adapters/draftStore.mjs';
import {признакиЛокали} from '../src/core/localeSigns.mjs';
import {splitArticle} from '../src/core/articleFile.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
const ЖДАТЬ_GIT = 30_000;

const ПУТИ = {
  ru: 'i18n/ru/docusaurus-plugin-content-blog/proba/index.mdx',
  en: 'blog/proba/index.mdx',
  es: 'i18n/es/docusaurus-plugin-content-blog/proba/index.mdx',
};

const статья = (тело) => `---\ntitle: "Проба"\ndescription: "Про пробу."\n---\n\n${тело}\n`;
const ЗАГЛУШКА_ES = НАСТРОЙКИ['заглушкиПеревода']['es']['тело'];

const папки = [];

afterEach(() => {
  while (папки.length > 0) fs.rmSync(папки.pop(), {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
});

function положить(repo, rel, текст) {
  fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
  fs.writeFileSync(path.join(repo, rel), текст, 'utf8');
}

/** Три языковые версии одной статьи, все три уехали на сайт; папка черновиков пока пуста. */
async function среда() {
  const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-draft-signs-'));
  папки.push(корень);
  const repo = path.join(корень, 'работа');
  const сервер = path.join(корень, 'сайт.git');

  await simpleGit(корень).raw(['init', '--bare', '--initial-branch=main', сервер]);
  положить(repo, ПУТИ.ru, статья('Русский текст.'));
  положить(repo, ПУТИ.en, статья('English text.'));
  положить(repo, ПУТИ.es, статья(ЗАГЛУШКА_ES));

  const git = simpleGit(repo);
  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Проверка');
  await git.addConfig('user.email', 'proverka@example.com');
  await git.addConfig('commit.gpgsign', 'false');
  await git.raw(['remote', 'add', 'origin', сервер]);
  await git.raw(['add', '--', ...Object.values(ПУТИ)]);
  await git.raw(['commit', '-m', 'все три версии на сайте']);
  await git.raw(['push', 'origin', 'main']);

  return {repo, git};
}

/** Свод тем же порядком, каким его собирает сервер: с ветки и с черновиков автосохранения. */
async function свод({repo, git}) {
  const ветка = await опубликованные(git, 'origin/main');
  const расхождение = await расхождениеССайтом(git, 'origin/main', НАСТРОЙКИ['контент'].map((root) => root['папка']));

  return listArticles(
    repo, НАСТРОЙКИ, new Map(), ветка.файлы,
    расхождение === null ? null : new Set(расхождение),
    ветка.известна,
    черновыеПравки(repo, НАСТРОЙКИ),
  );
}

/** Признаки каждой локали так, как их берёт реестр: из свода, правилом ядра. */
const признакиРеестра = (статьи) => {
  const своя = статьи.find((item) => Object.values(item.versions).some((v) => v.path === ПУТИ.ru));
  return Object.fromEntries(
    Object.keys(НАСТРОЙКИ['локали']).map((код) => [код, признакиЛокали(своя.versions[код] ?? null)]),
  );
};

/** Настоящее автосохранение: тот же обработчик, что отвечает окну на `/api/draft`. */
async function автосохранить({repo}, rel, текст, правкаОт = new Date().toISOString()) {
  const ответы = [];
  // Шапку окно шлёт ту же, что открыло: правится в этой пробе только тело статьи.
  const файл = path.join(repo, rel);
  const сырой = fs.existsSync(файл) ? fs.readFileSync(файл, 'utf8') : '';
  const шапка = fs.existsSync(файл) ? splitArticle(сырой).frontmatterRaw : '';

  await draftRoute({
    req: {method: 'POST'},
    res: {},
    url: {pathname: '/api/draft'},
    repo,
    settings: НАСТРОЙКИ,
    // Отпечаток базы окно шлёт всегда: по нему сервер видит, менялся ли файл снаружи.
    тело: async () => ({path: rel, body: текст, frontmatterRaw: шапка, отпечатокБазы: fingerprint(сырой), правкаОт}),
    insideRepo: () => true,
    send: (_res, code, data) => ответы.push({code, data}),
    последняяПравка: new Map(),
    фиксировать: async () => null,
  });

  return ответы[0];
}

describe('красная точка означает сохранённую программой, но не опубликованную правку', () => {
  it('опубликованная EN получила успешное автосохранение отличающегося текста — красная точка есть', async () => {
    const с = await среда();
    const файлДо = fs.readFileSync(path.join(с.repo, ПУТИ.en), 'utf8');

    const ответ = await автосохранить(с, ПУТИ.en, 'English text, edited.');
    const признаки = признакиРеестра(await свод(с));

    // Сервер подтвердил запись, и работа лежит у программы — но не в файле статьи.
    expect(ответ.code).toBe(200);
    expect(ответ.data['автосохранено']).toBeTruthy();
    expect(fs.readFileSync(path.join(с.repo, ПУТИ.en), 'utf8')).toBe(файлДо);
    expect(признаки.en.изменена).toBe(true);
  }, ЖДАТЬ_GIT);

  it('точка от автосохранения не задевает соседние языковые версии', async () => {
    const с = await среда();
    await автосохранить(с, ПУТИ.en, 'English text, edited.');

    const признаки = признакиРеестра(await свод(с));

    expect(признаки.ru.изменена).toBe(false);
    expect(признаки.es.изменена).toBe(false);
    // Остальные признаки соседей на месте: заглушка ES своей точки не получает, но и не исчезает.
    expect(признаки.es.заглушка).toBe(true);
  }, ЖДАТЬ_GIT);

  it('шапка и реестр берут эту точку из одного источника и показывают одно и то же', async () => {
    const с = await среда();
    await автосохранить(с, ПУТИ.en, 'English text, edited.');

    const статьи = await свод(с);

    // Шапка спрашивает про открытую RU, а получает признаки всех трёх версий — те же самые.
    expect(articleFacts(статьи, ПУТИ.ru, НАСТРОЙКИ).признакиЛокалей).toEqual(признакиРеестра(статьи));
    expect(articleFacts(статьи, ПУТИ.en, НАСТРОЙКИ).признакиЛокалей.en.изменена).toBe(true);
  }, ЖДАТЬ_GIT);

  it('ещё не сохранённый набор точки не создаёт: у программы этой работы нет', async () => {
    const с = await среда();

    // Человек печатает, запрос ещё не ушёл: на диске ни файла с правкой, ни черновика.
    expect(признакиРеестра(await свод(с)).en.изменена).toBe(false);
    expect(loadDraft(с.repo, НАСТРОЙКИ, ПУТИ.en)).toBe(null);
  }, ЖДАТЬ_GIT);

  it('автосохранение не удалось — точки нет, ложного обещания сайту не появляется', async () => {
    const с = await среда();

    // Отказ ручки: такой статьи нет. Черновик не записан, значит и работы у программы нет.
    const ответ = await автосохранить(с, 'blog/нет-такой/index.mdx', 'English text, edited.');

    expect(ответ.code).toBe(404);
    expect(признакиРеестра(await свод(с)).en.изменена).toBe(false);
  }, ЖДАТЬ_GIT);

  it('запоздавшая правка отклонена как устаревшая — записи нет, точки тоже', async () => {
    const с = await среда();
    const свежая = new Date().toISOString();
    const старая = new Date(Date.parse(свежая) - 60_000).toISOString();

    await автосохранить(с, ПУТИ.en, 'English text, edited.', свежая);
    const ответ = await автосохранить(с, ПУТИ.en, 'Совсем другое.', старая);

    // Отклонённая правка не подменяет собой уже записанную: точка осталась от принятой работы.
    expect(ответ.data['устарел']).toBe(true);
    expect(loadDraft(с.repo, НАСТРОЙКИ, ПУТИ.en)['body']).toBe('English text, edited.');
    expect(признакиРеестра(await свод(с)).en.изменена).toBe(true);
  }, ЖДАТЬ_GIT);

  it('черновик, слово в слово равный файлу, точки не зажигает', async () => {
    const с = await среда();

    // Ручка такой черновик и не хранит: работа человека равна файлу, показывать нечего.
    const своё = splitArticle(fs.readFileSync(path.join(с.repo, ПУТИ.en), 'utf8')).body;
    await автосохранить(с, ПУТИ.en, своё);

    expect(loadDraft(с.repo, НАСТРОЙКИ, ПУТИ.en)).toBe(null);
    expect(признакиРеестра(await свод(с)).en.изменена).toBe(false);
  }, ЖДАТЬ_GIT);

  it('работа, уже уехавшая в файл, даёт ту же точку и без черновика', async () => {
    const с = await среда();

    // Ручное сохранение убирает черновик и кладёт работу в файл: место хранения другое, знак тот же.
    fs.appendFileSync(path.join(с.repo, ПУТИ.en), 'Local edit.\n', 'utf8');

    expect(черновыеПравки(с.repo, НАСТРОЙКИ).size).toBe(0);
    expect(признакиРеестра(await свод(с)).en.изменена).toBe(true);
  }, ЖДАТЬ_GIT);

  it('черновик статьи, которой на диске больше нет, точку никому не зажигает', async () => {
    const с = await среда();
    await автосохранить(с, ПУТИ.en, 'English text, edited.');
    fs.rmSync(path.join(с.repo, ПУТИ.en));

    expect(черновыеПравки(с.repo, НАСТРОЙКИ).size).toBe(0);
    expect(признакиРеестра(await свод(с)).en.есть).toBe(false);
  }, ЖДАТЬ_GIT);
});

describe('местная смена доступности показывается только красной точкой', () => {
  /** Переписать шапку названной версии так же, как это сделало бы сохранение из окна. */
  const переписать = (repo, rel, строка) => {
    const текст = fs.readFileSync(path.join(repo, rel), 'utf8');
    положить(repo, rel, текст.replace('title: "Проба"', `title: "Проба"\n${строка}`));
  };

  it('локально поставленный draft даёт точку, а буквы оставляет прежними', async () => {
    // Красный цвет обещает поведение живой страницы; будущую правку показывает точка.
    const с = await среда();
    переписать(с.repo, ПУТИ.en, 'draft: true');

    const признаки = признакиРеестра(await свод(с));

    expect(признаки.en.изменена).toBe(true);
    for (const код of ['ru', 'en', 'es']) expect(признаки[код].черновик, код).toBe(false);
  }, ЖДАТЬ_GIT);

  it('локально поставленный unlisted даёт ту же точку и не заводит значка ссылки', async () => {
    const с = await среда();
    переписать(с.repo, ПУТИ.en, 'unlisted: true');

    const признаки = признакиРеестра(await свод(с));

    expect(признаки.en.изменена).toBe(true);
    for (const код of ['ru', 'en', 'es']) expect(признаки[код].поСсылке, код).toBe(false);
  }, ЖДАТЬ_GIT);

  it('точка от смены доступности не задевает соседние языковые версии', async () => {
    const с = await среда();
    переписать(с.repo, ПУТИ.en, 'draft: true');

    const статьи = await свод(с);
    const признаки = признакиРеестра(статьи);

    expect(признаки.ru.изменена).toBe(false);
    expect(признаки.es.изменена).toBe(false);
    // Шапка открытой статьи берёт те же признаки из того же свода.
    expect(articleFacts(статьи, ПУТИ.ru, НАСТРОЙКИ).признакиЛокалей).toEqual(признаки);
  }, ЖДАТЬ_GIT);
});
