// Имя каждого теста повторяет формулировку правила.
//
// Ради чего эта проверка заведена: у человека с `GIT_PAGER` в среде укладка плана публикации падала
// на первой же команде отдельного индекса (`read-tree`) — библиотека доступа к git отказывается
// запускаться, когда ей передали такую переменную. Публикация выглядела сломанной, хотя к
// постраничному просмотру отношения не имела.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {simpleGit} from 'simple-git';

import {ЗАПРЕЩЁННЫЕ, дверьGit, дверьИндекса, средаДляGit} from '../src/adapters/gitEnv.mjs';
import {деревоПлана} from '../src/adapters/gitCommit.mjs';
import {РЕЖИМ_ФАЙЛА} from '../src/core/publishPlan.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';

const песочницы = [];
const было = new Map();

afterEach(() => {
  for (const [ключ, значение] of было) {
    if (значение === undefined) delete process.env[ключ];
    else process.env[ключ] = значение;
  }
  было.clear();

  while (песочницы.length > 0) {
    try {
      fs.rmSync(песочницы.pop(), {recursive: true, force: true});
    } catch (ошибка) {
      console.error(ошибка);
    }
  }
});

/** Поставить переменную среды на время одной проверки: `afterEach` вернёт прежнее значение. */
function наВремя(ключ, значение) {
  if (!было.has(ключ)) было.set(ключ, process.env[ключ]);
  // Пустое значение и ОТСУТСТВИЕ переменной — разные вещи: git выбирает домашний каталог из пары
  // `HOMEDRIVE`+`HOMEPATH` только когда `HOME` не задан вовсе, а не когда он пуст.
  if (значение === undefined) delete process.env[ключ];
  else process.env[ключ] = значение;
}

/** Путь для настроек git: обратная косая внутри одинарных кавычек читается как escape. */
const дляНастройки = (путь) => путь.split(path.sep).join('/');

/** Что лежит в голой копии сейчас. Ветки нет вовсе — `null`. */
async function вКопии(голая) {
  try {
    return (await simpleGit(голая).raw(['rev-parse', 'refs/heads/main'])).trim();
  } catch {
    return null;
  }
}

/** Репозиторий с одним коммитом: на нём проверяется настоящая укладка плана. */
async function репозиторий(текст = 'текст') {
  const корень = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-gitenv-'));
  песочницы.push(корень);
  const repo = path.join(корень, 'работа');
  fs.mkdirSync(repo, {recursive: true});

  const git = simpleGit(repo);
  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Проверка');
  await git.addConfig('user.email', 'proverka@example.com');
  await git.addConfig('commit.gpgsign', 'false');
  fs.writeFileSync(path.join(repo, 'начало.txt'), `${текст}\n`, 'utf8');
  await git.raw(['add', '--', 'начало.txt']);
  await git.raw(['commit', '-m', 'начало']);

  return {корень, repo, git};
}

