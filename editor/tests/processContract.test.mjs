import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const editorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(editorRoot, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8').replace(/\r\n/g, '\n');

describe('короткий контракт процесса', () => {
  it('держит CURRENT_TASK карточкой одной операции', () => {
    const text = read('editor/CURRENT_TASK.md');
    expect(text.split('\n').length).toBeLessThanOrEqual(60);
    expect(text).toContain('## Результат');
    expect(text).toContain('## Границы этой операции');
    expect(text).toContain('## Приёмка');
    expect(text).not.toMatch(/история кругов|ревизия|session_id|reviewer[.]json/i);
  });

  it('не возвращает постоянные сессии и ревизионный автомат', () => {
    const rules = [
      read('CLAUDE.md'),
      read('AGENTS.md'),
      read('editor/TASKS.md'),
      read('.claude/skills/codex-gate/SKILL.md'),
      read('.claude/skills/editor-change/SKILL.md'),
      read('.claude/skills/model-council/SKILL.md'),
    ].join('\n');

    expect(rules).toContain('codex exec --ephemeral --sandbox read-only');
    expect(rules).toContain('Постоянной сессии');
    expect(rules).toContain('нет');
    expect(rules).not.toMatch(/exec resume <|codex_response_revision|точный ID хранится|одна постоянная read-only сессия/i);
    expect(read('editor/DECISIONS.md')).toContain('Процесс разработки v1 заменяет прежние правила');
    expect(read('editor/TASKS.md')).not.toMatch(/Класс [АБВ]|класса [АБВ]|класс [АБВ]|44–70|совет собирается сам/);
  });

  it('разделяет три риска и не передаёт технические решения владельцу', () => {
    const tasks = read('editor/TASKS.md');
    const claude = read('CLAUDE.md');
    const gate = read('.claude/skills/codex-gate/SKILL.md');

    for (const marker of [
      '1. Видимое и обратимое',
      '2. Данные статьи',
      '3. Публикация и необратимость',
      'RESOLVE_WITHOUT_OWNER',
      'REFRAME_REQUIRED',
      'OWNER_REQUIRED',
    ]) {
      expect(tasks).toContain(marker);
    }
    expect(tasks).toContain('максимум один собранный пакет');
    expect(claude).toContain('Технических вопросов владельцу быть не может');
    expect(tasks).toMatch(/Верхнеуровневый Codex самостоятельно восстанавливает цель/i);
    expect(gate).toMatch(/Блокеры:[\s\S]{0,30}<до трёх/i);
    expect(gate).toMatch(/Убрать:[\s\S]{0,30}<до трёх/i);
  });

  it('ставит контрольный коммит и технический итог перед живой пробой', () => {
    const claude = read('CLAUDE.md');
    const tasks = read('editor/TASKS.md');
    const report = read('editor/REPORT.md');
    const liveCheck = read('.claude/skills/editor-live-check/SKILL.md');

    expect(claude).toContain('Точный порядок завершения');
    expect(tasks).toContain('APPROVED_TO_MERGE branch=<name> head=<sha> base=<sha>');
    expect(tasks).toContain('git diff <base>..<head>');
    expect(tasks).toContain('git merge --ff-only');
    expect(tasks).toContain('git add .` запрещён');
    expect(tasks).toMatch(/функциональный коммит аннулирует пробу/i);
    expect(tasks).toMatch(/один `wait_agent`/i);
    expect(liveCheck).toMatch(/После `GO` итогового контролёра/i);
    expect(report).toMatch(/Владелец отвечает верхнеуровневому Codex свободным текстом/i);
    expect(report).not.toContain('APPROVED_TO_COMMIT');
    expect(report.split('\n').length).toBeLessThanOrEqual(30);
  });

  it('не разрешает контролёру молча уменьшить продуктовый контракт', () => {
    const rules = [
      read('AGENTS.md'),
      read('CLAUDE.md'),
      read('editor/TASKS.md'),
      read('.claude/skills/codex-gate/SKILL.md'),
      read('.claude/skills/editor-change/SKILL.md'),
    ].join('\n');

    expect(rules).toMatch(/SHRINK[\s\S]{0,180}(останавливает|остановку)/i);
    expect(rules).toMatch(/нов(ый|ое) узк(ий|ое)[\s\S]{0,100}(Codex|верхнеуровневый)/i);
    expect(rules).not.toMatch(/при `SHRINK`[^\n]*(Claude )?(уменьшает|убирает|продолжает)/i);
  });

  it('держит машинный статус отдельно от handoff', () => {
    const tasks = read('editor/TASKS.md');
    const change = read('.claude/skills/editor-change/SKILL.md');

    for (const state of ['running', 'ready_for_review', 'owner_required', 'failed']) {
      expect(tasks).toContain(state);
    }
    expect(tasks).toMatch(/свободный текст handoff не\s+являются сигналом/i);
    expect(change).toContain('run-status.json');
    expect(change).toContain('ready_for_review');
  });

  it('завершает ожидание конечным статусом операции, а не закрытием сессии Claude', () => {
    const rules = [read('AGENTS.md'), read('editor/TASKS.md')].join('\n');

    expect(rules).toMatch(/operation, branch[\s\S]{0,120}PID/i);
    expect(rules).toMatch(/перезаписывает[\s\S]{0,180}running/i);
    expect(rules).toMatch(/не отправляет[\s\S]{0,40}финальный ответ[\s\S]{0,60}остаётся `running`/i);
    expect(rules).toMatch(/`ready_for_review`[\s\S]{0,80}`owner_required`[\s\S]{0,80}`failed`[\s\S]{0,40}завершают ожидание/i);
    expect(rules).toMatch(/Живой PID после конечного статуса не означает/i);
    expect(rules).not.toMatch(/пока PID жив/i);
    expect(rules).toMatch(/после ответа Codex[\s\S]{0,100}снова ждёт/i);
    expect(rules).toMatch(/исчезновение PID[\s\S]{0,100}running[\s\S]{0,80}сбоем/i);
  });

  it('задаёт контролёру короткий технический ответ', () => {
    const gate = read('.claude/skills/codex-gate/SKILL.md');

    for (const field of ['Снимок:', 'Вердикт:', 'Размер:', 'Блокеры:', 'Убрать:', 'Остаточный риск:']) {
      expect(gate).toContain(field);
    }
    expect(gate).toContain('до трёх');
    expect(gate).toContain('BLOCK_REAL_RISK');
  });

  it('ведёт функциональные операции в локальных ветках с контрольными коммитами', () => {
    const claude = read('CLAUDE.md');
    const tasks = read('editor/TASKS.md');
    const claudeSkill = read('.claude/skills/editor-change/SKILL.md');
    const codexSkill = read('.agents/skills/editor-change/SKILL.md');

    for (const rules of [claude, tasks, claudeSkill, codexSkill]) {
      expect(rules).toContain('feature/editor-<суть>');
      expect(rules).toContain('fix/editor-<суть>');
    }
    expect(tasks).toContain('git merge --ff-only');
    expect(tasks).toMatch(/push рабочей ветки запрещён/i);
    expect(claudeSkill).toMatch(/контрольный коммит/i);
    expect(codexSkill).toMatch(/контрольные локальные коммиты обязательны/i);
  });

  it('держит handoff коротким и игнорируемым', () => {
    const handoffPath = resolve(editorRoot, '.coordination/handoff.md');
    const ignored = execFileSync('git', ['check-ignore', 'editor/.coordination/handoff.md'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(ignored.replace(/\\/g, '/')).toContain('editor/.coordination/handoff.md');

    expect(read('editor/TASKS.md')).toContain('Claude создаёт его до кода');
    if (!existsSync(handoffPath)) return;
    const handoff = readFileSync(handoffPath, 'utf8').replace(/\r\n/g, '\n');
    expect(handoff.split('\n').length).toBeLessThanOrEqual(50);
    expect(handoff).not.toMatch(/session_id|revision|reviewer/i);
    for (const heading of [
      '## Результат Claude',
      '## Доказательства',
      '## Наблюдения владельца',
      '## Ответ верхнеуровневого Codex',
    ]) {
      expect(handoff).toContain(heading);
    }
  });
});
