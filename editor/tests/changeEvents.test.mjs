// События «Действия» (ED-054) на настоящем временном Git: сервер, копия владельца и копия сотрудника.
// Владелец узнаёт о правках сотрудника только по серверу; след публикации при этом не двигается.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {дверьGit} from '../src/adapters/gitEnv.mjs';
import {серверныйКоммит, разобратьНовые} from '../src/adapters/changeEvents.mjs';
import {открыть} from '../src/adapters/analyticsStore.mjs';

const roots = [
  {папка: 'docs', род: 'docs', локаль: 'en', наСайте: true},
  {папка: 'blog', род: 'blog', локаль: 'en', наСайте: true},
];
const сайт = {roots, корни: ['docs', 'blog'], локали: ['en', 'ru'], обязательный: 'en', префиксБлога: '/blog', хост: null};

function г(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args], {cwd, encoding: 'utf8'}).trim();
}
function положить(корень, rel, текст) {
  fs.mkdirSync(path.dirname(path.join(корень, rel)), {recursive: true});
  fs.writeFileSync(path.join(корень, rel), текст);
}

function мир() {
  const база = fs.mkdtempSync(path.join(os.tmpdir(), 'действия-'));
  const сервер = path.join(база, 'server.git');
  г(база, 'init', '-q', '--bare', сервер);
  const сотрудник = path.join(база, 'staff');
  г(база, 'clone', '-q', сервер, сотрудник);
  положить(сотрудник, 'docs/lessons/a.mdx', '---\ntitle: A\n---\nтекст\n');
  положить(сотрудник, 'blog/old/index.mdx', '---\ntitle: B\n---\n');
  г(сотрудник, 'add', '.');
  г(сотрудник, 'commit', '-q', '-m', 'начало');
  г(сотрудник, 'push', '-q', 'origin', 'HEAD:main');
  const владелец = path.join(база, 'owner');
  г(база, 'clone', '-q', сервер, владелец);
  return {сервер, сотрудник, владелец};
}

function правкиСотрудника(сотрудник) {
  положить(сотрудник, 'docs/lessons/a.mdx', '---\ntitle: A\nslug: /lessons/a-new\n---\nтекст\nещё\n');
  положить(сотрудник, 'docs/lessons/img-01.png', 'картинка');
  г(сотрудник, 'add', '.');
  г(сотрудник, 'commit', '-q', '-m', 'правка статьи');
  положить(сотрудник, 'src/x.js', 'код');
  г(сотрудник, 'add', '.');
  г(сотрудник, 'commit', '-q', '-m', 'только код');
  г(сотрудник, 'mv', 'blog/old', 'blog/new');
  г(сотрудник, 'commit', '-q', '-m', 'переезд');
  г(сотрудник, 'checkout', '-q', '-b', 'ветка');
  положить(сотрудник, 'docs/lessons/m.mdx', '---\ntitle: M\n---\n1\n');
  г(сотрудник, 'add', '.');
  г(сотрудник, 'commit', '-q', '-m', 'ветка 1');
  положить(сотрудник, 'docs/lessons/m.mdx', '---\ntitle: M\n---\n1\n2\n');
  г(сотрудник, 'commit', '-q', '-am', 'ветка 2');
  г(сотрудник, 'checkout', '-q', 'main');
  г(сотрудник, 'merge', '-q', '--no-ff', '-m', 'слияние', 'ветка');
  г(сотрудник, 'rm', '-q', 'docs/lessons/a.mdx');
  г(сотрудник, 'commit', '-q', '-m', 'удаление');
  г(сотрудник, 'push', '-q', 'origin', 'main');
}

const строки = (база) => база.prepare('SELECT коммит, путь, вид, прежний_путь, адрес, прежний_адрес, автор, добавлено, убрано, описание FROM события ORDER BY дата, коммит, путь').all();

