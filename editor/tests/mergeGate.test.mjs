// Имя каждого теста повторяет формулировку правила.
// Дверь «сверься с диском»: доказанная база, последняя сверка перед записью и разрешение спора.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {conflictRoute} from '../src/adapters/conflictRoute.mjs';
import {записатьСпор, прочитатьСпор} from '../src/adapters/conflictStore.mjs';
import {записатьСверив, найтиБазу} from '../src/adapters/mergeGate.mjs';
import {fingerprint, loadDraft, saveDraft, saveSnapshot} from '../src/adapters/draftStore.mjs';
import {newDraft, readDraft, writeDraft} from '../src/core/drafts.mjs';
import {спорЦеликом} from '../src/core/mergeArticle.mjs';

const НАСТРОЙКИ = {
  хранение: {
    папкаЧерновиков: '.drafts', папкаСпоров: '.drafts-споры', папкаСнимков: '.history',
    папкаСведения: '.сведение', черновикЖивётДней: 14, снимковНаВерсию: 50,
  },
  ошибкиСервера: {плохойЗапрос: 'неверный запрос', неверныйАдрес: 'неверный адрес', нетСпора: 'нет расхождения', спорНеЗаписан: 'стороны не записаны'},
};

const REL = 'docs/a/index.mdx';
const пара = (шапка, тело) => ({frontmatterRaw: шапка, body: тело});

const песочницы = [];
afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

function песочница() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-merge-'));
  песочницы.push(dir);
  fs.mkdirSync(path.join(dir, path.dirname(REL)), {recursive: true});
  return dir;
}

describe('база берётся только доказанная', () => {
  it('база лежит в самом черновике — она и берётся', async () => {
    const repo = песочница();
    const база = пара('title: A', '\nбыло\n');
    saveDraft(repo, НАСТРОЙКИ, newDraft({
      path: REL, ...пара('title: A', '\nстало\n'), отпечатокБазы: 'ОТП', когда: new Date().toISOString(), база,
    }));

    const найдено = await найтиБазу({
      repo, settings: НАСТРОЙКИ, rel: REL, отпечатокБазы: 'ОТП',
      черновик: loadDraft(repo, НАСТРОЙКИ, REL),
    });

    expect(найдено).toEqual(база);
  });

  it('базы в черновике нет — берётся снимок с тем же отпечатком', async () => {
    const repo = песочница();
    const текст = '---\ntitle: A\n---\n\nбыло\n';
    saveSnapshot(repo, НАСТРОЙКИ, REL, текст, 'Клод', new Date().toISOString());

    const найдено = await найтиБазу({
      repo, settings: НАСТРОЙКИ, rel: REL, отпечатокБазы: fingerprint(текст), черновик: null,
    });

    expect(найдено).toEqual(пара('title: A', '\nбыло\n'));
  });

  it('своих доказательств нет — берётся файл опубликованной ветки с тем же отпечатком', async () => {
    const repo = песочница();
    const текст = '---\ntitle: A\n---\n\nиз ветки\n';
    const git = {show: async () => текст};

    const найдено = await найтиБазу({
      repo, settings: НАСТРОЙКИ, rel: REL, отпечатокБазы: fingerprint(текст), черновик: null, git, ref: 'main',
    });

    expect(найдено).toEqual(пара('title: A', '\nиз ветки\n'));
  });

  it('отпечаток не совпал ни с чем — базы нет, и текущий файл вместо неё не подставляется', async () => {
    const repo = песочница();
    saveSnapshot(repo, НАСТРОЙКИ, REL, '---\ntitle: A\n---\n\nдругое\n', 'Клод', new Date().toISOString());

    const найдено = await найтиБазу({
      repo, settings: НАСТРОЙКИ, rel: REL, отпечатокБазы: 'ЧУЖОЙ', черновик: null,
      git: {show: async () => '---\ntitle: A\n---\n\nещё одно\n'}, ref: 'main',
    });

    expect(найдено).toBeNull();
  });

  it('git недоступен — это не доказательство базы, а её отсутствие', async () => {
    const repo = песочница();
    const git = {show: async () => { throw new Error('нет ветки'); }};

    const найдено = await найтиБазу({
      repo, settings: НАСТРОЙКИ, rel: REL, отпечатокБазы: 'ОТП', черновик: null, git, ref: 'main',
    });

    expect(найдено).toBeNull();
  });
});

