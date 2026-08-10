// Общая обвязка для проверок ручки сохранения: настоящий репозиторий во временной папке,
// пустое хранилище редактора и один вызов ручки. Вынесено из тестов, чтобы каждый файл
// проверок держался в пределе размера (SPEC 4.9); правил здесь нет.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {simpleGit} from 'simple-git';

import {saveRoute} from '../src/adapters/saveRoute.mjs';
import {fingerprint} from '../src/adapters/draftStore.mjs';

export const НАСТРОЙКИ = {
  хранение: {файлСостояния: '_state.json', папкаЧерновиков: '.drafts', папкаСнимков: '.history', черновикЖивётДней: 14, снимковНаВерсию: 50},
  реестр: {неизвестныйАвтор: 'Неизвестный'},
  статусы: ['Черновик', 'Готова к публикации', 'Опубликована'],
  ошибкиСервера: {плохойЗапрос: 'неверный запрос', нетСтатьи: 'нет такой статьи', файлИзменёнСнаружи: 'файл изменён снаружи'},
  контент: [
    {локаль: 'en', род: 'docs', папка: 'docs', наСайте: true},
    {локаль: 'ru', род: 'docs', папка: 'i18n/ru/docusaurus-plugin-content-docs/current', наСайте: true},
    {локаль: 'es', род: 'docs', папка: 'i18n/es/docusaurus-plugin-content-docs/current', наСайте: true},
    {локаль: 'ru', род: 'проба', папка: 'editor/sandbox', наСайте: false},
  ],
};

export const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/a/index.mdx';
export const EN = 'docs/lessons/a/index.mdx';
export const ES = 'i18n/es/docusaurus-plugin-content-docs/current/lessons/a/index.mdx';

/**
 * Сколько ждать проверку, которая по-настоящему зовёт git во временной папке.
 *
 * Умолчание vitest — пять секунд, и на Windows под нагрузкой (запущенный dev-сервер, антивирус)
 * git в них не укладывается: проверка падает по времени, а следом падает и уборка папки, потому
 * что процесс git ещё держит её файлы (`EBUSY: rmdir`). Настоящей поломкой это не было ни разу,
 * но привыкать к мигающим проверкам нельзя — однажды за миганием пройдёт настоящая.
 */
export const ЖДАТЬ_GIT = 30_000;

const песочницы = [];

/**
 * Убрать все временные папки, созданные проверками. Зовётся из `afterEach` каждого файла.
 * Windows держит папку занятой ещё мгновение после того, как git её отпустил, поэтому уборка
 * повторяется: иначе падает не проверка, а уборка за ней, и красным становится зелёный прогон.
 */
export function убратьПесочницы() {
  while (песочницы.length > 0) {
    fs.rmSync(песочницы.pop(), {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
  }
}

function песочница(имя) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), имя));
  песочницы.push(dir);
  return dir;
}

export const статья = (шапка, тело = '\nтекст статьи\n') => `---\n${шапка}\n---\n${тело}`;

/** Настоящий репозиторий с языковыми версиями статьи и пустым хранилищем редактора. */
export async function подготовить(файлы) {
  const repo = песочница('editor-repo-');
  const editorDir = песочница('editor-store-');
  const git = simpleGit(repo);

  await git.init();
  await git.addConfig('user.name', 'Хозяин');
  await git.addConfig('user.email', 'хозяин@example.com');

  for (const [rel, текст] of Object.entries(файлы)) {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), текст, 'utf8');
  }

  await git.add('.');
  await git.commit('первая версия');

  return {repo, editorDir, git};
}

export const прочитать = (среда, rel) => fs.readFileSync(path.join(среда.repo, rel), 'utf8');

/**
 * Одно сохранение открытой версии. `фиксировать` подменяется там, где проверяется её сбой;
 * `отпечаток` — там, где проверяется конфликт с внешней правкой.
 */
export async function сохранить(среда, {
  rel, шапка, тело = '\nтекст статьи\n', поверх = false,
  отпечаток = null, фиксировать = async () => undefined,
}) {
  const ответы = [];

  await saveRoute({
    req: {method: 'POST'},
    res: {},
    url: {pathname: '/api/article/save'},
    repo: среда.repo,
    editorDir: среда.editorDir,
    settings: НАСТРОЙКИ,
    git: среда.git,
    тело: async () => ({
      path: rel,
      body: тело,
      frontmatterRaw: шапка,
      отпечатокБазы: отпечаток ?? fingerprint(прочитать(среда, rel)),
      перезаписать: поверх,
    }),
    insideRepo: () => true,
    send: (res, code, data) => ответы.push({code, data}),
    фиксировать,
    последняяПравка: new Map(),
  });

  return ответы[0];
}
