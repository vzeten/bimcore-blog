// Имя каждого теста повторяет формулировку правила.
import {describe, expect, it} from 'vitest';
import {draftDecision, draftName, extraSnapshots, newDraft, readDraft, writeDraft} from '../src/core/drafts.mjs';

const НАСТРОЙКИ = {хранение: {черновикЖивётДней: 14, снимковНаВерсию: 3}};
const ФАЙЛ = {frontmatterRaw: 'title: A', body: 'текст файла'};
const СЕЙЧАС = '2026-08-04T12:00:00.000Z';

const черновик = (over = {}) => newDraft({
  path: 'docs/a/index.mdx',
  frontmatterRaw: 'title: A',
  body: 'текст черновика',
  отпечатокБазы: 'ОТП1',
  когда: '2026-08-04T11:59:00.000Z',
  ...over,
});

describe('черновик автосохранения', () => {
  it('черновик переживает запись и чтение без потерь', () => {
    const back = readDraft(writeDraft(черновик()));

    expect(back.body).toBe('текст черновика');
    expect(back.отпечатокБазы).toBe('ОТП1');
  });

  it('битый файл черновика игнорируется и не роняет программу', () => {
    expect(readDraft('это не json')).toBeNull();
    expect(readDraft('')).toBeNull();
    expect(readDraft(undefined)).toBeNull();
    expect(readDraft('{"нет":"тела"}')).toBeNull();
  });

  it('черновик с недостающим полем считается битым, а не продолжением работы', () => {
    // Без шапки или отпечатка черновик дал бы пустую шапку и сравнение с пустым отпечатком.
    const целый = JSON.parse(writeDraft(черновик()));

    for (const поле of ['path', 'когда', 'отпечатокБазы', 'frontmatterRaw', 'body']) {
      const неполный = {...целый};
      delete неполный[поле];
      expect(readDraft(JSON.stringify(неполный)), поле).toBeNull();
    }
  });

  it('черновики разных статей лежат в разных файлах', () => {
    expect(draftName('docs/a/index.mdx')).not.toBe(draftName('i18n/ru/docs/a/index.mdx'));
    expect(draftName('docs/a/index.mdx')).not.toContain('/');
  });
});

describe('что открывать при повторном заходе в статью', () => {
  it('повторное открытие берёт свежий автосохранённый черновик', () => {
    const решение = draftDecision({
      draft: черновик(), файл: ФАЙЛ, отпечатокФайла: 'ОТП1', сейчас: СЕЙЧАС, settings: НАСТРОЙКИ,
    });

    expect(решение).toBe('черновик');
  });

  it('файл изменился снаружи после автосохранения — конфликт, а не молчаливая подмена', () => {
    const решение = draftDecision({
      draft: черновик(), файл: ФАЙЛ, отпечатокФайла: 'ДРУГОЙ', сейчас: СЕЙЧАС, settings: НАСТРОЙКИ,
    });

    expect(решение).toBe('конфликт');
  });

  it('черновика нет — открывается файл', () => {
    expect(draftDecision({
      draft: null, файл: ФАЙЛ, отпечатокФайла: 'ОТП1', сейчас: СЕЙЧАС, settings: НАСТРОЙКИ,
    })).toBe('нет');
  });

  it('черновик слово в слово совпадает с файлом — предлагать нечего', () => {
    const такойЖе = черновик({body: ФАЙЛ.body, frontmatterRaw: ФАЙЛ.frontmatterRaw});

    expect(draftDecision({
      draft: такойЖе, файл: ФАЙЛ, отпечатокФайла: 'ОТП1', сейчас: СЕЙЧАС, settings: НАСТРОЙКИ,
    })).toBe('нет');
  });

  it('протухший черновик игнорируется', () => {
    const старый = черновик({когда: '2026-07-01T10:00:00.000Z'});

    expect(draftDecision({
      draft: старый, файл: ФАЙЛ, отпечатокФайла: 'ОТП1', сейчас: СЕЙЧАС, settings: НАСТРОЙКИ,
    })).toBe('нет');
  });
});

describe('уборка снимков', () => {
  it('снимков остаётся не больше предела, лишние старые уходят', () => {
    const names = ['2026-08-01__я.mdx', '2026-08-02__я.mdx', '2026-08-03__я.mdx', '2026-08-04__я.mdx'];

    expect(extraSnapshots(names, 3)).toEqual(['2026-08-01__я.mdx']);
  });

  it('пока снимков меньше предела, удалять нечего', () => {
    expect(extraSnapshots(['2026-08-01__я.mdx'], 3)).toEqual([]);
  });
});

describe('гонка автосохранения с сохранением', () => {
  it('черновик, совпавший с файлом, не даёт конфликта даже со старым отпечатком', () => {
    // Так выглядит черновик, дописанный поздним запросом уже после сохранения:
    // отпечаток базы устарел, но текст совпадает с файлом — продолжать нечего.
    const поздний = черновик({body: ФАЙЛ.body, frontmatterRaw: ФАЙЛ.frontmatterRaw, отпечатокБазы: 'СТАРЫЙ'});

    expect(draftDecision({
      draft: поздний, файл: ФАЙЛ, отпечатокФайла: 'НОВЫЙ', сейчас: СЕЙЧАС, settings: НАСТРОЙКИ,
    })).toBe('нет');
  });
});
