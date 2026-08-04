import {useEffect, useRef, useState} from 'react';
import type {Deletion} from '../core/colorize';
import {Rail} from './zones/Rail';
import {Registry} from './zones/Registry';
import {TopBar} from './zones/TopBar';
import {VersionStrip} from './zones/VersionStrip';
import {ArticlePane} from './zones/ArticlePane';
import {CommentGutter} from './zones/CommentGutter';
import {ConflictBars, ErrorBar} from './zones/ConflictBar';
import {buildFrontmatter, parseFrontmatter, type Field} from './zones/Properties';
import {pasteImage} from './editor/images';
import {requestJson} from './api';
import {nothingChanged} from '../core/articleFile.mjs';
import {saveArticle, setVisibility} from './actions';
import {useAutosave} from './useAutosave';
import {label, setLabels} from './labels';
import {makeReporter} from './errors';
import {useConflictChoice} from './useConflictChoice';
import type {Article, ArticleRow, PanelMode, SaveState, Settings} from './types';

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [mode, setMode] = useState<PanelMode>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [text, setText] = useState('');
  const [deletions, setDeletions] = useState<Deletion[]>([]);
  const [dirty, setDirty] = useState(false);
  const [colors, setColors] = useState(true);
  const [ошибка, setОшибка] = useState<string | null>(null);
  const [состояниеСохранения, setСостояниеСохранения] = useState<SaveState>('сохранено');
  const [конфликтСохранения, setКонфликтСохранения] = useState(false);
  const {runSafe, сПричиной} = makeReporter(setОшибка);
  const автосохранение = useAutosave(settings?.хранение.автосохранениеСек ?? 0, setСостояниеСохранения);
  const {взятьЧерновик, взятьФайл} = useConflictChoice({
    article, roots: settings?.контент ?? [], setArticle, setText, setFields,
    setDirty, setСостояние: setСостояниеСохранения,
    запомнить: (body, frontmatterRaw) => {
      текстСейчас.current = body;
      шапкаСейчас.current = frontmatterRaw;
    },
  });
  // Текст и шапка в ref: пока запрос идёт, человек печатает, и ответ должен сравнить
  // «что сохраняли» с «что в окне сейчас».
  const текстСейчас = useRef('');
  const шапкаСейчас = useRef('');
  // Какая статья открыта прямо сейчас: ответ запроса по прошлой статье не должен трогать новую.
  const статьяСейчас = useRef<string | null>(null);
  статьяСейчас.current = article?.path ?? null;

  // Актуальные настройки в ref: обработчик «назад» ставится один раз и иначе поймал бы старое (null) значение.
  const settingsRef = useRef<Settings | null>(null);
  settingsRef.current = settings;

  useEffect(() => {
    requestJson<Settings>('/api/settings')
      .then((loaded) => {
        setLabels(loaded.подписи);
        setSettings(loaded);
      })
      .catch((error: unknown) => setОшибка(error instanceof Error ? error.message : label('ошибкаЗапроса')));
    void refresh();

    // Реестр — начальный экран. Кнопка «назад» браузера должна возвращать сюда, а не выходить из программы.
    history.replaceState({вид: 'реестр'}, '');
    const назад = (event: PopStateEvent) => {
      const st = event.state as {вид?: string; path?: string} | null;
      if (st?.вид === 'статья' && st.path) void open(st.path, false);
      else closeArticle();
    };
    window.addEventListener('popstate', назад);
    return () => window.removeEventListener('popstate', назад);
  }, []);

  useEffect(() => {
    if (!settings) return;
    const style = document.documentElement.style;
    for (const [key, value] of Object.entries(settings.слои)) style.setProperty(`--layer-${key}`, value.цвет);
  }, [settings]);

  if (!settings) {
    // Настройки не загрузились — показываем причину словами, а не бесконечную «Загрузку».
    if (ошибка) return <div className="crash"><h1>Редактор не открылся</h1><pre>{ошибка}</pre></div>;
    return <div className="loading">Загрузка…</div>;
  }

  const title = (fields.find((field) => field.key === 'title')?.display ?? article?.title ?? '');

  // Реестр — стартовый экран: пока статья не открыта, показывать больше нечего.
  const реестр = mode === 'статьи' || article === null;

  return (
    <div className={colors ? 'app' : 'app mono'}>
      <TopBar
        settings={settings}
        article={реестр ? null : article}
        title={title}
        dirty={dirty}
        состояниеСохранения={состояниеСохранения}
        colors={colors}
        onOpen={(path) => void open(path)}
        onColors={setColors}
        onSave={() => void save()}
        onVisibility={(скрыть) => void visibility(article, скрыть)}
      />

      <ErrorBar settings={settings} текст={ошибка} onЗакрыть={() => setОшибка(null)} />

      {/* Файл разошёлся с окном: выбор делает человек, молча ничего не трогаем. */}
      <ConflictBars
        settings={settings}
        article={реестр ? null : article}
        конфликтСохранения={конфликтСохранения}
        onВзятьЧерновик={взятьЧерновик}
        onВзятьФайл={взятьФайл}
        onСохранитьПоверх={() => void save(true)}
        onПеречитать={() => void open(article!.path, false)}
      />

      <VersionStrip settings={settings} visible={mode === 'версии' && article !== null} />

      <div className="body">
        <Rail settings={settings} mode={mode} articleOpen={article !== null} onMode={setMode} />

        {реестр ? (
          <Registry settings={settings} articles={articles} onOpen={(path) => void open(path)} />
        ) : (
          <>
            <ArticlePane
              // Ключ с решением по черновику: сменили источник текста — редактор пересоздался.
              key={`${article!.path}|${article!.черновикРешение}`}
              settings={settings}
              article={article!}
              fields={fields}
              onFields={(next) => {
                setFields(next);
                // Тело берём из ref: обработчик текста живёт в замыкании редактора и мог не успеть
                // отдать сюда свежее значение через состояние.
                правка(текстСейчас.current, buildFrontmatter(article!.frontmatterRaw, next, article!.path, settings.контент));
              }}
              onText={(next) => {
                setText(next);
                // Шапку берём из ref по той же причине: редактор создаётся один раз и держит
                // те свойства, что были при открытии статьи.
                правка(next, шапкаСейчас.current);
              }}
              onDeletions={setDeletions}
              onPaste={(file, view) => void runSafe(() => pasteImage(file, article!.path, view))}
            />

            <CommentGutter settings={settings} deletions={deletions} />
          </>
        )}
      </div>
    </div>
  );

  async function refresh(): Promise<void> {
    // Провал не должен подменить список объектом ошибки — оставляем прежний.
    await runSafe(async () => {
      setArticles(await requestJson<ArticleRow[]>('/api/articles'));
    });
  }

  async function open(path: string, push = true): Promise<void> {
    const s = settingsRef.current;
    if (!s) return; // настройки ещё не загрузились — «назад» просто ничего не делает, но не падает

    let loaded: Article | null = null;
    const ok = await runSafe(async () => {
      loaded = await requestJson<Article>(`/api/article?path=${encodeURIComponent(path)}`);
    });
    if (!ok || !loaded) return;
    const art: Article = loaded;

    setОшибка(null);
    setКонфликтСохранения(false);
    setArticle(art);
    setFields(parseFrontmatter(art.frontmatterRaw, path, s.контент));
    setText(art.body);
    setDeletions([]);
    // Исходное состояние окна: от него считается «есть несохранённое».
    текстСейчас.current = art.body;
    шапкаСейчас.current = art.frontmatterRaw;
    setMode(null);

    автосохранение.отменить(); // ждущая запись относится к прошлой статье
    // Продолжили с автосохранения — это несохранённая работа, так и показываем.
    const изЧерновика = art.черновикРешение === 'черновик';
    setDirty(изЧерновика);
    setСостояниеСохранения(изЧерновика ? 'автосохранено' : 'сохранено');

    if (push) history.pushState({вид: 'статья', path}, '');
  }

  function closeArticle(): void {
    setArticle(null);
    setMode(null);
  }

  /**
   * Правка уходит в очередь автосохранения; настоящий файл не трогается.
   * Без аргументов — вернуть в очередь то, что уже в окне (сохранение не прошло).
   */
  function вЧерновик(body = текстСейчас.current, frontmatterRaw = шапкаСейчас.current): void {
    if (!article) return;
    текстСейчас.current = body;
    шапкаСейчас.current = frontmatterRaw;
    автосохранение.запланировать({path: article.path, body, frontmatterRaw, отпечатокБазы: article.отпечаток});
  }

  /**
   * Любая правка окна: текста или свойств. Несохранённость считается по паре «тело + шапка»
   * тем же правилом, что и на сервере: иначе возврат текста к исходному стёр бы признак
   * несохранённых свойств, и правка шапки молча потерялась бы.
   */
  function правка(body: string, frontmatterRaw: string): void {
    if (!article) return;
    setDirty(!nothingChanged({body: article.body, frontmatterRaw: article.frontmatterRaw}, {body, frontmatterRaw}));
    вЧерновик(body, frontmatterRaw);
  }

  /** Видимость меняем в состоянии только после того, как сервер подтвердил запись в файлы. */
  async function visibility(open: Article | null, скрыть: boolean): Promise<void> {
    if (!open) return;
    await setVisibility(Object.values(open.versions), скрыть, {
      ok: () => {
        setОшибка(null);
        setArticle({...open, скрыта: скрыть});
        void refresh();
      },
      fail: (reason) => setОшибка(сПричиной('ошибкаВидимости', reason)),
    });
  }

  /** «Сохранено» — только после успеха сервера. `поверх` — решение человека записать своё. */
  async function save(поверх = false): Promise<void> {
    if (!article) return;
    const путь = article.path;
    const шапка = buildFrontmatter(article.frontmatterRaw, fields, путь, settings!.контент);
    const тело = text;
    текстСейчас.current = тело;
    шапкаСейчас.current = шапка;
    // Снимаем ждущее автосохранение ДО запроса: поздний ответ воскресил бы черновик после записи.
    автосохранение.отменить();

    await saveArticle(
      {
        path: article.path,
        body: тело,
        frontmatterRaw: шапка,
        отпечатокБазы: article.отпечаток,
        перезаписать: поверх,
      },
      {
        ok: (ответ) => {
          void refresh();
          // Пока запрос шёл, могли открыть другую статью: её состояние трогать нельзя.
          if (статьяСейчас.current !== путь) return;

          setОшибка(null);
          setКонфликтСохранения(false);
          setСостояниеСохранения('сохранено');
          // Сдвигаем базу целиком — и отпечаток, и текст сравнения: иначе возврат к прежнему виду
          // выглядел бы как «Сохранено», хотя на диске другое.
          const новыйОтпечаток = ответ?.отпечаток;
          setArticle((было) => (было
            ? {...было, body: тело, frontmatterRaw: шапка, отпечаток: новыйОтпечаток ?? было.отпечаток}
            : было));

          // Человек мог печатать дальше: сохранён старый снимок, новая правка уходит в черновик.
          const изменилосьПоПути = текстСейчас.current !== тело || шапкаСейчас.current !== шапка;
          setDirty(изменилосьПоПути);
          if (изменилосьПоПути) {
            автосохранение.запланировать({
              path: путь,
              body: текстСейчас.current,
              frontmatterRaw: шапкаСейчас.current,
              отпечатокБазы: новыйОтпечаток ?? article.отпечаток,
            });
          }
        },
        // Файл изменился снаружи: ничего не записано, правки в окне, выбор за человеком.
        conflict: () => {
          if (статьяСейчас.current !== путь) return;
          setКонфликтСохранения(true);
          вЧерновик();
        },
        // dirty НЕ снимается — правки в окне не теряются, причину сервера показываем.
        fail: (reason) => {
          if (статьяСейчас.current !== путь) return;
          setОшибка(сПричиной('ошибкаСохранения', reason, 'измененияНаМесте'));
          вЧерновик();
        },
      },
    );
  }
}
