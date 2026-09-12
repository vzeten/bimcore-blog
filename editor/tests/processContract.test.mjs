import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
    expect(text).toMatch(/^## (Границы|Границы этой операции|Правило и границы)$/m);
    expect(text).toMatch(/^## (Приёмка|Проверка и остановка)$/m);
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

    expect(rules).toMatch(/exec( --model [^ ]+)? --ephemeral --sandbox read-only/);
    expect(rules).toContain('Постоянной сессии');
    expect(rules).toContain('нет');
    expect(rules).not.toMatch(/exec resume <|codex_response_revision|точный ID хранится|одна постоянная read-only сессия/i);
    expect(read('editor/DECISIONS.md')).toContain('Процесс разработки v1 заменяет прежние правила');
    expect(read('editor/TASKS.md')).not.toMatch(/Класс [АБВ]|класса [АБВ]|класс [АБВ]|44–70|совет собирается сам/);
  });

  it('разделяет три риска и не передаёт технические решения владельцу', () => {
    const tasks = read('editor/TASKS.md');
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
    expect(tasks).toMatch(/технических вопросов\s+владельцу нет/i);
    expect(tasks).toMatch(/Верхнеуровневый Codex самостоятельно восстанавливает цель/i);
    expect(gate).toMatch(/Блокеры:[\s\S]{0,30}<до трёх/i);
    expect(gate).toMatch(/Убрать:[\s\S]{0,30}<до трёх/i);
  });

  it('ставит контрольный коммит и технический итог перед живой пробой', () => {
    const claude = read('CLAUDE.md');
    const tasks = read('editor/TASKS.md');
    const report = read('editor/REPORT.md');
    const liveCheck = read('.claude/skills/editor-live-check/SKILL.md');

    expect(tasks).toContain('APPROVED_TO_MERGE branch=<name> head=<sha> base=<sha>');
    expect(tasks).toContain('git diff <base>..<head>');
    expect(tasks).toContain('git merge --ff-only');
    expect(tasks).toContain('git add .` запрещён');
    expect(tasks).toMatch(/функциональный коммит аннулирует пробу/i);
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

    expect(rules).toMatch(/SHRINK[\s\S]{0,180}(останавливает|остановку|остановка)/i);
    expect(rules).toMatch(/нов(ый|ое) узк(ий|ое)[\s\S]{0,100}(Codex|верхнеуровневый)/i);
    expect(rules).not.toMatch(/при `SHRINK`[^\n]*(Claude )?(уменьшает|убирает|продолжает)/i);
  });

  it('держит машинный статус отдельно от handoff', () => {
    const tasks = read('editor/TASKS.md');
    const change = read('.claude/skills/editor-change/SKILL.md');

    for (const state of ['running', 'ready_for_review', 'owner_required', 'failed']) {
      expect(tasks).toContain(state);
    }
    expect(tasks).toMatch(/Свободный текст handoff[\s\S]{0,100}не являются сигналом/i);
    expect(change).toContain('run-status.json');
    expect(change).toContain('ready_for_review');
  });

  it('ждёт исполнителя штатным ожиданием Codex, без отдельной программы', () => {
    const tasks = read('editor/TASKS.md');
    const rules = [
      read('CLAUDE.md'),
      read('AGENTS.md'),
      tasks,
      read('editor/process/README.md'),
      read('.claude/skills/editor-change/SKILL.md'),
      read('.agents/skills/editor-change/SKILL.md'),
    ].join('\n');

    expect(tasks).toMatch(/в том же[\s\S]{0,20}ходе ждёт наблюдателя через `wait_agent`/i);
    expect(tasks).toMatch(/пока состояние остаётся[\s\S]{0,10}`running`/i);
    expect(tasks).toMatch(/Исчезновение PID при оставшемся `running` считается сбоем/i);
    expect(tasks).toMatch(/Отдельная локальная программа ожидания не используется/i);
    expect(rules).not.toMatch(/CLAUDE_WAIT|claude-wait\.mjs/);
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

    for (const rules of [tasks]) {
      expect(rules).toContain('feature/editor-<суть>');
      expect(rules).toContain('fix/editor-<суть>');
    }
    expect(tasks).toContain('git merge --ff-only');
    expect(tasks).toMatch(/push рабочей ветки запрещён/i);
  });

  it('не включает служебную передачу в Git', () => {
    const ignored = execFileSync('git', ['check-ignore', 'editor/.coordination/handoff.md'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(ignored.replace(/\\/g, '/')).toContain('editor/.coordination/handoff.md');

    expect(read('editor/TASKS.md')).toContain('Claude создаёт его до кода');

  });
it('держит две инструкции владельца о ветках и папках и проверку порядка', () => {
    const claude = read('CLAUDE.md');
    const agents = read('AGENTS.md');

    for (const marker of ['Запрос «статья»', 'Запрос «код редактора»', 'npm run repo:check', 'копий ровно две', 'удаление временной копии и ветки, до отчёта']) {
      expect(claude).toContain(marker);
    }
    expect(agents).toContain('repo:check');
    expect(claude).not.toMatch(/копи[яю] (репозитория )?для публикации/i);
    expect(existsSync(resolve(repoRoot, 'scripts/repo-check.mjs'))).toBe(true);
    expect(read('package.json')).toContain('"repo:check"');
    expect(read('.claude/settings.json')).toContain('repo-check.mjs');
  });
});
