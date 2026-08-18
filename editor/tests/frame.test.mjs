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

  it('ни один файл кода и стилей не длиннее 300 строк: src, tests, scripts и server.mjs', () => {
    // Правило SPEC 4.9 целиком, а не только интерфейс: сервер уже подходил к пределу вплотную,
    // и проверка, смотревшая на одну папку, этого не видела. Папка команд (`scripts`) внесена
    // сюда вместе с первой же командой: дыра иначе открылась бы снова, папкой правее.
    // `settings.json` под правило не подпадает: это файл данных, единый справочник (SPEC 4.9.1).
    const длинные = [
      ...кодовые(path.join(EDITOR, 'src')),
      ...кодовые(path.join(EDITOR, 'tests')),
      ...кодовые(path.join(EDITOR, 'scripts')),
      path.join(EDITOR, 'server.mjs'),
    ]
      .map((file) => ({
        file: path.relative(EDITOR, file).split(path.sep).join('/'),
        // Последний перевод строки — конец последней строки, а не начало новой пустой:
        // иначе файл ровно в 300 строк считался бы за 301 и правило врало бы на единицу.
        lines: fs.readFileSync(file, 'utf8').replace(/\r?\n$/, '').split('\n').length,
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

  it('рабочий редактор на время просмотра версии прячется, а не размонтируется', () => {
    // Предохранитель от возврата найденного дефекта: пока просмотр показывался ВМЕСТО редактора,
    // возврат пересоздавал редактор из текста, каким статья открывалась, — несохранённая правка
    // и вся история отмены пропадали.
    // Почему строкой, а не результатом: правило живёт в разметке окна, а отрисовать окно в тесте
    // нечем — рендерера в списке зависимостей нет и добавлять его запрещено (SPEC 4.10).
    // Поведение проверяется руками, чек-лист, пункт 11; здесь — защита от отката (SPEC 5.2.1).
    const app = fs.readFileSync(path.join(UI, 'App.tsx'), 'utf8');
    const css = fs.readFileSync(path.join(UI, 'versions.css'), 'utf8');

    expect(app).toContain('скрыт={');
    expect(css.replace(/\s+/g, '')).toContain('.pane-away{display:none');
  });

  it('сохранение берёт метку времени из часов очереди автосохранения, а не из своих', () => {
    // Две записи с одинаковой меткой сервер не упорядочит, и запоздавшая затрёт свежую.
    // Что метка доезжает до сервера, доказано поведением в actions.test.ts; здесь — её источник:
    // проверить это результатом нечем, хук без рендерера не запускается (SPEC 4.10, 5.2.1).
    const saving = fs.readFileSync(path.join(UI, 'useSaving.ts'), 'utf8');

    expect(saving).toContain('deps.автосохранение.метка()');
    expect(saving).not.toContain('new Date().toISOString()');
  });

  it('редактор зовёт свежие обработчики окна, а не замыкание на момент открытия статьи', () => {
    // Предохранитель от найденного дефекта: слушатель правок ставится один раз на статью и держал
    // обработчики того мгновения. После сохранения отпечаток файла меняется, а набранное уходило
    // в черновик со СТАРЫМ — при следующем открытии человек получал ложный выбор «черновик или
    // файл», и выбор «взять файл» отбрасывал его работу.
    // Строкой по той же причине, что и соседние: запустить хук нечем, рендерера в зависимостях
    // нет и добавлять его запрещено (SPEC 4.10, 5.2.1).
    const editor = fs.readFileSync(path.join(UI, 'editor/useEditor.ts'), 'utf8');

    expect(editor).toContain('свежие.current = options;');
    expect(editor).toContain('свежие.current.onText(');
    expect(editor).toContain('свежие.current.onPaste(');
    // Прямой вызов обработчика из замыкания — это и есть возвращённый дефект.
    expect(editor).not.toContain('options.onText(');
    expect(editor).not.toContain('options.onPaste(');
  });

  it('готовность в окне берётся из ответа сервера и не обнуляется, когда её не прислали', () => {
    // Своего правила перехода статусов у окна быть не должно: оно разошлось бы с файлом состояния.
    // А ответ без состояния означает «на диске осталось прежнее» — надпись трогать нельзя.
    // Строкой, потому что запустить хук нечем: рендерера в зависимостях нет (SPEC 4.10, 5.2.1).
    // Поведение проверено живьём (чек-лист, пункт 18) и тестами ядра в state.test.mjs.
    const saving = fs.readFileSync(path.join(UI, 'useSaving.ts'), 'utf8');

    expect(saving).toContain('ответ?.state?.готовность');
    expect(saving).toContain('готовность: готовность ?? было.готовность');
  });

  it('в просмотре версии не остаётся ни одной кнопки, пишущей на диск', () => {
    // Панель конфликта пишет файл кнопкой «сохранить поверх» и подменяет рабочий текст выбором
    // черновика. В просмотре её быть не должно. Строкой по той же причине, что и выше:
    // отрисовать окно в тесте нечем (SPEC 4.10), поведение — в ручном чек-листе, пункт 11.
    // Признак один на все запреты: просмотр начинается нажатием, а не приходом ответа, поэтому
    // отдельная проверка на «просмотр уже пришёл» закрепила бы дыру в щели ожидания.
    const app = fs.readFileSync(path.join(UI, 'App.tsx'), 'utf8');
    // Сами полосы живут в зоне `Bars`, куда признак и передаётся: окно только считает его.
    const bars = fs.readFileSync(path.join(UI, 'zones/Bars.tsx'), 'utf8');

    expect(app).toContain('const просмотрИдёт = версии.просмотр !== null || версии.занято;');
    expect(app).toContain('просмотрИдёт={просмотрИдёт}');
    expect(app).toContain('просмотр={просмотрИдёт}');
    expect(bars).toContain('{!props.просмотрИдёт && (');
  });

  it('реестр не пишет файлы: видимость переключается только внутри открытой статьи', () => {
    const registry = fs.readFileSync(path.join(UI, 'zones/Registry.tsx'), 'utf8');

    expect(registry).not.toContain('fetch');
    expect(registry).not.toContain('/api/');
    expect(registry).not.toContain('onVisibility');
  });

  it('второго пути записи видимости в программе нет: строку unlisted пишет одно правило ядра', () => {
    // Предохранитель от регресса, а не доказательство поведения: само поведение проверяют
    // `saveVisibility.test.mjs` и `visibilityField.test.ts`. Здесь ловится возвращение второй
    // двери — отдельной ручки видимости или собственной сборки строки где-нибудь ещё.
    // Папка команд входит сюда наравне с `src`: она признана кодом программы (SPEC 4.9), и вторая
    // дверь к `unlisted` завелась бы там так же легко. Файлы её берутся обеими выборками: команды
    // написаны на `.mjs`, а `files` отбирает только `.ts`, `.tsx` и `.css`.
    const код = источники(path.join(EDITOR, 'src'))
      .concat(files(path.join(EDITOR, 'src')))
      .concat(источники(path.join(EDITOR, 'scripts')))
      .concat(files(path.join(EDITOR, 'scripts')))
      .concat([path.join(EDITOR, 'server.mjs')])
      .map((file) => ({
        file: path.relative(EDITOR, file).split(path.sep).join('/'),
        текст: fs.readFileSync(file, 'utf8'),
      }));

    const своиПисатели = ['src/core/frontmatterRules.mjs'];
    const пишут = код.filter((item) => item.текст.includes("'unlisted: true'") || item.текст.includes('"unlisted: true"'));
    expect(пишут.map((item) => item.file)).toEqual([]);

    const ручка = код.filter((item) => item.текст.includes('/api/visibility'));
    expect(ручка.map((item) => item.file)).toEqual([]);
    // Само правило на месте: без него проверка выше стала бы зелёной от того, что видимости нет.
    expect(своиПисатели.every((файл) => код.some((item) => item.file === файл && item.текст.includes('export function setUnlisted')))).toBe(true);
  });

  it('весть панели о новом адресе картинки сверяется с живым номером выбора, а не с прежним', () => {
    // Предохранитель от возврата дефекта: номер из отрисовки прежней панели совпал бы сам с собой,
    // и поздний ответ старой картинки достался бы новой выбранной (находка ворот 2026-08-18).
    const зона = fs.readFileSync(path.join(EDITOR, 'src', 'ui', 'zones', 'ArticlePane.tsx'), 'utf8');

    expect(зона).toContain('перенестиВыбор(было, выборРеф.current');
  });

  it('статусов ровно три и первый — черновик', () => {
    const settings = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
    expect(settings['статусы']).toHaveLength(3);
    expect(settings['статусы'][0]).toBe('Черновик');
  });
});

describe('настройки не врут', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

  /**
   * Код самой программы одной строкой: правила, сервер и интерфейс.
   * Папка команд (`scripts`) сюда НЕ входит намеренно, хотя кодом программы она считается
   * (SPEC 4.9): настройка, которую читает одна служебная команда, выглядела бы тогда живой,
   * и правило «настройка, которую код не читает, — дефект» (SPEC 4.4.2) ослабло бы.
   */
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
