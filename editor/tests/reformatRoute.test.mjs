// Имя каждого теста повторяет формулировку правила.
// Ручка смены формата: новый файл с новым расширением и обновлённая ссылка в статье одной
// операцией; текст сверяется отпечатком; старый файл уходит только без оставшихся ссылок.
import {afterEach, describe, expect, it} from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {assetReformatRoute} from '../src/adapters/assetReformat.mjs';

const НАСТРОЙКИ = {
  картинки: {шаблонИмени: 'img-{номер}', имяОбложки: 'cover', максимумКилобайт: 500},
  ошибкиСервера: {
    плохойЗапрос: 'неверный запрос',
    нетСтатьи: 'нет такой статьи',
    нетКартинки: 'нет такой картинки',
    картинкаВнеСтатьи: 'путь ведёт из папки статьи наружу',
    заменаТолькоJpgPng: 'заменять можно только JPG и PNG',
    адресЗанят: 'рядом уже лежит файл с новым именем',
    текстНеСовпал: 'статья на диске изменилась',
    вхождениеНеНайдено: 'место этой картинки в файле не нашлось',
    операцияИдёт: 'над этой статьёй уже идёт замена картинки',
  },
};

const REL = 'docs/a/index.mdx';
const УЗЕЛ = '![Подпись](./img-01.jpg)';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0x49, 0x44, 0x41, 0x54, 1, 2, 0x49, 0x45, 0x4e, 0x44]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0xff, 0xda, 1, 2, 0xff, 0xd9]);

const отпечаток = (текст) => crypto.createHash('sha1').update(текст, 'utf8').digest('hex');

const песочницы = [];

afterEach(() => {
  while (песочницы.length > 0) fs.rmSync(песочницы.pop(), {recursive: true, force: true});
});

/** Репозиторий со статьёй, JPEG-картинкой в теле и текстом в windows-переводах строк. */
function репозиторий(текст = `---\ntitle: A\n---\n\n${УЗЕЛ}\n\nхвост\n`) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-reformat-'));
  песочницы.push(repo);
  fs.mkdirSync(path.join(repo, 'docs', 'a'), {recursive: true});
  fs.writeFileSync(path.join(repo, REL), текст, 'utf8');
  fs.writeFileSync(path.join(repo, 'docs', 'a', 'img-01.jpg'), JPEG);
  return repo;
}

/** Один запрос к ручке. Возвращает код ответа и разобранный JSON. */
async function сменить(repo, правки = {}) {
  const текст = fs.readFileSync(path.join(repo, REL), 'utf8');
  const тело = {
    article: REL,
    src: './img-01.jpg',
    узел: УЗЕЛ,
    номер: 1,
    отпечаток: отпечаток(текст),
    base64: PNG.toString('base64'),
    ...правки,
  };

  const ответ = {};
  await assetReformatRoute({
    req: {method: 'POST'},
    res: {},
    url: new URL('http://localhost/api/asset/reformat'),
    repo,
    settings: НАСТРОЙКИ,
    тело: async () => тело,
    insideRepo: (target) => path.resolve(target).startsWith(path.resolve(repo) + path.sep),
    send: (res, code, data) => {
      ответ.code = code;
      ответ.data = data;
    },
  });

  return ответ;
}

const файл = (repo, имя) => path.join(repo, 'docs', 'a', имя);

