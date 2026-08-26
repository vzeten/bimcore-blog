// Имя каждого теста повторяет формулировку правила.
//
// Ради чего эта проверка заведена: ход публикации первым шагом звал подготовку, а та собирала свод
// статей и читала ВСЕ языковые версии. Испорченный соседний перевод останавливал публикацию
// открытой локали, хотя по правилу владельца соседний перевод не влияет на решение о публикации
// ничем. Сквозная обвязка это прятала: там подготовка подставлена готовым успехом.
import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {prepareRoute} from '../src/adapters/prepareRoute.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
const EN = 'docs/lessons/proba/index.mdx';
const РАЗДЕЛ_RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/index.mdx';

const ШАПКА_RU = 'title: "Проба"\nslug: /lessons/proba\ndescription: "Понятное описание статьи"\nkeywords: [розетки]';
const ШАПКА_РАЗДЕЛА = 'title: "Уроки"\nslug: /lessons\ndescription: "Раздел уроков"';
const ШАПКА_ЗАПИСИ = 'title: "Запись"\ndescription: "Есть"';
const ШАПКА_ЗАГЛУШКИ = 'title: "Заглушка"\nslug: /lessons/proba\ndescription: ""\nunlisted: true';

const песочницы = [];

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Репозиторий с названными файлами: ключ — путь, значение — шапка. */
function среда(шапки) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-open-locale-'));
  песочницы.push(repo);

  for (const [rel, шапка] of Object.entries(шапки)) {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), `---\n${шапка}\n---\n\nТекст статьи.\n`, 'utf8');
  }

  return repo;
}

/**
 * Один запрос к ручке. `articles` по умолчанию БРОСАЕТ: в режиме одной версии свод не должен
 * собираться вовсе, и подставленный успех скрыл бы как раз ту беду, ради которой заведён набор.
 */
async function запрос(repo, тело, articles = () => {
  throw new Error('свод статей в этом срезе собирать нельзя');
}) {
  const ответы = [];
  const взято = await prepareRoute({
    req: {method: 'POST'},
    res: {},
    url: {pathname: '/api/prepare'},
    repo,
    settings: НАСТРОЙКИ,
    тело: async () => тело,
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, status, payload) => ответы.push({status, payload}),
    articles: async () => articles(),
  });

  return {взято, ...(ответы[0] ?? {})};
}

