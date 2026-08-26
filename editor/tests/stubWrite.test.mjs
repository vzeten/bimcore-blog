// Имя каждого теста повторяет формулировку правила.
//
// Ради чего набор заведён: обрыв питания внутри записи заглушки оставлял половину файла прямо по её
// настоящему адресу, а следующее восстановление считало путь целым — оно смотрело только на то, что
// там лежит обычный файл. Сверять байты с коммитом взамен нельзя: между записью и отправкой человек
// законно правит опубликованную заглушку, начиная перевод.
import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {времянкаВосстановления, положитьЕслиНет} from '../src/adapters/publishRepair.mjs';
import {запомнитьСборку} from '../src/adapters/buildMemory.mjs';
import {отпустить} from '../src/adapters/publishLock.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {EN, ES, RU, СТАТЬЯ, среда, убратьПесочницы, настройкиСервера} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});

afterEach(() => {
  запомнитьСборку(null);
  отпустить();
  убратьПесочницы();
});

/** Где программа пишет байты до их появления по настоящему адресу: вне содержимого сайта. */
const времянка = (место) => времянкаВосстановления(место.editorDir, настройкиСервера());

// Обрыв питания внутри записи прежде оставлял половину заглушки прямо по её настоящему адресу, и
// следующее восстановление считало путь целым: оно смотрело только на то, что там обычный файл.
describe('заглушка появляется целиком или не появляется вовсе', () => {
  it('байты не пишутся по настоящему адресу: до появления файла они лежат вне содержимого сайта', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    fs.rmSync(path.join(место.repo, ES), {force: true});

    expect(положитьЕслиНет(место.repo, ES, Buffer.from('текст\n', 'utf8'), времянка(место))).toBe(true);

    // Времянка лежит в служебной папке программы, а не в папке статьи: попади она туда, состав
    // публикации счёл бы её картинкой человека и увёз бы на сайт.
    expect(времянка(место).startsWith(место.editorDir)).toBe(true);
    expect(времянка(место).startsWith(место.repo)).toBe(false);
    // За собой программа убирает: временного файла после удачной записи не остаётся.
    expect(fs.existsSync(времянка(место)) ? fs.readdirSync(времянка(место)) : []).toEqual([]);
    // В папке статьи ровно её файлы, ничего служебного.
    const рядом = fs.readdirSync(path.dirname(path.join(место.repo, ES)));
    expect(рядом).toEqual(['index.mdx']);
  });

  it('мусор, оставшийся во времянке от прошлого обрыва, следующей записи не мешает', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    fs.rmSync(path.join(место.repo, ES), {force: true});
    // Так выглядит обрыв питания ДО появления ссылки: половина файла осталась во времянке.
    fs.mkdirSync(времянка(место), {recursive: true});
    fs.writeFileSync(path.join(времянка(место), `заглушка-${process.pid}`), 'полов', 'utf8');

    expect(положитьЕслиНет(место.repo, ES, Buffer.from('целый текст\n', 'utf8'), времянка(место))).toBe(true);

    expect(fs.readFileSync(path.join(место.repo, ES), 'utf8')).toBe('целый текст\n');
  });

  it('файл, появившийся у человека между проверкой и записью, не затирается', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    fs.mkdirSync(path.dirname(path.join(место.repo, ES)), {recursive: true});
    fs.writeFileSync(path.join(место.repo, ES), 'работа человека\n', 'utf8');

    // Путь занят обычным файлом — это успех восстановления, но чужие байты остаются на месте.
    expect(положитьЕслиНет(место.repo, ES, Buffer.from('наша заглушка\n', 'utf8'), времянка(место))).toBe(true);
    expect(fs.readFileSync(path.join(место.repo, ES), 'utf8')).toBe('работа человека\n');
  });

  it('не удалось положить байты — отказ, а не тихая запись прямо по адресу', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    fs.rmSync(path.join(место.repo, ES), {force: true});
    // На месте времянки лежит файл: папку там не создать, значит и писать некуда.
    const занято = path.join(место.editorDir, 'занято');
    fs.writeFileSync(занято, 'не папка', 'utf8');

    expect(положитьЕслиНет(место.repo, ES, Buffer.from('текст\n', 'utf8'), path.join(занято, 'внутрь'))).toBe(false);
    // Возврата к прямой записи нет: по настоящему адресу не появилось ничего.
    expect(fs.existsSync(path.join(место.repo, ES))).toBe(false);
  });

  it('жёсткая ссылка не поддержана — отказ, и прямой записи по адресу не случается', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, {вКоммите: [RU, EN]});
    fs.rmSync(path.join(место.repo, ES), {force: true});
    // Так это выглядит на файловой системе без жёстких ссылок: байты записать удалось, связать нет.
    const ссылка = vi.spyOn(fs, 'linkSync').mockImplementation(() => {
      throw Object.assign(new Error('жёсткие ссылки не поддержаны'), {code: 'EPERM'});
    });

    try {
      expect(положитьЕслиНет(место.repo, ES, Buffer.from('текст\n', 'utf8'), времянка(место))).toBe(false);
    } finally {
      ссылка.mockRestore();
    }

    // Отката к прямой записи нет: по настоящему адресу не появилось ничего, и времянка убрана.
    expect(fs.existsSync(path.join(место.repo, ES))).toBe(false);
    expect(fs.existsSync(времянка(место)) ? fs.readdirSync(времянка(место)) : []).toEqual([]);
  });
});
