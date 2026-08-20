// Имя каждого теста повторяет формулировку правила.
// Ручка начала языковой версии: пишет два файла целиком или не пишет ничего.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {localeRoute} from '../src/adapters/localeRoute.mjs';
import {ES, EN, RU, НАСТРОЙКИ} from './newArticleHarness.mjs';

const СТАТЬЯ = `${RU}/lessons/uskorit-revit/index.mdx`;
const НАСТРОЙКИ_РУЧКИ = {
  ...НАСТРОЙКИ,
  хранение: {файлСостояния: '_state.json', папкаЧерновиков: '.drafts', папкаСнимков: '.history', снимковНаВерсию: 5},
  реестр: {неизвестныйАвтор: 'Неизвестный'},
  ошибкиСервера: {плохойЗапрос: 'неверный запрос', неПутьСтатьи: 'это не файл статьи', нетФайла: 'нет файла'},
  ошибкиСоздания: {
    путьЗанят: 'здесь уже есть статья',
    неЗаписалось: 'не удалось записать',
    нетЯзыкаВРазделе: 'такого языка в разделе нет',
    нетШаблонаЗаглушки: 'нет текста заглушки',
    локальУжеЕсть: 'эта версия уже есть',
    неПутьСтатьи: 'это не файл статьи',
    нетНазвания: 'нет названия',
    нетАдреса: 'нет адреса',
    адресЗанят: 'этот адрес уже занят',
  },
};

const песочницы = [];

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Репозиторий с русской статьёй и её английской заглушкой. Испанской версии нет вовсе. */
function репозиторий() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-locale-'));
  песочницы.push(repo);

  fs.mkdirSync(path.join(repo, RU, 'lessons/uskorit-revit'), {recursive: true});
  fs.writeFileSync(
    path.join(repo, RU, 'lessons/uskorit-revit/index.mdx'),
    '---\ntitle: "Как ускорить Revit"\nslug: /lessons/uskorit-revit\n---\n\nтекст статьи\n',
    'utf8',
  );
  fs.mkdirSync(path.join(repo, EN, 'lessons/uskorit-revit'), {recursive: true});
  fs.writeFileSync(
    path.join(repo, EN, 'lessons/uskorit-revit/index.mdx'),
    '---\ntitle: "Translation placeholder: Как ускорить Revit"\nslug: /lessons/uskorit-revit\nunlisted: true\n---\n\nPlaceholder.\n',
    'utf8',
  );
  return repo;
}

async function запрос(repo, тело) {
  const ответ = {};
  const принято = await localeRoute({
    req: {method: 'POST'},
    res: {},
    url: new URL('http://localhost/api/article/locale'),
    repo,
    editorDir: path.join(repo, 'editor'),
    settings: НАСТРОЙКИ_РУЧКИ,
    git: {raw: async () => 'Кто-то <кто@то>'},
    тело: async () => тело,
    send: (res, code, data) => {
      ответ.code = code;
      ответ.data = data;
    },
  });

  return {принято, ...ответ};
}

const есть = (repo, rel) => fs.existsSync(path.join(repo, rel));