describe('смена формата картинки', () => {
  it('новый файл ложится с новым расширением, ссылка в статье обновляется, старый уходит', async () => {
    const repo = репозиторий();
    const ответ = await сменить(repo);

    expect(ответ.code).toBe(200);
    expect(ответ.data.новыйSrc).toBe('./img-01.png');
    expect(ответ.data.старыйОставлен).toBeNull();
    expect(fs.readFileSync(файл(repo, 'img-01.png')).equals(PNG)).toBe(true);
    expect(fs.existsSync(файл(repo, 'img-01.jpg'))).toBe(false);
    expect(fs.readFileSync(path.join(repo, REL), 'utf8')).toContain('![Подпись](./img-01.png)');
  });

  it('остальные байты статьи не меняются ни на один: переводы строк и текст вокруг целы', async () => {
    const crlf = `---\r\ntitle: A\r\n---\r\n\r\n${УЗЕЛ}\r\n\r\nхвост\r\n`;
    const repo = репозиторий(crlf);
    const ответ = await сменить(repo);

    expect(ответ.code).toBe(200);
    expect(fs.readFileSync(path.join(repo, REL), 'utf8'))
      .toBe(crlf.replace('./img-01.jpg', './img-01.png'));
  });

  it('alt и положение картинки в тексте сохраняются', async () => {
    const repo = репозиторий();
    await сменить(repo);
    const текст = fs.readFileSync(path.join(repo, REL), 'utf8');

    expect(текст.indexOf('![Подпись](./img-01.png)')).toBe(`---\ntitle: A\n---\n\n`.length);
  });

  it('ссылка обновляется только у названного вхождения, сосед остаётся прежним', async () => {
    const repo = репозиторий(`---\ntitle: A\n---\n\n${УЗЕЛ}\n\n${УЗЕЛ}\n`);
    const ответ = await сменить(repo, {номер: 2});

    expect(ответ.code).toBe(200);
    const текст = fs.readFileSync(path.join(repo, REL), 'utf8');
    expect(текст.indexOf(УЗЕЛ)).toBeGreaterThan(-1);
    expect(текст.indexOf('![Подпись](./img-01.png)')).toBeGreaterThan(текст.indexOf(УЗЕЛ));
    // Старое имя всё ещё используется соседом — файл обязан остаться.
    expect(ответ.data.старыйОставлен).toBe('ссылки');
    expect(fs.existsSync(файл(repo, 'img-01.jpg'))).toBe(true);
  });

  it('обложка в шапке удерживает старый файл от удаления', async () => {
    const repo = репозиторий(`---\ntitle: A\nimage: ./img-01.jpg\n---\n\n${УЗЕЛ}\n`);
    const ответ = await сменить(repo);

    expect(ответ.code).toBe(200);
    expect(ответ.data.старыйОставлен).toBe('ссылки');
    expect(fs.existsSync(файл(repo, 'img-01.jpg'))).toBe(true);
    // Ссылка обложки не переключается: выбранным было изображение в теле.
    expect(fs.readFileSync(path.join(repo, REL), 'utf8')).toContain('image: ./img-01.jpg');
  });

  it('существующий файл с новым адресом молча не перезаписывается', async () => {
    const repo = репозиторий();
    fs.writeFileSync(файл(repo, 'img-01.png'), Buffer.from('чужие байты'));
    const ответ = await сменить(repo);

    expect(ответ.code).toBe(409);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.адресЗанят);
    expect(fs.readFileSync(файл(repo, 'img-01.png')).toString()).toBe('чужие байты');
    // Статья не тронута: ссылка по-прежнему на JPG, и файл JPG цел.
    expect(fs.readFileSync(path.join(repo, REL), 'utf8')).toContain('./img-01.jpg');
    expect(fs.existsSync(файл(repo, 'img-01.jpg'))).toBe(true);
  });

  it('разошёлся отпечаток — на диске другая статья, ничего не меняется', async () => {
    const repo = репозиторий();
    const ответ = await сменить(repo, {отпечаток: 'не тот'});

    expect(ответ.code).toBe(409);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.текстНеСовпал);
    expect(fs.existsSync(файл(repo, 'img-01.png'))).toBe(false);
  });

  it('вхождения с названным номером нет — новый файл не остаётся, статья не тронута', async () => {
    const repo = репозиторий();
    const ответ = await сменить(repo, {номер: 3});

    expect(ответ.code).toBe(409);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.вхождениеНеНайдено);
    expect(fs.existsSync(файл(repo, 'img-01.png'))).toBe(false);
    expect(fs.readFileSync(path.join(repo, REL), 'utf8')).toContain('./img-01.jpg');
  });

  it('байты того же формата, что и цель, — это не смена формата, а неверный запрос', async () => {
    const repo = репозиторий();
    const ответ = await сменить(repo, {base64: JPEG.toString('base64')});

    expect(ответ.code).toBe(400);
  });

  it('байты не картинки сменой формата не принимаются', async () => {
    const repo = репозиторий();
    const ответ = await сменить(repo, {base64: Buffer.from('просто текст').toString('base64')});

    expect(ответ.code).toBe(400);
    expect(ответ.data.error).toBe(НАСТРОЙКИ.ошибкиСервера.заменаТолькоJpgPng);
  });

  it('узел не картинка с этим адресом — неверный запрос, файл не трогается', async () => {
    const repo = репозиторий();
    const ответ = await сменить(repo, {узел: 'просто текст'});

    expect(ответ.code).toBe(400);
    expect(fs.existsSync(файл(repo, 'img-01.png'))).toBe(false);
  });

  it('путь с .. из папки статьи наружу отвергается', async () => {
    const repo = репозиторий();
    fs.mkdirSync(path.join(repo, 'docs', 'b'), {recursive: true});
    fs.writeFileSync(path.join(repo, 'docs', 'b', 'img-01.jpg'), JPEG);
    const ответ = await сменить(repo, {src: '../b/img-01.jpg', узел: '![x](../b/img-01.jpg)'});

    expect(ответ.code).toBe(400);
    expect(fs.existsSync(path.join(repo, 'docs', 'b', 'img-01.png'))).toBe(false);
  });

  it('после операции временных файлов не остаётся ни в статье, ни в служебной папке', async () => {
    const repo = репозиторий();
    await сменить(repo);

    expect(fs.readdirSync(path.join(repo, 'docs', 'a')).sort()).toEqual(['img-01.png', 'index.mdx']);
    const tmp = path.join(repo, 'editor', '.tmp');
    expect(fs.existsSync(tmp) ? fs.readdirSync(tmp) : []).toEqual([]);
  });
});
