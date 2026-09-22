// Прежние адреса статей из истории опубликованной ветки (ED-024): настоящий временный git.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {дверьGit} from '../src/adapters/gitEnv.mjs';
import {прежниеСостояния, нынешнийПуть, разобратьПереименования} from '../src/adapters/viewHistory.mjs';

function репозиторий() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'история-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {cwd: repo});
  git('init', '-q', '-b', 'main');
  return {repo, git};
}

function положить(repo, rel, текст) {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), {recursive: true});
  fs.writeFileSync(path.join(repo, rel), текст);
}

describe('прежние состояния', () => {
  it('смена slug и переименование — текст «до» каждого события, привязанный к нынешнему пути', async () => {
    const {repo, git} = репозиторий();
    положить(repo, 'blog/old/index.mdx', '---\nslug: first\n---\n');
    git('add', '.');
    git('commit', '-q', '-m', 'статья');
    положить(repo, 'blog/old/index.mdx', '---\nslug: second\n---\n');
    git('commit', '-q', '-am', 'новый slug');
    git('mv', 'blog/old', 'blog/new');
    git('commit', '-q', '-m', 'новая папка');
    положить(repo, 'blog/other.mdx', '---\ntitle: чужая\n---\n');
    git('add', '.');
    git('commit', '-q', '-m', 'соседка');
    // Опубликованная ветка — отдельная ссылка: местная голова уходит дальше, публикация — нет.
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    положить(repo, 'blog/new/index.mdx', '---\nslug: local-only\n---\n');
    git('commit', '-q', '-am', 'местная правка');

    const прежние = await прежниеСостояния(дверьGit(repo), 'origin/main', {
      корни: ['blog'], с: '2000-01-01', есть: (путь) => путь === 'blog/new/index.mdx',
    });
    const тексты = (прежние.get('blog/new/index.mdx') ?? []).map((запись) => `${запись.путь}|${запись.текст.trim()}`).sort();
    expect(тексты).toEqual([
      'blog/old/index.mdx|---\nslug: first\n---',
      'blog/old/index.mdx|---\nslug: second\n---',
    ]);
    expect([...прежние.keys()]).toEqual(['blog/new/index.mdx']);
  });

  it('нет опубликованной ветки или git — пустой ответ, а не ошибка', async () => {
    const {repo} = репозиторий();
    expect((await прежниеСостояния(дверьGit(repo), null, {корни: ['blog'], с: '2000-01-01', есть: () => true})).size).toBe(0);
    expect((await прежниеСостояния(дверьGit(repo), 'origin/main', {корни: ['blog'], с: '2000-01-01', есть: () => true})).size).toBe(0);
  });
});

describe('цепочка переименований', () => {
  it('идёт от старых шагов к новым и не зацикливается', () => {
    const шаги = разобратьПереименования('@c3\nR100\tb\tc\n@c2\nR095\ta\tb\n');
    expect(нынешнийПуть('a', шаги)).toBe('c');
    expect(нынешнийПуть('x', шаги)).toBe('x');
    expect(нынешнийПуть('a', [{было: 'b', стало: 'a'}, {было: 'a', стало: 'b'}])).toBe('a');
  });
});
