// Имя каждого теста повторяет формулировку правила.
//
// Обложка в ходе публикации: ход окна разговаривает с НАСТОЯЩИМИ ручками сервера и настоящим git во
// временном репозитории. Проверяется то, ради чего правило заведено (решение владельца 2026-09-16):
// статья с картинками не уходит на сайт без обложки, а файл и поле появляются ДО обязательных
// проверок — значит их видят и проверки, и состав, и сборка, и коммит.
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {проверитьИСобрать} from '../src/ui/publishRun';
import {запомнитьКоммит, запомнитьПоказ} from '../src/adapters/pushMemory.mjs';
import {запомнитьСборку} from '../src/adapters/buildMemory.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {GIF, jpg, png, подставнаяБиблиотека, сБиблиотекой} from './refineHarness.mjs';
import {EN, RU, СТАТЬЯ, дверь, поставитьОбложкуВФайл, среда, убратьПесочницы, ход} from './runHarness.mjs';

const ПАПКА = path.posix.dirname(EN);
const С_КАРТИНКОЙ = (картинка = 'img-01.png') => `${СТАТЬЯ}\n![Схема](./${картинка})\n`;
const РЕЗУЛЬТАТ = png(1000, 667, 8);
const ЛЕГЧЕ_PNG = () => подставнаяБиблиотека({png: РЕЗУЛЬТАТ, jpg: jpg(1000, 667, 400), ширина: 1200, высота: 800});

const обложка = (repo) => /^image: (.+)$/m.exec(fs.readFileSync(path.join(repo, EN), 'utf8'))?.[1] ?? null;
const новаяСтатья = (файлы) => среда({файлы: {[RU]: СТАТЬЯ, ...файлы}, вКоммите: [RU]});

beforeEach(() => {
  запомнитьСборку(null);
  запомнитьКоммит(null);
  запомнитьПоказ(null);
});

afterEach(() => {
  запомнитьСборку(null);
  запомнитьКоммит(null);
  запомнитьПоказ(null);
  убратьПесочницы();
});

describe('обложка в ходе публикации', () => {
  it('поле пусто, в тексте картинка — обложка ставится до проверок и уезжает в составе вместе со статьёй', async () => {
    const с = await новаяСтатья({[EN]: С_КАРТИНКОЙ(), [`${ПАПКА}/img-01.png`]: png(1200, 800)});
    сБиблиотекой(ЛЕГЧЕ_PNG());
    const записка = [];

    const вопрос = await проверитьИСобрать(EN, false, ход(дверь(с, записка), [], undefined, поставитьОбложкуВФайл(с.repo, EN)));

    expect(вопрос.вид).toBe('спрашиваю');
    expect(обложка(с.repo)).toMatch(/cover\.png/);
    expect(fs.readFileSync(path.join(с.repo, ПАПКА, 'cover.png'))).toEqual(РЕЗУЛЬТАТ);
    expect(вопрос.файлы.map((файл) => файл.путь)).toContain(`${ПАПКА}/cover.png`);
    const адреса = записка.map((шаг) => шаг.адрес);
    expect(адреса.indexOf('/api/publish/date')).toBeLessThan(адреса.indexOf('/api/publish/cover'));
    expect(адреса.indexOf('/api/publish/cover')).toBeLessThan(адреса.indexOf('/api/prepare'));
  }, ЖДАТЬ_GIT);

  it('обложку создать не из чего — публикация останавливается словами сервера, проверки не начинаются', async () => {
    const с = await новаяСтатья({[EN]: С_КАРТИНКОЙ('img-01.gif'), [`${ПАПКА}/img-01.gif`]: GIF});
    const записка = [];
    let вписано = false;
    const х = ход(дверь(с, записка), [], undefined, async () => {
      вписано = true;
      return true;
    });

    await expect(проверитьИСобрать(EN, false, х)).rejects.toMatchObject({ответ: {код: 'обложкаНеСоздана'}});
    expect(вписано).toBe(false);
    expect(записка.map((шаг) => шаг.адрес)).not.toContain('/api/prepare');
  }, ЖДАТЬ_GIT);

  it('попытку отменили после создания файла — следующая вписывает тот же cover, второй файл не появляется', async () => {
    const с = await новаяСтатья({[EN]: С_КАРТИНКОЙ(), [`${ПАПКА}/img-01.png`]: png(1200, 800)});
    сБиблиотекой(ЛЕГЧЕ_PNG());
    // Человек правит статью ровно в тот момент, когда сервер положил обложку: попытка отменяется
    // до записи поля. Так выглядит обрыв между файлом и полем.
    const записка = [];
    let жива = true;
    const дверьСервера = дверь(с, записка);
    const отменяемая = {
      ...ход(async (адрес, тело) => {
        const ответ = await дверьСервера(адрес, тело);
        if (адрес === '/api/publish/cover') жива = false;
        return ответ;
      }, [], undefined, поставитьОбложкуВФайл(с.repo, EN)),
      жива: () => жива,
    };

    expect((await проверитьИСобрать(EN, false, отменяемая)).вид).toBe('прервано');
    expect(обложка(с.repo)).toBe(null);
    expect(fs.existsSync(path.join(с.repo, ПАПКА, 'cover.png'))).toBe(true);

    // Библиотеки больше нет: второй заход обязан взять готовый файл, а не создавать новый.
    сБиблиотекой(null);
    const вопрос = await проверитьИСобрать(EN, false, ход(дверь(с, []), [], undefined, поставитьОбложкуВФайл(с.repo, EN)));

    expect(вопрос.вид).toBe('спрашиваю');
    expect(обложка(с.repo)).toMatch(/cover\.png/);
    expect(fs.readdirSync(path.join(с.repo, ПАПКА)).filter((имя) => имя.startsWith('cover'))).toEqual(['cover.png']);
  }, ЖДАТЬ_GIT);

  it('поле уже заполнено — ход обложку не трогает и поле не переписывает', async () => {
    const своя = СТАТЬЯ.replace('---\n\n', 'image: ./img-01.png\n---\n\n');
    const с = await новаяСтатья({[EN]: `${своя}\n![Схема](./img-01.png)\n`, [`${ПАПКА}/img-01.png`]: png(1200, 800)});
    let вписано = false;
    const х = ход(дверь(с, []), [], undefined, async () => {
      вписано = true;
      return true;
    });

    const вопрос = await проверитьИСобрать(EN, false, х);

    expect(вопрос.вид).toBe('спрашиваю');
    expect(вписано).toBe(false);
    expect(fs.existsSync(path.join(с.repo, ПАПКА, 'cover.png'))).toBe(false);
  }, ЖДАТЬ_GIT);
});
