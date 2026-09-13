import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => readFileSync(resolve(repoRoot, p), 'utf8');

describe('структура входов процесса', () => {
  it('не дублирует разделы канонических инструкций', () => {
    for (const file of ['CLAUDE.md', 'AGENTS.md', 'editor/process/README.md']) {
      const headings = [...read(file).matchAll(/^#{1,6}\s+(.+)$/gm)].map(m => m[1].trim());
      expect(new Set(headings).size, file).toBe(headings.length);
    }
    const routes = [...read('CLAUDE.md').matchAll(/^#{1,6}.*Ветки и папки.*$/gm)];
    expect(routes).toHaveLength(1);
  });
  it('сохраняет рабочие локальные ссылки основных входов', () => {
    for (const file of ['AGENTS.md', 'CLAUDE.md', 'editor/process/README.md']) {
      for (const match of read(file).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = match[1].split('#')[0];
        if (!target || /^[a-z]+:/i.test(target)) continue;
        expect(existsSync(resolve(repoRoot, dirname(file), target)), `${file}: ${target}`).toBe(true);
      }
    }
  });
  it('не включает служебную передачу в Git', () => {
    const ignored = execFileSync('git', ['check-ignore', 'editor/.coordination/handoff.md'], {
      cwd: repoRoot, encoding: 'utf8',
    });
    expect(ignored.replace(/\\/g, '/').trim()).toBe('editor/.coordination/handoff.md');
  });
  it('маршрут кода сайта: проверка состояния допускает ветки site наравне с editor', () => {
    const check = read('scripts/repo-check.mjs');
    const m = check.match(/const WORK = (\/[^\n]+\/);/);
    expect(m).not.toBeNull();
    const WORK = new RegExp(m[1].slice(1, -1));
    for (const ok of ['feature/site-menu', 'fix/site-prices', 'feature/editor-x', 'fix/editor-locale-1']) expect(WORK.test(ok)).toBe(true);
    for (const bad of ['codex/site-x', 'feature/plugin-x', 'site-menu', 'fix/site-Bad_Name', 'main', 'editor']) expect(WORK.test(bad)).toBe(false);
    expect(read('CLAUDE.md')).toMatch(/feature\/site-<суть>/);
    expect(read('editor/TASKS.md')).toMatch(/Код сайта Docusaurus этим разделом не покрывается/);
  });
  it('проверка состояния из копии проверяет основную папку, а не копию', () => {
    // Скрипт запускается из копии (accepted-editor или временной): корень берётся у git, а не у пути скрипта.
    const script = read('scripts/repo-check.mjs');
    expect(script).toMatch(/--git-common-dir/);
    // Основная папка — родитель общего каталога .git; тест может идти и из основной папки, и из копии.
    const mainFolder = resolve(repoRoot, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: repoRoot, encoding: 'utf8' }).trim(), '..');
    const copies = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').filter(l => l.startsWith('worktree ')).map(l => l.slice(9)).filter(p => resolve(p) !== mainFolder);
    if (copies.length === 0) return; // копий нет — сценарий не воспроизводим
    const probe = script.replace(/const HERE = [^\n]+;/, 'const HERE = ' + JSON.stringify(copies[0].replace(/\\/g, '/')) + ';');
    expect(probe).not.toBe(script);
    const tmp = resolve(repoRoot, 'editor/.coordination/repo-check-probe.tmp.mjs');
    writeFileSync(tmp, probe);
    try {
      const out = execFileSync('node', [tmp], { cwd: copies[0], encoding: 'utf8' });
      expect(out).toMatch(/запущено из копии/);
      expect(out).toMatch(/основная папка на main/);
      expect(out).not.toMatch(/посторонняя рабочая копия/);
    } finally { rmSync(tmp, { force: true }); }
  });
});
