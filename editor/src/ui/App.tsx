import {useEffect, useRef, useState} from 'react';
import {useMessage} from './useMessage';
import {Rail} from './zones/Rail';
import {Registry} from './zones/Registry';
import {TopBar} from './zones/TopBar';
import {VersionStrip} from './zones/VersionStrip';
import {VersionView} from './zones/VersionView';
import {ArticlePane} from './zones/ArticlePane';
import {makeСсылкаОбновлена} from './imageFormatSync';
import {useHistoryBack} from './useHistoryBack';
import {CommentGutter} from './zones/CommentGutter';
import {Bars} from './zones/Bars';
import {useCreate} from './useCreate';
import type {Field} from './headFields';
import {makeCoverUpload, makeImageInsert} from './editor/images';
import {makeVideoInsert, правилоВидео} from './editor/videoInsert';
import {makeVideoReplace} from './editor/videoReplace';
import {правилоАнимации} from './editor/imageGuard';
import {requestJson} from './api';
import {useDelete} from './useDelete';
import {useAutosave} from './useAutosave';
import {label, setLabels} from './labels';
import {makeReporter} from './errors';
import {useConflict} from './useConflict';
import {makeОтветАвтосохранения} from './mergeApply';
import {useSaving, type ПамятьЗаписей} from './useSaving';
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
  const [, setText] = useState(''); // Текст живёт в редакторе и в `текстСейчас`; это — для пересоздания зоны.
  const [dirty, setDirty] = useState(false);
  const [colors, setColors] = useState(true);
  const {ошибка, удача, действие, setОшибка, сообщитьУдачу} = useMessage();
  const [состояниеСохранения, setСостояниеСохранения] = useState<SaveState>('сохранено');
  const {runSafe, сПричиной} = makeReporter(setОшибка);
  const автосохранение = useAutosave(settings?.хранение.автосохранениеСек ?? 0, setСостояниеСохранения, setОшибка);
  const версии = useVersions({
    // Не отменяем, а дописываем: отменённая правка осталась бы только в спрятанном редакторе.
    дописатьАвтосохранение: автосохранение.дописать,
    onОшибка: (причина) => setОшибка(сПричиной('ошибкаВерсии', причина)),
  });
  // Текст и шапка в ref: пока запрос идёт, человек печатает, и ответ сравнивает «что сохраняли» с «что в окне».
  const текстСейчас = useRef('');
  const шапкаСейчас = useRef('');
  // Открытая статья и просмотр — в ref: их читают замыкания редактора и поздние ответы; ставит переход.
  const статьяСейчас = useRef<string | null>(null);
  // Номер захода в статью: та же статья, открытая заново, — уже другое окно.
  const открытие = useRef(0);
  const последняяЗапись = useRef<ПамятьЗаписей | null>(null); // свои записи этого захода: `базаЗаписи`
  const просмотрРеф = useRef(false);
  // Пока грузится обложка, человек мог уйти в другую статью, в просмотр версии или открыть эту же
  // заново: во всех трёх случаях путь в шапку не пишется. Признаки берутся из ref по той же причине.
  const загрузитьОбложку = makeCoverUpload({
    runSafe, статья: статьяСейчас, заход: открытие, просмотр: просмотрРеф,
  });
  // Вставка картинки и ролика живёт по тем же признакам окна: пока файл ехал, человек мог уйти
  // в другую статью, открыть её заново или уйти в просмотр старой версии.
  const признакиОкна = {runSafe, статья: статьяСейчас, заход: открытие, просмотр: просмотрРеф};
  const положитьКартинку = makeImageInsert({...признакиОкна, правилоГифа: правилоАнимации(settings)});
  const положитьВидео = makeVideoInsert({...признакиОкна, правило: правилоВидео(settings)});
  const сменитьВидео = makeVideoReplace({...признакиОкна, правило: правилоВидео(settings)});

  // Пара «тело + шапка» в окне: обычная правка и подстановка целой пары при возврате к версии.
  const {подстановка, вЧерновик, правка, правитьПоля, поставитьДату, поставитьОбложку, поставитьДоступность, отметить, положитьПару} = useWindowText({
    article, roots: settings?.контент ?? [], общаяОбложка: settings?.сайт?.обложкаПоУмолчанию ?? null, текстСейчас, шапкаСейчас, автосохранение,
    setArticle, setFields, setDirty, setСостояние: setСостояниеСохранения,
  });

  // Актуальные настройки в ref: обработчик «назад» ставится один раз и иначе поймал бы старое (null) значение.
  const settingsRef = useRef<Settings | null>(null);
  settingsRef.current = settings;

  const {refresh, open, closeArticle} = useNavigation({
    article, settingsRef, автосохранение, версии, текстСейчас, шапкаСейчас, статьяСейчас, открытие, runSafe,
    setArticles, setArticle, setFields, setText, setMode, setDirty,
    setОшибка, setСостояние: setСостояниеСохранения,
  });

  // Кнопка «назад» браузера — отдельным правилом: реестр — начальный экран, выхода из программы нет.
  // Восстановление статьи после обновления страницы ждёт настроек: без них открыватель
  // ничего не сделает и промолчит (ED-039).
  useHistoryBack({open, closeArticle: () => void closeArticle(), готовы: settings !== null});

  const создание = useCreate({
    открыть: (path) => open(path),
    обновить: refresh,
    onОшибка: setОшибка,
    onСоздано: сообщитьУдачу,
  });

  const setСпор = (спор: Article['спор']): void => setArticle((было) => (было ? {...было, спор} : было));
  const расхождение = useConflict({
    article, setArticle, положитьПару, setОшибка, сПричиной,
    актуально: (путь, заход) => статьяСейчас.current === путь && открытие.current === заход,
  });
  // Ответ автосохранения может принести сведённый текст, новый файл или расхождение.
  автосохранение.ответСервера.current = makeОтветАвтосохранения({статьяСейчас, setArticle, положитьПару});

  const {save} = useSaving({
    article, settings, fields, текстСейчас, шапкаСейчас, статьяСейчас, открытие, автосохранение, последняяЗапись,
    setArticle, setDirty, setОшибка, setСпор, setСостояние: setСостояниеСохранения,
    refresh, сПричиной, вЧерновик: () => вЧерновик(),
    // Сервер свёл нашу работу с внешней правкой: в окно кладём то, что действительно в файле,
    // и той же парой двигаем базу сравнения — иначе окно сразу зажгло бы «есть несохранённые».
    положитьЗаписанное: (пара) => положитьПару(пара, пара),
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
    onОшибка: (текст) => setОшибка(сПричиной('ошибкаУдаления', текст)), onУдалено: сообщитьУдачу,
  });

  useEffect(() => {
    requestJson<Settings>('/api/settings')
      .then((loaded) => {
        setLabels(loaded.подписи);
        setSettings(loaded);
      })
      .catch((error: unknown) => setОшибка(error instanceof Error ? error.message : label('ошибкаЗапроса')));
    void refresh();
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
        onOpen={(path) => open(path)}
        onColors={setColors}
        onSave={save}
        // Дату, обложку и доступность ставит публикация: строка ложится в шапку окна и уезжает тем же сохранением.
        onДата={async (дата) => settings !== null && поставитьДату(дата, settings) && save()}
        onОбложка={async (адрес) => settings !== null && поставитьОбложку(адрес, settings) && save()}
        onДоступность={async (режим) => settings !== null && (поставитьДоступность(режим, settings) === 'нечего' || save())}
        fields={fields}
        удаление={удаление}
        onОбновить={refresh} окноСейчас={() => `${статьяСейчас.current ?? ''}|${открытие.current}`}
        onСообщить={setОшибка}
        onУдача={сообщитьУдачу}
        // Просмотр версии ничего не пишет: пишущие кнопки шапки на это время заперты.
        просмотр={просмотрИдёт}
      />

      <Bars
        settings={settings}
        article={реестр ? null : article}
        ошибка={ошибка} удача={удача} действие={действие}
        onЗакрытьОшибку={() => setОшибка(null)}
        расхождение={расхождение}
        просмотрИдёт={просмотрИдёт}
        реестр={реестр}
        спрашиваемВозврат={возврат.спрашиваем()}
        откатДоступен={возврат.откатДоступен()}
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
          <Registry settings={settings} articles={articles} onOpen={(path) => void open(path)} onОбновить={refresh} onУдача={сообщитьУдачу} создание={создание} />
        ) : (
          <>
            {/* Всё, что показывается вместо открытой статьи, встаёт РЯДОМ с рабочим редактором,
                а не вместо него: и реестр, и просмотр версии. Убрать редактор с экрана значит
                пересоздать его при возврате — из текста, каким статья открывалась, — то есть
                потерять несохранённую правку и всю историю отмены. */}
            {реестр && (
              <Registry settings={settings} articles={articles} onOpen={(path) => void open(path)} onОбновить={refresh} onУдача={сообщитьУдачу} создание={создание} />
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
              onСообщить={setОшибка}
              // Возврат к версии кладёт текст сюда транзакцией: пересоздание зоны стёрло бы
              // историю отмены вместе с обещанием обратимости.
              подстановка={подстановка}
              // Дописывать картинку можно, только если это всё ещё та же статья, тот же заход
              // в неё и не идёт просмотр старой версии: иначе разметка уедет в чужой или уже
              // уничтоженный редактор. Признаки берутся из ref: пока файл ехал, всё могло смениться.
              вставитьКартинку={положитьКартинку}
              вставитьВидео={положитьВидео}
              заменитьВидео={сменитьВидео}
              загрузить={загрузитьОбложку}
              // Смена формата картинки требует, чтобы файл был ровно тем, что видит человек.
              сохранено={!dirty && состояниеСохранения === 'сохранено' && article!.спор === null}
              ссылкаОбновлена={makeСсылкаОбновлена({текстСейчас, setText, setArticle})}
            />

            {!реестр && !просмотрИдёт && <CommentGutter settings={settings} />}
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