// Здесь зовётся настоящий git с отправкой во временные копии: пяти секунд умолчания под нагрузкой мало.
describe('среда для git', {timeout: ЖДАТЬ_GIT}, () => {
  it('переменная постраничного просмотра не мешает уложить план: укладка проходит с GIT_PAGER в среде', async () => {
    const {корень, repo, git} = await репозиторий();
    // Ровно та среда, на которой публикация падала у человека.
    наВремя('GIT_PAGER', 'less');
    наВремя('PAGER', 'less');
    наВремя('GIT_EDITOR', 'true');
    const голова = (await git.raw(['rev-parse', 'HEAD'])).trim();

    const дерево = await деревоПлана({
      repo,
      основа: голова,
      записи: [{путь: 'новый.txt', режим: РЕЖИМ_ФАЙЛА, байты: Buffer.from('строка\n', 'utf8')}],
      времянка: path.join(корень, 'времянка'),
      индексныйФайл: path.join(корень, 'индекс'),
    });

    expect(дерево).toMatch(/^[0-9a-f]{40}$/);
    // Дерево описывает оба файла: и прежний, и уложенный планом.
    const состав = (await git.raw(['-c', 'core.quotepath=false', 'ls-tree', '--name-only', дерево])).split(/\r?\n/).filter(Boolean);
    expect(состав.sort()).toEqual(['начало.txt', 'новый.txt']);
  });

  it('запрещённое имя убирается из среды независимо от регистра', () => {
    const среда = средаДляGit({PATH: '/usr/bin', Git_Pager: 'less', gIt_ExTeRnAl_DiFf: 'своя', ЕДА: 'борщ'});

    expect(среда).toEqual({PATH: '/usr/bin', ЕДА: 'борщ'});
  });

  it('в среде не остаётся ни одного имени из перечня запрещённых', () => {
    const грязная = Object.fromEntries(ЗАПРЕЩЁННЫЕ.map((ключ) => [ключ.toUpperCase(), 'что-нибудь']));

    const среда = средаДляGit({...грязная, PATH: '/usr/bin'});

    expect(Object.keys(среда)).toEqual(['PATH']);
  });

  it('чистка правит копию: среда самого процесса не меняется ни одним ключом', () => {
    наВремя('GIT_PAGER', 'less');

    средаДляGit();

    expect(process.env.GIT_PAGER).toBe('less');
  });

  it('унаследованный файл индекса вычёркивается: свой назначает только дверь укладки', () => {
    const среда = средаДляGit({PATH: '/usr/bin', GIT_INDEX_FILE: '/чужой/индекс', GIT_DIR: '/чужой/.git'});

    expect(среда.GIT_INDEX_FILE).toBeUndefined();
    expect(среда.GIT_DIR).toBeUndefined();
    expect(среда.PATH).toBe('/usr/bin');
  });

  it('имя места нельзя вернуть добавкой: общей добавки у двери нет вовсе', () => {
    // Дверь принимает только корень; вернуть `GIT_DIR` со стороны вызова нечем.
    expect(дверьGit.length).toBe(1);
    expect(() => дверьИндекса('/repo', 'относительный')).toThrow();
  });

  it('дверь программы работает при запрещённой переменной в среде процесса', async () => {
    const {repo, git} = await репозиторий();
    наВремя('GIT_PAGER', 'less');
    const голова = (await git.raw(['rev-parse', 'HEAD'])).trim();

    const ответ = (await дверьGit(repo).raw(['rev-parse', 'HEAD'])).trim();

    expect(ответ).toBe(голова);
  });

  it('переменная места не уводит дверь в чужой репозиторий', async () => {
    const свой = await репозиторий();
    const чужой = await репозиторий('другой текст');
    const головаСвоя = (await свой.git.raw(['rev-parse', 'HEAD'])).trim();
    const головаЧужая = (await чужой.git.raw(['rev-parse', 'HEAD'])).trim();
    expect(головаСвоя).not.toBe(головаЧужая);
    // Ровно так среда уводит все команды в другое хранилище.
    наВремя('GIT_DIR', path.join(чужой.repo, '.git'));
    наВремя('GIT_WORK_TREE', чужой.repo);

    const ответ = (await дверьGit(свой.repo).raw(['rev-parse', 'HEAD'])).trim();

    expect(ответ).toBe(головаСвоя);
  });

  it('готовые пары настроек убираются из среды: и общей строкой, и пронумерованные', () => {
    const среда = средаДляGit({
      PATH: '/usr/bin',
      GIT_CONFIG_PARAMETERS: "'remote.origin.pushurl=https://чужой/'",
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'remote.origin.pushurl',
      GIT_CONFIG_VALUE_0: 'https://чужой/',
      GIT_CONFIG_KEY_11: 'core.hooksPath',
      GIT_CONFIG_VALUE_11: '/чужие/крючки',
      GIT_CONFIG_NOSYSTEM: '1',
    });

    expect(Object.keys(среда)).toEqual(['PATH']);
  });

  it('подмена настроек через среду не уводит отправку по чужому адресу', async () => {
    const свой = await репозиторий();
    // Две голые копии: настоящий «сервер сайта» и чужой, куда работа уехать не должна.
    const наш = path.join(свой.корень, 'наш.git');
    const чужой = path.join(свой.корень, 'чужой.git');
    await simpleGit(свой.корень).raw(['init', '--bare', '--initial-branch=main', наш]);
    await simpleGit(свой.корень).raw(['init', '--bare', '--initial-branch=main', чужой]);
    await свой.git.raw(['remote', 'add', 'origin', наш]);
    const голова = (await свой.git.raw(['rev-parse', 'HEAD'])).trim();

    // Ровно так среда подменяет адрес отправки: git читает готовые пары настроек и ставит их выше
    // всех файлов. Программа при этом честно рапортует об успехе — работа просто уезжает не туда.
    наВремя('GIT_CONFIG_PARAMETERS', `'remote.origin.pushurl=${дляНастройки(чужой)}'`);

    // Сначала показываем, что дыра настоящая: без чистки среды работа уходит в чужую копию.
    await simpleGit(свой.repo).raw(['push', 'origin', 'main']);
    expect(await вКопии(чужой)).toBe(голова);
    expect(await вКопии(наш)).toBe(null);

    // А теперь дверь программы: тот же запуск, та же среда — и работа уходит по своему адресу.
    await simpleGit(чужой).raw(['update-ref', '-d', 'refs/heads/main']);
    await дверьGit(свой.repo).raw(['push', 'origin', 'main']);

    expect(await вКопии(наш)).toBe(голова);
    expect(await вКопии(чужой)).toBe(null);
  });

  it('из среды уходит ВЕСЬ git-именник, а не перечисленные имена', () => {
    // Прежде фильтр был чёрным списком, и он жил до первого имени, о котором забыли подумать:
    // `GIT_SSL_NO_VERIFY` снимает проверку сертификата при отправке, `GIT_SSL_CAINFO` подменяет
    // доверенные корни. Настроек команды они не подменяют и в перечень не попадали, зато открывают
    // дорогу чужому серверу под видом своего.
    const среда = средаДляGit({
      PATH: '/usr/bin',
      GIT_SSL_NO_VERIFY: '1',
      GIT_SSL_CAINFO: '/чужие/корни.pem',
      GIT_ЧЕГО_ТО_НОВОЕ: 'имя, которого ещё нет',
      git_строчными: 'регистр значения не имеет',
      ЕДА: 'борщ',
    });

    expect(среда).toEqual({PATH: '/usr/bin', ЕДА: 'борщ'});
  });

  it('пространства библиотек связи уходят целиком: git разговаривает с сайтом не сам', () => {
    // Git загружает в свой процесс libcurl и OpenSSL, и имена у них не на `GIT_`. Через настройку
    // OpenSSL в процесс грузится названный ею модуль — чужой код прямо внутри git; подменённые
    // корни доверия делают чужой сервер «правильным». Правило снова взято классом: имён у этих
    // библиотек много, и они пополняются.
    const среда = средаДляGit({
      PATH: '/usr/bin',
      OPENSSL_CONF: '/чужая/настройка.cnf',
      OPENSSL_MODULES: '/чужие/модули',
      openssl_чего_то_новое: 'имени ещё нет',
      SSL_CERT_FILE: '/чужие/корни.pem',
      SSL_CERT_DIR: '/чужие/корни',
      CURL_SSL_BACKEND: 'схема',
      CURL_CA_BUNDLE: '/чужой/пакет.pem',
      ЕДА: 'борщ',
    });

    expect(среда).toEqual({PATH: '/usr/bin', ЕДА: 'борщ'});
  });

  it('выгрузка секретов сеанса уходит, а посредник сети остаётся', () => {
    // Разные вещи, и обе вне git-именника. По `SSLKEYLOGFILE` библиотека связи выкладывает секреты
    // TLS в файл: отправка уходит куда надо и выглядит успешной, а перехваченный разговор с
    // сервером сайта потом расшифровывается целиком. Посредник же законен и без снятой проверки
    // сертификата сервер не подменяет — его вычёркивание сломало бы работу за корпоративной сетью.
    const среда = средаДляGit({
      PATH: '/usr/bin',
      HTTPS_PROXY: 'http://посредник:3128',
      NO_PROXY: 'localhost',
      SSLKEYLOGFILE: '/чужой/ключи.log',
      SslKeyLogFile: '/тот же файл другим регистром.log',
    });

    expect(среда.SSLKEYLOGFILE).toBeUndefined();
    expect(среда.SslKeyLogFile).toBeUndefined();
    expect(среда.HTTPS_PROXY).toBe('http://посредник:3128');
    expect(среда.NO_PROXY).toBe('localhost');
  });

  it('унаследованный файл индекса не подменяет индекс человека', async () => {
    const свой = await репозиторий();
    // Чужой индекс с СВОЕЙ записью: поверь ему программа — «индекс пуст» ответило бы неправду.
    const чужойИндекс = path.join(свой.корень, 'чужой.index');
    const своя = дверьИндекса(свой.repo, чужойИндекс);
    await своя.raw(['read-tree', 'HEAD']);
    fs.writeFileSync(path.join(свой.repo, 'подложенный.txt'), 'чужая работа\n', 'utf8');
    await своя.raw(['add', '--', 'подложенный.txt']);
    // В чужом индексе путь есть — значит подмена была бы видна.
    const вЧужом = await своя.raw(['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only']);
    expect(вЧужом).toContain('подложенный.txt');

    наВремя('GIT_INDEX_FILE', чужойИндекс);
    const вОбщем = await дверьGit(свой.repo).raw(['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only']);

    // Общая дверь чужого индекса не видит: настоящий индекс человека совпадает с головой.
    expect(вОбщем.trim()).toBe('');
    // А своя дверь продолжает работать ровно со своим назначенным индексом.
    const снова = await дверьИндекса(свой.repo, чужойИндекс)
      .raw(['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only']);
    expect(снова).toContain('подложенный.txt');
  });
});
