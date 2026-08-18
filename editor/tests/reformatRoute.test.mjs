// Имя каждого теста повторяет формулировку правила.
// Ручка смены формата: новый файл с новым расширением и обновлённая ссылка в статье одной
// операцией; текст сверяется отпечатком; старый файл уходит только без оставшихся ссылок.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {НАСТРОЙКИ, REL, УЗЕЛ, PNG, JPEG, отпечаток, сменить, репозиторий, файл} from './reformatHarness.mjs';

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
    // Занятое имя не отменяет замену: новый файл получает свободное имя, а чужие байты целы.
    const repo = репозиторий();
    fs.writeFileSync(файл(repo, 'img-01.png'), Buffer.from('чужие байты'));
    const ответ = await сменить(repo);

    expect(ответ.code).toBe(200);
    expect(ответ.data.новыйSrc).toBe('./img-02.png');
    expect(fs.readFileSync(файл(repo, 'img-01.png')).toString()).toBe('чужие байты');
    expect(fs.readFileSync(path.join(repo, REL), 'utf8')).toContain('](./img-02.png)');
  });

  it('после отказа файл и ссылка остаются согласованными, а повторная замена проходит', async () => {
    // Отказ по расхождению отпечатка ничего не меняет — ни файла, ни текста; следующая попытка
    // с верным отпечатком доводит замену до конца.
    const repo = репозиторий();
    const отказ = await сменить(repo, {отпечаток: 'не тот'});

    expect(отказ.code).toBe(409);
    expect(fs.readdirSync(path.join(repo, 'docs', 'a')).sort()).toEqual(['img-01.jpg', 'index.mdx']);
    expect(fs.readFileSync(path.join(repo, REL), 'utf8')).toContain('](./img-01.jpg)');

    const повтор = await сменить(repo);

    expect(повтор.code).toBe(200);
    expect(повтор.data.новыйSrc).toBe('./img-01.png');
    expect(fs.readFileSync(path.join(repo, REL), 'utf8')).toContain('](./img-01.png)');
    expect(fs.existsSync(файл(repo, 'img-01.jpg'))).toBe(false);
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
