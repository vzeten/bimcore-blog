// Имя каждого теста повторяет формулировку правила.
import {describe, expect, it} from 'vitest';
import {afterEdit, emptyState, initialReadiness, readState, writeState} from '../src/core/articleState.mjs';
import {historyFolder, parseSnapshotName, snapshotName, toSessions, версииИзИмён} from '../src/core/history.mjs';

const НАСТРОЙКИ = {
  статусы: ['Черновик', 'Готова к публикации', 'Опубликована'],
  хранение: {файлСостояния: '_state.json'},
};

describe('состояние языковой версии', () => {
  it('новая версия начинается черновиком', () => {
    const state = emptyState(НАСТРОЙКИ);

    expect(state.готовность).toBe('Черновик');
    expect(state.нити).toEqual([]);
  });

  it('видимость в состоянии не хранится: её место — шапка статьи', () => {
    expect(writeState(emptyState(НАСТРОЙКИ))).not.toContain('видимость');
  });

  it('битый файл состояния не роняет программу', () => {
    expect(readState('это не json', НАСТРОЙКИ).готовность).toBe('Черновик');
    expect(readState('', НАСТРОЙКИ).готовность).toBe('Черновик');
    expect(readState(undefined, НАСТРОЙКИ).готовность).toBe('Черновик');
  });

  it('состояние переживает запись и чтение без потерь', () => {
    const state = {...emptyState(НАСТРОЙКИ), готовность: 'Опубликована', опубликованныйКоммит: 'abc123'};
    const back = readState(writeState(state), НАСТРОЙКИ);

    expect(back.готовность).toBe('Опубликована');
    expect(back.опубликованныйКоммит).toBe('abc123');
  });

  it('одно и то же состояние даёт один и тот же текст файла', () => {
    const state = emptyState(НАСТРОЙКИ);

    expect(writeState(state)).toBe(writeState({...state}));
  });

  it('правка после подготовки возвращает версию в черновик', () => {
    const готова = {...emptyState(НАСТРОЙКИ), готовность: 'Готова к публикации'};

    expect(afterEdit(готова, НАСТРОЙКИ).готовность).toBe('Черновик');
  });

  it('статья без файла состояния, но уже на сайте, показывается опубликованной, а не черновиком', () => {
    expect(initialReadiness(true, НАСТРОЙКИ)).toBe('Опубликована');
    expect(initialReadiness(false, НАСТРОЙКИ)).toBe('Черновик');
  });
});

describe('черновые снимки правок', () => {
  it('имя снимка разбирается обратно во время и автора', () => {
    const name = snapshotName('2026-07-31T14:12:05.000Z', 'claude');
    const back = parseSnapshotName(name);

    expect(back.iso).toBe('2026-07-31T14:12:05.000Z');
    expect(back.author).toBe('claude');
  });

  it('снимки одной версии складываются в отдельную папку', () => {
    const one = historyFolder('docs/guides/families/armchairs-for-revit/index.mdx');
    const two = historyFolder('i18n/ru/docusaurus-plugin-content-docs/current/guides/families/armchairs-for-revit/index.mdx');

    expect(one).not.toBe(two);
    expect(one).not.toContain('/');
  });

  it('подряд идущие сохранения одного автора складываются в один сеанс', () => {
    const sessions = toSessions([
      {iso: '2026-07-31T14:00:00.000Z', author: 'я'},
      {iso: '2026-07-31T14:05:00.000Z', author: 'я'},
      {iso: '2026-07-31T14:10:00.000Z', author: 'я'},
    ]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].snapshots).toHaveLength(3);
  });

  it('смена автора начинает новый сеанс', () => {
    const sessions = toSessions([
      {iso: '2026-07-31T14:00:00.000Z', author: 'я'},
      {iso: '2026-07-31T14:05:00.000Z', author: 'claude'},
      {iso: '2026-07-31T14:10:00.000Z', author: 'я'},
    ]);

    expect(sessions.map((session) => session.author)).toEqual(['я', 'claude', 'я']);
  });

  it('перерыв во времени сеанс не рвёт: отметку начинает только смена автора', () => {
    // Разрыв по времени убран осознанно (см. DECISIONS.md): такого правила нет в BUSINESS.md.
    const sessions = toSessions([
      {iso: '2026-07-31T09:00:00.000Z', author: 'я'},
      {iso: '2026-08-04T18:00:00.000Z', author: 'я'},
    ]);

    expect(sessions).toHaveLength(1);
  });
});

describe('лента версий из имён снимков', () => {
  it('версии идут по порядку времени', () => {
    const версии = версииИзИмён([
      '2026-08-04T11-00-00-000Z__я.mdx',
      '2026-08-04T10-00-00-000Z__claude.mdx',
    ]);

    expect(версии.map((версия) => версия.author)).toEqual(['claude', 'я']);
  });

  it('посторонний файл в папке снимков в ленту не попадает и её не роняет', () => {
    const версии = версииИзИмён(['заметка.txt', '2026-08-04T10-00-00-000Z__я.mdx', '.DS_Store']);

    expect(версии).toHaveLength(1);
  });

  it('имя с негодным временем в ленту не попадает', () => {
    // Иначе отметка встала бы в ленте неизвестно куда: порядок держится на времени.
    expect(версииИзИмён(['не-время__я.mdx'])).toEqual([]);
  });
});
