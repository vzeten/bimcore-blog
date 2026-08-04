// Каркас окна: структура зон и предел размера файлов.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = path.join(EDITOR, 'src', 'ui');

function источники(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) источники(full, out);
    else if (/\.mjs$/.test(entry.name)) out.push(full);
  }
  return out;
}

function files(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files(full, out);
    // Стили тоже под лимитом: иначе один css-файл распухает незаметно.
    else if (/\.(ts|tsx|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Весь код программы по определению SPEC 4.9: `.ts`, `.tsx`, `.mjs`, `.css`. */
const кодовые = (dir) => [...files(dir), ...источники(dir)];

describe('каркас окна', () => {
  const зоны = [
    'zones/TopBar.tsx',
    'zones/Rail.tsx',
    'zones/Registry.tsx',
    'zones/SectionTree.tsx',
    'zones/VersionStrip.tsx',
    'zones/ArticlePane.tsx',
    'zones/CommentGutter.tsx',
    'zones/Properties.tsx',
  ];

  for (const зона of зоны) {
    it(`зона на своём месте: ${зона}`, () => {
      expect(fs.existsSync(path.join(UI, зона))).toBe(true);
    });
  }

  it('ни один файл кода и стилей не длиннее 300 строк: src, tests и server.mjs', () => {
    // Правило SPEC 4.9 целиком, а не только интерфейс: сервер уже подходил к пределу вплотную,
    // и проверка, смотревшая на одну папку, этого не видела.
    // `settings.json` под правило не подпадает: это файл данных, единый справочник (SPEC 4.9.1).
    const длинные = [
      ...кодовые(path.join(EDITOR, 'src')),
      ...кодовые(path.join(EDITOR, 'tests')),
      path.join(EDITOR, 'server.mjs'),
    ]
      .map((file) => ({
        file: path.relative(EDITOR, file).split(path.sep).join('/'),
        lines: fs.readFileSync(file, 'utf8').split('\n').length,
      }))
      .filter((item) => item.lines > 300);

    expect(длинные).toEqual([]);
  });

  it('свойства и картинки не живут в правой полосе', () => {
    const gutter = fs.readFileSync(path.join(UI, 'zones/CommentGutter.tsx'), 'utf8');
    expect(gutter).not.toContain('frontmatter');
    expect(gutter).not.toContain('img');
  });

  it('надписи каркаса берутся из настроек, а не из кода', () => {
    const settings = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
    const подписи = settings['подписи'];

    expect(подписи['нетВерсий']).toBeTruthy();
    expect(подписи['нетКомментариев']).toBeTruthy();
    expect(подписи['ничегоНеНашлось']).toBeTruthy();

    for (const зона of ['zones/VersionStrip.tsx', 'zones/CommentGutter.tsx']) {
      const code = fs.readFileSync(path.join(UI, зона), 'utf8');
      expect(code).not.toContain(подписи['нетВерсий']);
      expect(code).not.toContain(подписи['нетКомментариев']);
    }
  });

  it('реестр не пишет файлы: видимость переключается только внутри открытой статьи', () => {
    const registry = fs.readFileSync(path.join(UI, 'zones/Registry.tsx'), 'utf8');

    expect(registry).not.toContain('fetch');
    expect(registry).not.toContain('/api/');
    expect(registry).not.toContain('onVisibility');
  });

  it('статусов ровно три и первый — черновик', () => {
    const settings = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
    expect(settings['статусы']).toHaveLength(3);
    expect(settings['статусы'][0]).toBe('Черновик');
  });
});

describe('настройки не врут', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

  /** Весь код программы одной строкой: и правила, и сервер, и интерфейс. */
  const код = [...кодовые(path.join(EDITOR, 'src')), path.join(EDITOR, 'server.mjs')]
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');

  /** Разделы настроек, у которых каждый ключ обязан читаться кодом поимённо. */
  const разделы = ['подписи', 'реестр', 'хранение', 'картинки', 'сервер', 'видимость', 'ошибкиСервера'];

  const ключи = [
    ...Object.keys(settings).filter((key) => !key.startsWith('_')),
    ...разделы.flatMap((раздел) => Object.keys(settings[раздел]).filter((key) => !key.startsWith('_'))),
  ];

  for (const ключ of ключи) {
    it(`настройка, которую код не читает, — дефект: ${ключ}`, () => {
      expect(код.includes(ключ)).toBe(true);
    });
  }
});
