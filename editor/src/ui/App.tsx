import {useEffect, useRef, useState} from 'react';
import type {Deletion} from '../core/colorize';
import {Rail} from './zones/Rail';
import {Registry} from './zones/Registry';
import {TopBar} from './zones/TopBar';
import {VersionStrip} from './zones/VersionStrip';
import {VersionView} from './zones/VersionView';
import {ArticlePane} from './zones/ArticlePane';
import {CommentGutter} from './zones/CommentGutter';
import {Bars} from './zones/Bars';
import {useCreate} from './useCreate';
import type {Field} from './headFields';
import {makeCoverUpload, pasteImage} from './editor/images';
import {requestJson} from './api';
import {useDelete} from './useDelete';
import {useAutosave} from './useAutosave';
import {label, setLabels} from './labels';
import {makeReporter} from './errors';
import {useConflictChoice} from './useConflictChoice';
import {useSaving} from './useSaving';
import {useNavigation} from './useNavigation';
import {useVersions} from './useVersions';
import {useVersionRestore} from './useVersionRestore';
import {useWindowText} from './useWindowText';
import {applyLayerColors} from './layerColors';
import {Boot} from './zones/Boot';
import type {Article, ArticleRow, PanelMode, SaveState, Settings} from './types';

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [mode, setMode] = useState<PanelMode>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  // Текст живёт в редакторе и в `текстСейчас`; состояние нужно только для пересоздания зоны.
  const [, setText] = useState('');
  const [deletions, setDeletions] = useState<Deletion[]>([]);
  const [dirty, setDirty] = useState(false);
  const [colors, setColors] = useState(true);
  const [ошибка, setОшибка] = useState<string | null>(null);
  const [состояниеСохранения, setСостояниеСохранения] = useState<SaveState>('сохранено');
  const [конфликтСохранения, setКонфликтСохранения] = useState(false);
  const {runSafe, сПричиной} = makeReporter(setОшибка);
  const автосохранение = useAutosave(settings?.хранение.автосохранениеСек ?? 0, setСостояниеСохранения);
  const версии = useVersions({
    // Не отменяем, а дописываем: отменённая правка осталась бы только в спрятанном редакторе.
    дописатьАвтосохранение: автосохранение.дописать,
    onОшибка: (причина) => setОшибка(сПричиной('ошибкаВерсии', причина)),
  });
  const {взятьЧерновик, взятьФайл} = useConflictChoice({
    article, roots: settings?.контент ?? [], общаяОбложка: settings?.сайт?.обложкаПоУмолчанию ?? null, setArticle, setText, setFields,
    setDirty, setСостояние: setСостояниеСохранения,
    запомнить: (body, frontmatterRaw) => {
      текстСейчас.current = body;
      шапкаСейчас.current = frontmatterRaw;
    },
    // Пишем в черновик то, что теперь в окне: оно равно файлу, и сервер такой черновик убирает.
    отброситьЧерновик: () => {
      вЧерновик();
      void автосохранение.дописать();
    },
  });
  // Текст и шапка в ref: пока запрос идёт, человек печатает, и ответ должен сравнить
  // «что сохраняли» с «что в окне сейчас».
  const текстСейчас = useRef('');
  const шапкаСейчас = useRef('');
  // Какая статья открыта и идёт ли просмотр — в ref: эти признаки читают замыкания редактора
  // и поздние ответы запросов, созданные ещё до того, как всё поменялось.
  // Значение ставит переход (сразу, а не при отрисовке); здесь только начальное состояние.
  const статьяСейчас = useRef<string | null>(null);
  // Номер захода в статью: та же статья, открытая заново, — уже другое окно.
  const открытие = useRef(0);
  const просмотрРеф = useRef(false);
  // Пока грузится обложка, человек мог уйти в другую статью, в просмотр версии или открыть эту же
  // заново: во всех трёх случаях путь в шапку не пишется. Признаки берутся из ref по той же причине.
  const загрузитьОбложку = makeCoverUpload({
    runSafe, статья: статьяСейчас, заход: открытие, просмотр: просмотрРеф,
  });

  // Пара «тело + шапка» в окне: обычная правка и подстановка целой пары при возврате к версии.
  const {подстановка, вЧерновик, правка, правитьПоля, отметить, положитьПару} = useWindowText({
    article, roots: settings?.контент ?? [], общаяОбложка: settings?.сайт?.обложкаПоУмолчанию ?? null, текстСейчас, шапкаСейчас, автосохранение,
    setArticle, setFields, setDirty, setСостояние: setСостояниеСохранения, setКонфликтСохранения,
  });

  // Актуальные настройки в ref: обработчик «назад» ставится один раз и иначе поймал бы старое (null) значение.
  const settingsRef = useRef<Settings | null>(null);
  settingsRef.current = settings;

  const {refresh, open, closeArticle} = useNavigation({
    article, settingsRef, автосохранение, версии, текстСейчас, шапкаСейчас, статьяСейчас, открытие, runSafe,
    setArticles, setArticle, setFields, setText, setDeletions, setMode, setDirty,
    setОшибка, setКонфликтСохранения, setСостояние: setСостояниеСохранения,
  });

  // Свежий обработчик «назад» в ref — сам обработчик ставится один раз (см. useEffect ниже).
  const переходыРеф = useRef<(event: PopStateEvent) => void>(() => undefined);
  переходыРеф.current = (event: PopStateEvent) => {
    const st = event.state as {вид?: string; path?: string} | null;
    if (st?.вид === 'статья' && st.path) void open(st.path, false);
    else void closeArticle();
  };

  const создание = useCreate({
    открыть: (path) => open(path),
    обновить: refresh,
    onОшибка: setОшибка,
    onСоздано: setОшибка,
  });

  const {save} = useSaving({
    article, settings, fields, текстСейчас, шапкаСейчас, статьяСейчас, открытие, автосохранение,
    setArticle, setDirty, setОшибка, setКонфликтСохранения, setСостояние: setСостояниеСохранения,
    refresh, сПричиной, вЧерновик: () => вЧерновик(),
    // Работа записана в файл — откатывать больше не к чему, на диске уже другое состояние.
    послеЗаписи: () => возврат.забытьСнимок(),
  });

  const возврат = useVersionRestore({
    article, текстСейчас, шапкаСейчас, статьяСейчас, открытие, автосохранение, вЧерновик,
    положитьПару, отметить, версии, onОшибка: (ключ) => setОшибка(label(ключ)),
  });

  const удаление = useDelete({
    путь: () => статьяСейчас.current, заход: () => открытие.current,
    автосохранение, обновить: refresh, закрытьСтатью: closeArticle,
    onОшибка: (текст) => setОшибка(сПричиной('ошибкаУдаления', текст)), onУдалено: setОшибка,
  });

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
    // Обработчик ставится один раз, поэтому зовёт свежие переходы через ref: иначе он навсегда
    // запомнил бы самые первые, у которых открытой статьи ещё не было, — и при сбое записи
    // черновика не смог бы вернуть шаг истории на статью.
    const назад = (event: PopStateEvent) => переходыРеф.current(event);
    window.addEventListener('popstate', назад);
    return () => window.removeEventListener('popstate', назад);
  }, []);

  useEffect(() => {
    if (settings) applyLayerColors(settings.слои);
  }, [settings]);

  // Настройки не загрузились — показываем причину словами, а не бесконечную «Загрузку».
  if (!settings) return <Boot ошибка={ошибка} />;

  const title = (fields.find((field) => field.key === 'title')?.display ?? article?.title ?? '');

  // Реестр — стартовый экран: пока статья не открыта, показывать больше нечего.
  const реестр = mode === 'статьи' || article === null;

  // Просмотр начинается НАЖАТИЕМ, а не приходом ответа. Всё, что запрещено в просмотре, запрещено
  // и в щели ожидания: автосохранение там уже снято, редактор спрятан, и оставить живой кнопку,
  // которая пишет файл или подменяет рабочий текст, значит оставить ту же дыру.
  const просмотрИдёт = версии.просмотр !== null || версии.занято;
  просмотрРеф.current = просмотрИдёт;

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
        onSave={save}
        fields={fields}
        onDelete={() => void удаление.удалить()}
        удаление={удаление.идёт}
        // Просмотр версии ничего не пишет: пишущие кнопки шапки на это время заперты.
        просмотр={просмотрИдёт}
      />

      <Bars
        settings={settings}
        article={реестр ? null : article}
        ошибка={ошибка}
        onЗакрытьОшибку={() => setОшибка(null)}
        конфликтСохранения={конфликтСохранения}
        просмотрИдёт={просмотрИдёт}
        реестр={реестр}
        спрашиваемВозврат={возврат.спрашиваем()}
        откатДоступен={возврат.откатДоступен()}
        onВзятьЧерновик={взятьЧерновик}
        onВзятьФайл={взятьФайл}
        onСохранитьПоверх={() => void save(true)}
        onПеречитать={() => void open(article!.path, false)}
        onПодтвердитьВозврат={() => void возврат.подтвердить()}
        onОтменитьВозврат={возврат.отменитьПодтверждение}
        onОткатить={() => void возврат.откатить()}
      />

      <VersionStrip
        settings={settings}
        visible={mode === 'версии' && article !== null}
        сеансы={версии.сеансы}
        выбрано={версии.просмотр?.имя ?? null}
        // Пока идёт запись возврата, лента заперта: иначе человек ушёл бы на другую версию,
        // и на диске остался бы черновик от возврата, которого в окне уже нет.
        занято={возврат.идёт}
        onВыбрать={(версия) => void версии.открыть(article!.path, версия)}
        onСейчас={версии.закрыть}
      />

      <div className="body">
        <Rail
          settings={settings}
          mode={mode}
          articleOpen={article !== null}
          onMode={(next) => void сменитьРежим(next)}
        />

        {article === null ? (
          <Registry settings={settings} articles={articles} onOpen={(path) => void open(path)} создание={создание} />
        ) : (
          <>
            {/* Всё, что показывается вместо открытой статьи, встаёт РЯДОМ с рабочим редактором,
                а не вместо него: и реестр, и просмотр версии. Убрать редактор с экрана значит
                пересоздать его при возврате — из текста, каким статья открывалась, — то есть
                потерять несохранённую правку и всю историю отмены. */}
            {реестр && (
              <Registry settings={settings} articles={articles} onOpen={(path) => void open(path)} создание={создание} />
            )}

            {версии.просмотр && (
              <VersionView
                settings={settings}
                версия={версии.просмотр}
                path={article!.path}
                onЗакрыть={версии.закрыть}
                onВернуть={() => void возврат.вернуть(версии.просмотр!, dirty)}
                занято={возврат.идёт}
                возвратНедоступен={возврат.недоступен}
              />
            )}

            <ArticlePane
              скрыт={реестр || просмотрИдёт}
              // Ключ с решением по черновику и номером захода: сменили источник текста или
              // открыли статью заново — редактор пересоздаётся. Без номера захода повторное
              // открытие той же статьи оставляло бы в спрятанной зоне текст прошлого раза,
              // и он затёр бы внешнюю правку при следующем сохранении.
              key={`${article!.path}|${article!.черновикРешение}|${article!.заход ?? 0}`}
              settings={settings}
              article={article!}
              fields={fields}
              // Пара «тело + шапка» собирается из ref: обработчики живут в замыкании редактора
              // и через состояние свежее значение соседа получить не успевают.
              onFields={(next) => правитьПоля(next, settings)}
              onText={(next) => {
                setText(next);
                правка(next, шапкаСейчас.current);
              }}
              onDeletions={setDeletions}
              // Возврат к версии кладёт текст сюда транзакцией: пересоздание зоны стёрло бы
              // историю отмены вместе с обещанием обратимости.
              подстановка={подстановка}
              // Дописывать картинку можно, только если это всё ещё та же статья и не идёт просмотр:
              // иначе разметка уедет в чужой или уже уничтоженный редактор.
              onPaste={(file, view) => void runSafe(() => pasteImage(file, article!.path, view,
                () => !просмотрРеф.current && статьяСейчас.current === article!.path))}
              загрузить={загрузитьОбложку}
            />

            {!реестр && !просмотрИдёт && <CommentGutter settings={settings} deletions={deletions} />}
          </>
        )}
      </div>
    </div>
  );

  /**
   * Переключение левой полосы. Уход в реестр — это уход из статьи: ждущая правка дописывается,
   * и при неудаче записи мы остаёмся в статье, как и при закрытии. Иначе человек уже видит
   * реестр, закрывает вкладку, а последняя правка не попала ни в файл, ни в черновик.
   * Просмотр версии при уходе прекращается, а не прячется.
   */
  async function сменитьРежим(next: PanelMode): Promise<void> {
    if (next === 'статьи' && article && !(await автосохранение.дописать())) return;
    if (next === 'статьи') версии.закрыть();

    setMode(next);
    // Лента перечитывается при каждом открытии панели: пока она была закрыта, версий могло
    // прибавиться — и от нашего сохранения, и от правки снаружи.
    if (next === 'версии' && article) void версии.обновить(article.path);
  }

}