describe('последняя сверка перед заменой файла', () => {
  it('файл тот же, что был при сведении, — запись проходит', () => {
    const repo = песочница();
    const файл = path.join(repo, REL);
    fs.writeFileSync(файл, 'было', 'utf8');

    const записано = записатьСверив({file: файл, ожидаемыйОтпечаток: fingerprint('было'), текст: 'стало'});

    expect(записано).toBe(true);
    expect(fs.readFileSync(файл, 'utf8')).toBe('стало');
  });

  it('между сведением и записью файл успел смениться — поверх не пишем вовсе', () => {
    const repo = песочница();
    const файл = path.join(repo, REL);
    const ожидали = fingerprint('было');
    // Внешний ИИ успел записать своё уже после того, как программа свела стороны.
    fs.writeFileSync(файл, 'чужое новое', 'utf8');

    const записано = записатьСверив({file: файл, ожидаемыйОтпечаток: ожидали, текст: 'стало'});

    expect(записано).toBe(false);
    expect(fs.readFileSync(файл, 'utf8')).toBe('чужое новое');
  });
});

describe('черновик помнит базу и переживает прежнюю схему записи', () => {
  it('база записывается в черновик и читается обратно без потерь', () => {
    const база = пара('title: A', '\nбыло\n');
    const запись = writeDraft(newDraft({
      path: REL, ...пара('title: A', '\nстало\n'), отпечатокБазы: 'ОТП', когда: '2026-09-11T10:00:00.000Z', база,
    }));

    const прочитано = readDraft(запись);

    expect(прочитано['базаТело']).toBe('\nбыло\n');
    expect(прочитано['базаШапка']).toBe('title: A');
  });

  it('черновик прежней схемы без базы по-прежнему читается, а не считается битым', () => {
    const прежний = JSON.stringify({
      path: REL, когда: '2026-09-11T10:00:00.000Z', правкаОт: '2026-09-11T10:00:00.000Z',
      отпечатокБазы: 'ОТП', frontmatterRaw: 'title: A', body: '\nстарая работа\n',
    });

    expect(readDraft(прежний)['body']).toBe('\nстарая работа\n');
  });
});

describe('разрешение спора человеком', () => {
  /** Один запрос к ручке разрешения. */
  async function решить(repo, ответы) {
    const ответ = {};
    await conflictRoute({
      req: {method: 'POST'},
      res: {},
      url: {pathname: '/api/article/conflict'},
      repo,
      settings: НАСТРОЙКИ,
      тело: async () => ({path: REL, ответы}),
      insideRepo: () => true,
      send: (_res, code, data) => Object.assign(ответ, {code, data}),
      последняяПравка: new Map(),
    });
    return ответ;
  }

  /** Отложенный спор из двух сторон целиком: так выглядит расхождение без доказанной базы. */
  function отложить(repo) {
    const мои = пара('title: МОЁ', '\nмой текст\n');
    const внешние = пара('title: ВНЕШНЕЕ', '\nвнешний текст\n');
    записатьСпор(repo, НАСТРОЙКИ, {
      path: REL, когда: '2026-09-11T10:00:00.000Z', вид: 'безБазы', отпечатокВнешней: 'ОТП-ВНЕШНЕЙ',
      база: null, мои, внешние, части: спорЦеликом(мои, внешние), спорные: [],
    });
  }

  it('выбранные стороны собираются в работу человека с базой из внешней версии', async () => {
    const repo = песочница();
    отложить(repo);

    const ответ = await решить(repo, [
      {место: 'тело', номер: 0, сторона: 'внешние'},
      {место: 'шапка', номер: 0, сторона: 'мои'},
    ]);

    expect(ответ.code).toBe(200);
    expect(ответ.data['решено']).toEqual(пара('title: МОЁ', '\nвнешний текст\n'));

    const черновик = loadDraft(repo, НАСТРОЙКИ, REL);
    expect(черновик['body']).toBe('\nвнешний текст\n');
    expect(черновик['отпечатокБазы']).toBe('ОТП-ВНЕШНЕЙ');
    expect(черновик['базаТело']).toBe('\nвнешний текст\n');
  });

  it('после ответа человека спор убирается, и версия перестаёт его показывать', async () => {
    const repo = песочница();
    отложить(repo);

    await решить(repo, [
      {место: 'тело', номер: 0, сторона: 'мои'},
      {место: 'шапка', номер: 0, сторона: 'мои'},
    ]);

    expect(прочитатьСпор(repo, НАСТРОЙКИ, REL)).toBeNull();
  });

  it('ответа хватило не на каждое место — отказ, и спор остаётся нетронутым', async () => {
    const repo = песочница();
    отложить(repo);

    const ответ = await решить(repo, [{место: 'тело', номер: 0, сторона: 'мои'}]);

    expect(ответ.code).toBe(400);
    expect(прочитатьСпор(repo, НАСТРОЙКИ, REL)).not.toBeNull();
    expect(loadDraft(repo, НАСТРОЙКИ, REL)).toBeNull();
  });

  it('спора у версии нет — решать нечего, и ручка говорит об этом прямо', async () => {
    const ответ = await решить(песочница(), []);

    expect(ответ.code).toBe(404);
    expect(ответ.data['error']).toBe('нет расхождения');
  });
});
