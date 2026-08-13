import {useState} from 'react';
import {изменениеНеНаСайте, скрытаВОкне, type Field} from '../headFields';
import {PrepareReport} from './PrepareReport';
import {ReleasePanel} from './ReleasePanel';
import {usePrepare} from '../usePrepare';
import {useRelease} from '../useRelease';
import type {Article, SaveState, Settings} from '../types';

export function TopBar(props: {
  settings: Settings;
  article: Article | null;
  title: string;
  dirty: boolean;
  состояниеСохранения: SaveState;
  colors: boolean;
  onOpen: (path: string) => void;
  onColors: (value: boolean) => void;
  onSave: () => void;
  /** Поля шапки в окне: из них берётся видимость — своего признака у шапки окна нет. */
  fields: Field[];
  /** Удаление статьи целиком. Спрашивается здесь же, применяется только после ответа сервера. */
  onDelete: () => void;
  /** Идёт удаление: второе нажатие ничего не запускает, пока сервер не ответил. */
  удаление: boolean;
  /** Идёт просмотр старой версии: писать на диск нельзя ничем, включая видимость. */
  просмотр: boolean;
}) {
  const п = props.settings.подписи;
  const в = props.settings.видимость;
  // Вопрос живёт в шапке и гаснет сам: отдельного окна ради двух кнопок заводить незачем.
  // Вместе с вопросом запоминается не только статья, но и заход в неё: перешли на другую —
  // нажатие «Удалить навсегда» относилось бы уже к ней. Заход нужен и там, где путь тот же:
  // статью удалили и тут же создали заново с тем же адресом, и над новой статьёй висел бы
  // вопрос, которого человек не задавал, с готовой кнопкой необратимого удаления.
  const окно = props.article === null ? null : `${props.article.path}|${props.article.заход ?? 0}`;
  const [спрашиваю, setСпрашиваю] = useState<string | null>(null);
  const спросили = спрашиваю !== null && спрашиваю === окно;

  const скрыта = скрытаВОкне(props.fields);
  const неНаСайте = изменениеНеНаСайте(props.article, скрыта);
  // Подготовка живёт рядом со своей кнопкой: она ничего не пишет и никого, кроме отчёта под
  // шапкой, не касается — тянуть её через всю сборку окна незачем.
  const подготовка = usePrepare(props.article?.path ?? null, props.dirty);
  // Выпуск живёт рядом с подготовкой и по тому же правилу: правка статьи гасит и состав, и сборку.
  const выпуск = useRelease(props.article?.path ?? null, props.dirty);

  return (
    <>
    <header className="topbar">
      <div className="topbar-name">
        <span className="topbar-title">{props.article ? props.title : п.программа}</span>
        {props.article && (
          <span className="topbar-path">
            {props.article.category} · {props.article.path}
          </span>
        )}
      </div>

      {props.article && (
        <div className="topbar-locales">
          {Object.keys(props.settings.локали).map((code) => {
            const state = props.article!.states[code] ?? 'нет';
            const path = props.article!.versions[code];
            const here = path === props.article!.path;
            // Нет обязательного языка — статьи нет на сайте вовсе. Это ошибка, а не дыра в переводах.
            const срыв = state === 'нет' && code === props.settings.обязательныйЯзык && props.article!.нетНаСайте;
            // Своя версия — по окну, соседние — по диску. Иначе флажок в свойствах и кнопка
            // языка начали бы противоречить друг другу сразу после переключения, до сохранения.
            const своя = here ? скрыта : props.article!.видимостьВерсий?.[code] === true;
            const спрятана = state !== 'нет' && своя;

            return (
              <button
                key={code}
                className={`lang lang-${срыв ? 'срыв' : state}${here ? ' lang-on' : ''}${спрятана ? ' lang-скрыта' : ''}`}
                title={срыв ? props.settings.реестр.нетНаСайте : подсказка(code, state, спрятана, props.settings)}
                disabled={state === 'нет'}
                onClick={() => path && props.onOpen(path)}
              >
                {code.toUpperCase()}
                {state === 'устарела' && <span className="lang-mark">•</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="topbar-actions">
        <button
          className={props.colors ? 'ghost ghost-on' : 'ghost'}
          title={props.colors ? п.цветаВыкл : п.цветаВкл}
          onClick={() => props.onColors(!props.colors)}
        >
          ◐
        </button>

        {props.article && (
          <>
            <span className="status" title={п.готовность}>{props.article.готовность}</span>
            {/* Видимость — не кнопка: меняется она в свойствах статьи и уезжает на диск обычным
                «Сохранить». Здесь только правда о том, что человек получит на сайте, и она
                про ОТКРЫТУЮ языковую версию: у соседних версий видимость своя (SPEC 2.8). */}
            <span className={скрыта ? 'visibility visibility-off' : 'visibility'} title={п.видимость}>
              {скрыта ? в.поСсылке : в.вМеню}
              {/* Файл изменён, но сайт этого ещё не видит: обещать «скрыто» было бы враньём. */}
              {неНаСайте && <span className="visibility-pending">{п.неНаСайте}</span>}
            </span>
          </>
        )}

        {/* Состояние автосохранения: человек видит, что работа не потеряется, ещё до кнопки. */}
        {props.article && (
          <span
            className={props.состояниеСохранения === 'неУдалосьАвтосохранить' ? 'autosave autosave-fail' : 'autosave'}
            title={п.файлИзменёнСнаружи && props.article.черновикРешение === 'конфликт' ? п.файлИзменёнСнаружи : ''}
          >
            {props.article.черновикРешение === 'конфликт' ? п.файлИзменёнСнаружи : п[props.состояниеСохранения]}
          </span>
        )}

        {/* В просмотре версии непонятно, что сохранять — увиденное или набранное. Кнопка заперта. */}
        <button
          className="ghost"
          disabled={!props.dirty || props.просмотр}
          title={props.просмотр ? п.идётПросмотр : ''}
          onClick={props.onSave}
        >
          {props.dirty ? п.сохранить : п.сохранено}
        </button>

        {/* Подготовка судит о том, что записано в файл, поэтому с несохранёнными правками кнопка
            заперта: иначе отчёт говорил бы не о том, что человек видит на экране. В просмотре
            старой версии она заперта по той же причине, что и «Сохранить». */}
        <button
          className="ghost"
          disabled={подготовка.идёт || props.dirty || props.просмотр || !props.article}
          title={заперта(props, п)}
          onClick={() => void подготовка.запустить()}
        >
          {подготовка.идёт ? п.подготовкаИдёт : п.подготовить}
        </button>

        {/* Удаление предлагается только у статьи, которой ещё нет на сайте: у вышедшей его нет
            вовсе, чтобы человек не тянулся к кнопке, которая ему всё равно откажет. Последнее
            слово за сервером — он проверяет все языковые версии заново. */}
        {/* Ветку прочитать не удалось — удаление статьи сайта не предлагается: сервер в этом
            случае отказывает, и кнопка обещала бы то, чего не будет. Песочницы это не касается:
            она живёт вне сайта, и опубликованная ветка про неё ничего не решает. */}
        {props.article && props.article.естьНаСайте !== true && !props.article.служебная && !props.просмотр
          && (props.article.веткаИзвестна !== false || props.article.внеСайта === true) && (
          спросили ? (
            <>
              <span className="topbar-ask">{п.удалениеСпросить}</span>
              <button className="ghost ghost-danger" disabled={props.удаление} onClick={props.onDelete}>
                {props.удаление ? п.удалениеИдёт : п.удалитьНавсегда}
              </button>
              <button className="ghost" disabled={props.удаление} onClick={() => setСпрашиваю(null)}>
                {п.неУдалять}
              </button>
            </>
          ) : (
            <button className="ghost" onClick={() => setСпрашиваю(окно)}>{п.удалитьСтатью}</button>
          )
        )}

        <button className="ghost" disabled title={п.скороОпубликовать}>
          {п.опубликовать}
        </button>
      </div>
    </header>

    <PrepareReport
      settings={props.settings}
      отчёт={подготовка.отчёт}
      ошибка={подготовка.ошибка}
      onЗакрыть={подготовка.закрыть}
      onКВыпуску={() => void выпуск.начать()}
      кВыпускуДоступен={выпуск.шаг === 'нет' && выпуск.состав === null}
    />

    <ReleasePanel settings={props.settings} выпуск={выпуск} />
    </>
  );
}

/**
 * Почему кнопка подготовки заперта. Молчаливо запертая кнопка выглядит поломкой: человек видит
 * «Подготовить» и не понимает, отчего оно не нажимается.
 */
function заперта(
  props: {dirty: boolean; просмотр: boolean; article: Article | null},
  п: Settings['подписи'],
): string {
  if (props.просмотр) return п.идётПросмотр;
  if (props.article && props.dirty) return п.сначалаСохранитеДляПодготовки;

  return '';
}

/**
 * Что сказать про языковую версию при наведении. Признаки складываются, а не заменяют друг друга:
 * версия бывает и устаревшей, и скрытой сразу, и человек должен узнать про оба.
 */
function подсказка(code: string, state: string, спрятана: boolean, settings: Settings): string {
  const язык = settings.локали[code] ?? code;
  if (state === 'нет') return `${язык}: ${settings.подписи.версииНет}`;

  const признаки = [
    state === 'устарела' ? settings.подписи.версияУстарела : null,
    спрятана ? settings.видимость.поСсылке : null,
  ].filter(Boolean);

  return признаки.length === 0 ? язык : `${язык}: ${признаки.join(', ')}`;
}