describe('начало языковой версии через ручку', () => {
  it('версия и её состояние появляются вместе, и окно получает путь новой версии', async () => {
    const repo = репозиторий();

    const ответ = await запрос(repo, {path: СТАТЬЯ, локаль: 'es'});

    expect(ответ.code).toBe(200);
    expect(ответ.data.path).toBe(`${ES}/lessons/uskorit-revit/index.mdx`);
    expect(есть(repo, `${ES}/lessons/uskorit-revit/index.mdx`)).toBe(true);
    expect(есть(repo, `${ES}/lessons/uskorit-revit/_state.json`)).toBe(true);
  });

  it('раздела в этом языке нет вовсе — папка создаётся вместе с версией, а не отказ', async () => {
    // Так живут «Семейства» и «Справка», которых в испанской папке нет. Сборка сайта такую папку
    // принимает: со скрытой заглушкой она уже не пустая (проверено сборкой 2026-08-20).
    const repo = репозиторий();
    expect(есть(repo, ES)).toBe(false);

    const ответ = await запрос(repo, {path: СТАТЬЯ, локаль: 'es'});

    expect(ответ.code).toBe(200);
    expect(есть(repo, `${ES}/lessons/uskorit-revit/index.mdx`)).toBe(true);
  });

  it('исходная версия и соседние языки не переписываются ни на байт', async () => {
    const repo = репозиторий();
    const было = [СТАТЬЯ, `${EN}/lessons/uskorit-revit/index.mdx`]
      .map((rel) => fs.readFileSync(path.join(repo, rel), 'utf8'));

    await запрос(repo, {path: СТАТЬЯ, локаль: 'es'});

    const стало = [СТАТЬЯ, `${EN}/lessons/uskorit-revit/index.mdx`]
      .map((rel) => fs.readFileSync(path.join(repo, rel), 'utf8'));
    expect(стало).toEqual(было);
  });

  it('версия уже есть — 409 и ни одного тронутого файла', async () => {
    const repo = репозиторий();
    const было = fs.readFileSync(path.join(repo, EN, 'lessons/uskorit-revit/index.mdx'), 'utf8');

    const ответ = await запрос(repo, {path: СТАТЬЯ, локаль: 'en'});

    expect(ответ.code).toBe(409);
    expect(fs.readFileSync(path.join(repo, EN, 'lessons/uskorit-revit/index.mdx'), 'utf8')).toBe(было);
  });

  it('путь не файл статьи сайта — плохой запрос, а не запись куда попало', async () => {
    const repo = репозиторий();

    for (const плохой of ['../../etc/passwd', 'README.md', `${RU}/lessons/uskorit-revit/img-01.png`]) {
      const ответ = await запрос(repo, {path: плохой, локаль: 'es'});
      expect(ответ.code).toBe(400);
    }
    expect(есть(repo, ES)).toBe(false);
  });

  it('статья исчезла, пока окно было открыто, — 404, а не создание версии сироты', async () => {
    const repo = репозиторий();
    fs.rmSync(path.join(repo, СТАТЬЯ));

    const ответ = await запрос(repo, {path: СТАТЬЯ, локаль: 'es'});

    expect(ответ.code).toBe(404);
    expect(есть(repo, ES)).toBe(false);
  });

  it('запись оборвалась на состоянии — файла версии тоже не остаётся', async () => {
    // Версия без состояния — половина работы: реестр покажет автором «Неизвестный» у статьи,
    // которую человек только что начал сам, а убрать половину ему нечем.
    const repo = репозиторий();
    const настоящая = fs.writeFileSync;
    let записей = 0;
    const шпион = vi.spyOn(fs, 'writeFileSync').mockImplementation((цель, данные, настройки) => {
      записей += 1;
      if (записей !== 2) return настоящая(цель, данные, настройки);
      настоящая(цель, String(данные).slice(0, 5), настройки);
      throw new Error('место на диске кончилось');
    });

    const ответ = await запрос(repo, {path: СТАТЬЯ, локаль: 'es'});

    шпион.mockRestore();
    expect(ответ.code).toBe(500);
    expect(есть(repo, `${ES}/lessons/uskorit-revit/index.mdx`)).toBe(false);
    expect(есть(repo, `${ES}/lessons/uskorit-revit/_state.json`)).toBe(false);
    expect(есть(repo, `${ES}/lessons/uskorit-revit`)).toBe(false);
  });

  it('живая статья с названием, похожим на пометку заглушки, названия не теряет', async () => {
    // Пометка снимается только у настоящей заглушки — той, чьё тело написала сама программа.
    // Суди по одному заголовку — и статья «Translation placeholder: patterns» стала бы «patterns».
    const repo = репозиторий();
    fs.writeFileSync(
      path.join(repo, RU, 'lessons/uskorit-revit/index.mdx'),
      [
        '---',
        'title: "Translation placeholder: patterns in UI"',
        'slug: /lessons/uskorit-revit',
        '---',
        '',
        'настоящая статья',
        '',
      ].join(String.fromCharCode(10)),
      'utf8',
    );

    await запрос(repo, {path: СТАТЬЯ, локаль: 'es'});

    const созданная = fs.readFileSync(path.join(repo, ES, 'lessons/uskorit-revit/index.mdx'), 'utf8');
    expect(созданная).toContain('Marcador de traducción: Translation placeholder: patterns in UI');
  });

  it('файл возник между проверкой и записью — это конфликт, а не внутренняя ошибка', async () => {
    // Так выглядит второй такой же запрос, успевший создать версию первым. Человеку надо сказать
    // «версия уже есть», а не «не записалось»: во втором случае он будет искать поломку.
    const repo = репозиторий();
    const настоящий = fs.openSync;
    const шпион = vi.spyOn(fs, 'openSync').mockImplementation((цель, флаги) => {
      // Пока мы собирались писать, файл появился на диске.
      if (String(цель).endsWith('index.mdx')) {
        fs.mkdirSync(path.dirname(String(цель)), {recursive: true});
        настоящий(String(цель), 'w');
        const беда = new Error('EEXIST');
        беда.code = 'EEXIST';
        беда.path = String(цель);
        throw беда;
      }
      return настоящий(цель, флаги);
    });

    const ответ = await запрос(repo, {path: СТАТЬЯ, локаль: 'es'});

    шпион.mockRestore();
    expect(ответ.code).toBe(409);
    expect(ответ.data.причина).toBe('путьЗанят');
  });

  it('адрес уже занят другой статьёй этого языка — отказ, а не красная сборка сайта', async () => {
    // Две страницы с одним адресом сайт не соберёт вовсе, а убрать ошибочно начатую версию
    // человеку сегодня нечем. Правило и его карта общие с созданием статьи.
    const repo = репозиторий();
    fs.mkdirSync(path.join(repo, ES, 'lessons/drugaya'), {recursive: true});
    fs.writeFileSync(
      path.join(repo, ES, 'lessons/drugaya/index.mdx'),
      ['---', 'title: "Otra"', 'slug: /lessons/uskorit-revit', '---', '', 'texto', ''].join(String.fromCharCode(10)),
      'utf8',
    );

    const ответ = await запрос(repo, {path: СТАТЬЯ, локаль: 'es'});

    expect(ответ.code).toBe(409);
    expect(ответ.data.причина).toBe('адресЗанят');
    expect(есть(repo, `${ES}/lessons/uskorit-revit/index.mdx`)).toBe(false);
  });

  it('тот же адрес в ДРУГОМ языке конфликтом не считается: языковые версии его и делят', async () => {
    // Иначе начать версию было бы нельзя вовсе: адрес у всех языков статьи общий по правилу.
    const repo = репозиторий();

    const ответ = await запрос(repo, {path: СТАТЬЯ, локаль: 'es'});

    expect(ответ.code).toBe(200);
  });

  it('чужой запрос ручка не берёт на себя', async () => {
    const repo = репозиторий();
    const принято = await localeRoute({
      req: {method: 'POST'},
      res: {},
      url: new URL('http://localhost/api/article/new'),
      repo,
      settings: НАСТРОЙКИ_РУЧКИ,
      тело: async () => ({}),
      send: () => {},
    });

    expect(принято).toBe(false);
  });
});