describe('события из серверной main', {timeout: 120_000}, () => {
  it('правки сотрудника видны владельцу; слияние один раз; код и картинки мимо; след публикации не двинут', async () => {
    const {сервер, сотрудник, владелец} = мир();
    правкиСотрудника(сотрудник);
    const git = дверьGit(владелец);
    const следДо = г(владелец, 'rev-parse', 'origin/main');
    const fetchHead = path.join(владелец, '.git', 'FETCH_HEAD');
    const fetchHeadДо = fs.existsSync(fetchHead) ? fs.readFileSync(fetchHead, 'utf8') : null;

    const вершина = await серверныйКоммит(git);
    expect(вершина).toBe(г(сервер, 'rev-parse', 'main'));
    expect(г(владелец, 'rev-parse', 'origin/main')).toBe(следДо);
    expect(fs.existsSync(fetchHead) ? fs.readFileSync(fetchHead, 'utf8') : null).toBe(fetchHeadДо);

    const база = await открыть(владелец);
    await разобратьНовые({git, база, вершина, сайт, предел: 100, пределДельтыБайт: 100_000, пометкаОбреза: '…'});
    const события = строки(база);
    const виды = события.map((с) => `${с.вид}:${с.путь}`);
    expect(виды).toContain('добавление:docs/lessons/a.mdx');
    expect(виды).toContain('правка:docs/lessons/a.mdx');
    expect(виды).toContain('переименование:blog/new/index.mdx');
    expect(виды).toContain('удаление:docs/lessons/a.mdx');
    // Каждое изменение — у своего коммита: коммит «только код» не получает изменений соседнего коммита.
    const поКоммиту = (сообщение) => г(сервер, 'log', '--format=%H', '-1', `--grep=^${сообщение}$`, 'main');
    expect(события.filter((с) => с.коммит === поКоммиту('только код'))).toEqual([]);
    expect(события.filter((с) => с.коммит === поКоммиту('правка статьи')).map((с) => с.вид)).toEqual(['правка']);
    expect(события.filter((с) => с.вид === 'добавление' && с.путь === 'docs/lessons/a.mdx')).toHaveLength(1);
    // Слияние — одна запись против первого родителя; внутренние коммиты ветки отдельно не пишутся.
    const слияние = события.filter((с) => с.путь === 'docs/lessons/m.mdx');
    expect(слияние).toHaveLength(1);
    expect(слияние[0].коммит).toBe(поКоммиту('слияние'));
    expect(события.some((с) => с.путь.endsWith('.png') || с.путь.startsWith('src/'))).toBe(false);

    const правка = события.find((с) => с.вид === 'правка');
    expect(правка).toMatchObject({адрес: '/lessons/a-new', прежний_адрес: '/lessons/a', добавлено: 2, убрано: 0, описание: null});
    const переезд = события.find((с) => с.вид === 'переименование');
    expect(переезд).toMatchObject({прежний_путь: 'blog/old/index.mdx', адрес: '/blog/new', прежний_адрес: '/blog/old'});
    const удаление = события.find((с) => с.вид === 'удаление');
    expect(удаление).toMatchObject({адрес: null, прежний_адрес: '/lessons/a-new'});

    // Повтор ничего не удваивает; описание, вписанное ИИ, повтор не затирает.
    база.prepare('UPDATE события SET описание = ? WHERE вид = ?').run('ИИ: смена адреса', 'правка');
    база.prepare("DELETE FROM состояние WHERE ключ = 'события.разобраноДо'").run();
    await разобратьНовые({git, база, вершина, сайт, предел: 100, пределДельтыБайт: 100_000, пометкаОбреза: '…'});
    expect(строки(база)).toHaveLength(события.length);
    expect(строки(база).find((с) => с.вид === 'правка').описание).toBe('ИИ: смена адреса');
    база.close();
  });

  it('первый разбор идёт частями: предел за заход, продолжение с отметки', async () => {
    const {сотрудник, владелец} = мир();
    правкиСотрудника(сотрудник);
    const git = дверьGit(владелец);
    const база = await открыть(владелец);
    const вершина = await серверныйКоммит(git);
    const разобрать = () => разобратьНовые({git, база, вершина, сайт, предел: 2, пределДельтыБайт: 100_000, пометкаОбреза: '…'});
    expect(await разобрать()).toBe(2);
    let всего = 2;
    for (let шаг = 0; шаг < 10; шаг += 1) {
      const порция = await разобрать();
      if (порция === 0) break;
      всего += порция;
    }
    // Первая линия: начало, правка, код, переезд, слияние, удаление — шесть коммитов, ветка внутри слияния не в счёт.
    expect(всего).toBe(6);
    expect(await разобрать()).toBe(0);
    база.close();
  });

  it('сервер недоступен — берётся известный след, без ошибки', async () => {
    const {владелец} = мир();
    const git = дверьGit(владелец);
    г(владелец, 'remote', 'set-url', 'origin', path.join(os.tmpdir(), 'нет-такого-сервера.git'));
    expect(await серверныйКоммит(git)).toBe(г(владелец, 'rev-parse', 'origin/main'));
  });
});