describe('подготовка в ходе публикации: только открытая локаль', () => {
  it('испорченный соседний перевод не останавливает публикацию открытой версии', async () => {
    // У английской версии пустое описание — при полной подготовке это блокер.
    const repo = среда({
      [RU]: ШАПКА_RU,
      [EN]: 'title: "Заглушка"\nslug: /lessons/proba\ndescription: ""\nunlisted: true',
    });

    const {status, payload} = await запрос(repo, {path: RU, толькоОткрытая: true});

    expect(status).toBe(200);
    expect(payload.прошла).toBe(true);
    // Ни одна находка не говорит о соседе: его файл не читался вовсе.
    expect(payload.находки.filter((находка) => находка.путь === EN)).toEqual([]);
  });

  it('свод статей в этом срезе не собирается: он открыл бы каждую статью репозитория', async () => {
    const repo = среда({[RU]: ШАПКА_RU, [EN]: 'title: "Заглушка"\nslug: /lessons/proba\ndescription: "Есть"'});

    // `articles` по умолчанию бросает: дошёл бы до него код — проверка упала бы ошибкой.
    const {status, payload} = await запрос(repo, {path: RU, толькоОткрытая: true});

    expect(status).toBe(200);
    expect(payload.прошла).toBe(true);
  });

  it('отсутствие обязательного языка на диске не мешает публикации открытой версии', async () => {
    // Английской версии нет вовсе: по новому правилу её место на сайте закрывает заглушка в плане.
    const repo = среда({[RU]: ШАПКА_RU});

    const {payload} = await запрос(repo, {path: RU, толькоОткрытая: true});

    expect(payload.находки.some((находка) => находка.код === 'нетОбязательнойВерсии')).toBe(false);
    expect(payload.прошла).toBe(true);
  });

  it('невыполненный этап состава назван человеку, а не пропущен молча', async () => {
    const repo = среда({[RU]: ШАПКА_RU});

    const {payload} = await запрос(repo, {path: RU, толькоОткрытая: true});

    expect(payload.невыполненные).toEqual(['составСтатьи', 'качество', 'сборка']);
    // У этапа есть своё слово человеку: иначе окно показало бы код.
    expect(НАСТРОЙКИ['подготовка']['этапы']['составСтатьи']).toBeTruthy();
  });

  it('пустой адрес самой открытой версии остаётся блокером', async () => {
    const repo = среда({[RU]: 'title: "Проба"\nslug:\ndescription: "Понятное описание"\nkeywords: [розетки]'});

    const {payload} = await запрос(repo, {path: RU, толькоОткрытая: true});

    expect(payload.находки.some((н) => н.код === 'адресПуст' && н.уровень === 'блокер')).toBe(true);
    expect(payload.прошла).toBe(false);
  });

  it('пустое описание самой открытой версии остаётся блокером', async () => {
    const repo = среда({[RU]: 'title: "Проба"\nslug: /lessons/proba\ndescription: ""\nkeywords: [розетки]'});

    const {payload} = await запрос(repo, {path: RU, толькоОткрытая: true});

    expect(payload.находки.some((н) => н.код === 'описаниеПусто' && н.путь === RU)).toBe(true);
    expect(payload.прошла).toBe(false);
  });

  it('у страницы раздела остаётся её собственная категория: ключевых слов с неё не спрашивают', async () => {
    // Под страницей раздела лежит статья — этим она и служебная. Категория по пути была бы «урок»,
    // а у урока ключевые слова просят.
    const repo = среда({
      [РАЗДЕЛ_RU]: 'title: "Уроки"\nslug: /lessons\ndescription: "Раздел уроков"',
      [RU]: ШАПКА_RU,
    });

    const {payload} = await запрос(repo, {path: РАЗДЕЛ_RU, толькоОткрытая: true});

    expect(payload.находки.some((находка) => находка.поле === 'keywords')).toBe(false);
  });

  it('обычная статья категорию по пути сохраняет: у урока ключевые слова спрашиваются', async () => {
    const repo = среда({[RU]: 'title: "Проба"\nslug: /lessons/proba\ndescription: "Понятное описание"'});

    const {payload} = await запрос(repo, {path: RU, толькоОткрытая: true});

    const просят = payload.находки.some((н) => н.код === 'полеКатегорииПусто' && н.поле === 'keywords');
    expect(просят).toBe(true);
  });

  it('дочерняя статья, живущая только в чужой локали, категорию открытой версии не меняет', async () => {
    // Русской страницы раздела дети есть только в английском дереве. Прежде их наличие делало
    // русскую версию страницей раздела — сосед решал за открытую локаль, не будучи прочитанным.
    const repo = среда({
      [РАЗДЕЛ_RU]: ШАПКА_РАЗДЕЛА,
      [EN]: ШАПКА_RU,
    });

    const {payload} = await запрос(repo, {path: РАЗДЕЛ_RU, толькоОткрытая: true});

    // Категория обычной статьи: ключевые слова просят предупреждением, а не молчат по-служебному.
    const просят = payload.находки.some((н) => н.код === 'полеКатегорииПусто' && н.поле === 'keywords');
    expect(просят).toBe(true);
    expect(payload.прошла).toBe(true);
  });

  it('дочерняя статья своей локали и своего рода служебную категорию сохраняет', async () => {
    const repo = среда({
      [РАЗДЕЛ_RU]: ШАПКА_РАЗДЕЛА,
      [RU]: ШАПКА_RU,
      // Блог той же локали на документацию влиять не должен: род другой.
      'i18n/ru/docusaurus-plugin-content-blog/zapis/index.mdx': ШАПКА_ЗАПИСИ,
    });

    const {payload} = await запрос(repo, {path: РАЗДЕЛ_RU, толькоОткрытая: true});

    expect(payload.находки.some((находка) => находка.поле === 'keywords')).toBe(false);
  });

  it('чужая локаль настроек в этом срезе не обходится вовсе', async () => {
    // Испанское дерево кладём на место, где обход по нему сразу виден: дочерняя статья раздела.
    const repo = среда({
      [РАЗДЕЛ_RU]: ШАПКА_РАЗДЕЛА,
      'i18n/es/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx': ШАПКА_RU,
    });

    const {payload} = await запрос(repo, {path: РАЗДЕЛ_RU, толькоОткрытая: true});

    const просят = payload.находки.some((н) => н.код === 'полеКатегорииПусто' && н.поле === 'keywords');
    expect(просят).toBe(true);
  });

  it('отдельный шаг «Что мешает выпуску» по-прежнему видит статью целиком', async () => {
    const repo = среда({
      [RU]: ШАПКА_RU,
      [EN]: ШАПКА_ЗАГЛУШКИ,
    });
    const свод = () => [{category: 'урок', наСайте: true, versions: {ru: {path: RU}, en: {path: EN}}}];

    const {payload} = await запрос(repo, {path: RU}, свод);

    expect(payload.находки.some((находка) => находка.путь === EN)).toBe(true);
    expect(payload.невыполненные).toEqual(['качество', 'сборка']);
  });

  it('признак включается только точным «да»: чужое значение проверок не снимает', async () => {
    const repo = среда({
      [RU]: ШАПКА_RU,
      [EN]: 'title: "Заглушка"\nslug: /lessons/proba\ndescription: ""\nunlisted: true',
    });
    const свод = () => [{
      category: 'урок',
      наСайте: true,
      versions: {ru: {path: RU}, en: {path: EN}},
    }];

    const {payload} = await запрос(repo, {path: RU, толькоОткрытая: 'да'}, свод);

    // Полная подготовка: сосед прочитан, его пустое описание названо.
    expect(payload.находки.some((находка) => находка.путь === EN)).toBe(true);
    expect(payload.невыполненные).toEqual(['качество', 'сборка']);
  });

  it('путь не статьи в этом срезе получает «нет такой статьи», а не зелёный вердикт', async () => {
    const repo = среда({[RU]: ШАПКА_RU});
    fs.writeFileSync(path.join(repo, 'заметка.txt'), 'текст', 'utf8');

    const {status, payload} = await запрос(repo, {path: 'заметка.txt', толькоОткрытая: true});

    expect(status).toBe(404);
    expect(payload.error).toBe(НАСТРОЙКИ['ошибкиСервера']['нетСтатьи']);
  });
});
