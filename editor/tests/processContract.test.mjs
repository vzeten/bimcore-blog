import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const editorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(editorRoot, '..');

describe('контракт процесса работы', () => {
  it('держит CURRENT_TASK короткой действующей карточкой, а не архивом', () => {
    const text = readFileSync(resolve(editorRoot, 'CURRENT_TASK.md'), 'utf8');
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const headings = lines.filter((line) => /^#{1,6}\s/.test(line));

    expect(lines.length).toBeLessThanOrEqual(150);
    expect(headings.join('\n')).not.toMatch(/истори|сделано|отклон[её]нн/i);
    expect(text).toContain('Новая операция переписывает её целиком');
  });

  it('не допускает файлы координации в git', () => {
    const ignored = execFileSync(
      'git',
      ['check-ignore', 'editor/.coordination/handoff.md', 'editor/.coordination/reviewer.json'],
      { cwd: repoRoot, encoding: 'utf8' },
    );

    expect(ignored.replace(/\\/g, '/')).toContain('editor/.coordination/handoff.md');
    expect(ignored.replace(/\\/g, '/')).toContain('editor/.coordination/reviewer.json');
  });

  it('не возвращает старую передачу в CURRENT_TASK и требует точный resume', () => {
    const tasks = readFileSync(resolve(editorRoot, 'TASKS.md'), 'utf8');
    const report = readFileSync(resolve(editorRoot, 'REPORT.md'), 'utf8');
    const gate = readFileSync(resolve(repoRoot, '.claude/skills/codex-gate/SKILL.md'), 'utf8');

    expect(tasks).toContain('Жёсткий предел — 150 строк');
    expect(tasks).not.toContain('положив туда девять вещей');
    expect(report).toContain('точно тот же текст');
    expect(report).toContain('editor/.coordination/handoff.md');
    expect(gate).toContain('exec resume <ТОЧНЫЙ_SESSION_ID>');
    expect(gate).toContain('`--last` запрещён');
    expect(gate).toContain('"type":"thread.started"');
  });

  it('проверяет живые файлы обмена, когда операция выполняется локально', () => {
    const handoffPath = resolve(editorRoot, '.coordination/handoff.md');
    const reviewerPath = resolve(editorRoot, '.coordination/reviewer.json');
    const handoffExists = existsSync(handoffPath);
    const reviewerExists = existsSync(reviewerPath);

    if (!handoffExists && !reviewerExists) return;

    expect(handoffExists).toBe(true);
    expect(reviewerExists).toBe(true);

    const handoff = readFileSync(handoffPath, 'utf8').replace(/\r\n/g, '\n');
    const reviewer = JSON.parse(readFileSync(reviewerPath, 'utf8'));
    const field = (name) => handoff.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1];
    const report = handoff.match(
      /## Отчёт исполнителя владельцу\n\n([\s\S]*?)\n\n## Технические доказательства/,
    )?.[1];

    expect(handoff.split('\n').length).toBeLessThanOrEqual(120);
    expect(handoff.match(/^## .+$/gm)).toEqual([
      '## Отчёт исполнителя владельцу',
      '## Технические доказательства',
      '## Ответ верхнеуровневого Codex',
    ]);
    const status = field('status');
    const reportReady = status !== 'claude-working';

    if (reportReady) {
      expect(report).toBeTruthy();
      expect(report.split('\n').length).toBeLessThanOrEqual(20);
      for (const part of [
        'Было',
        'Стало',
        'Что для этого сделано',
        'Что нужно от вас',
        'Сколько пройдено',
        'Как начать новую сессию',
      ]) {
        expect(report).toContain(`**${part}.**`);
      }
      expect(report).not.toMatch(/CURRENT_TASK|handoff|reviewer|[.]md|[.]json/);
      expect(report).toMatch(/[0-9]/);
      expect(report).toContain('машинных проверок');
      expect(report).toContain('окно не проверялось');
      expect(report).toContain('До первой живой статьи');
      expect(report).toContain('до законченной программы');
    }

    expect(reviewer.operation_id).toBe(field('operation_id'));
    expect(reviewer.root.replace(/\\\\/g, '\\')).toBe(field('root').replace(/\\\\/g, '\\'));
    expect(reviewer.head_at_start).toBe(field('head'));
    if (reviewer.session_id === null) {
      expect(status).toBe('claude-working');
      expect(reviewer.resume_marker).toBeNull();
    } else {
      expect(reviewer.session_id).toMatch(/^[0-9a-f-]+$/i);
      expect(handoff).toContain(reviewer.session_id);
      expect(reviewer.resume_marker).toBeTruthy();
      expect(handoff).toContain(reviewer.resume_marker);
    }

    const revision = Number(field('revision'));
    const responseRevision = Number(field('codex_response_revision'));
    expect(reviewer.last_revision_seen).toBe(responseRevision);
    expect(responseRevision).toBeLessThanOrEqual(revision);
    if (status === 'awaiting-codex') {
      expect(responseRevision).toBeLessThan(revision);
    }
    if (['codex-answered', 'awaiting-owner-test', 'closed'].includes(status)) {
      expect(responseRevision).toBe(revision);
    }
    if (['awaiting-owner-test', 'closed'].includes(status)) {
      expect(reviewer.cold_final_session_id).toMatch(/^[0-9a-f-]+$/i);
      expect(handoff).toContain(reviewer.cold_final_session_id);
    }
  });
});
