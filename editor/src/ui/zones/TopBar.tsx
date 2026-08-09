import {useState} from 'react';
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
  onVisibility: (скрыть: boolean) => void;
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
  // Вместе с вопросом запоминается статья: перешли на другую — нажатие «Удалить навсегда»
  // относилось бы уже к ней, а человек спрашивал совсем про другую.
  const [спрашиваю, setСпрашиваю] = useState<string | null>(null);
  const спросили = спрашиваю !== null && спрашиваю === props.article?.path;

  return (
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

            return (
              <button
                key={code}
                className={`lang lang-${срыв ? 'срыв' : state}${here ? ' lang-on' : ''}`}
                title={срыв ? props.settings.реестр.нетНаСайте : подсказка(code, state, props.settings)}
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
            <button
              className={props.article.скрыта ? 'ghost ghost-on' : 'ghost'}
              title={props.просмотр ? п.идётПросмотр : п.переключитьВидимость}
              disabled={props.просмотр}
              onClick={() => props.onVisibility(!props.article!.скрыта)}
            >
              {props.article.скрыта ? в.поСсылке : в.вМеню}
            </button>
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

        <button className="ghost" disabled title={п.скороПодготовить}>
          {п.подготовить}
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
            <button className="ghost" onClick={() => setСпрашиваю(props.article!.path)}>{п.удалитьСтатью}</button>
          )
        )}

        <button className="ghost" disabled title={п.скороОпубликовать}>
          {п.опубликовать}
        </button>
      </div>
    </header>
  );
}

function подсказка(code: string, state: string, settings: Settings): string {
  const язык = settings.локали[code] ?? code;
  if (state === 'нет') return `${язык}: ${settings.подписи.версииНет}`;
  if (state === 'устарела') return `${язык}: ${settings.подписи.версияУстарела}`;
  return язык;
}
