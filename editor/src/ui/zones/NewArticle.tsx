import {useState} from 'react';
import {адресИзНазвания} from '../../core/newArticle.mjs';
import type {Settings} from '../types';

/**
 * Создание статьи: раздел выбран в дереве, человек вводит название и видит будущий адрес.
 *
 * Адрес показывается ДО создания и правится здесь же: после публикации его нельзя менять
 * без переадресации, поэтому момент выбора один, и он тут.
 */
export function NewArticle(props: {
  settings: Settings;
  /** Раздел, выбранный в дереве. Пусто — создавать негде, и это говорится прямо. */
  раздел: string | null;
  занято: boolean;
  onСоздать: (название: string, адрес: string, язык: string) => void;
  onЗакрыть: () => void;
}) {
  const п = props.settings.подписи;
  const [название, setНазвание] = useState('');
  const [адрес, setАдрес] = useState('');
  const [правлюАдрес, setПравлюАдрес] = useState(false);
  // Язык статьи: по умолчанию основной. Выбрали английский — заглушка не нужна, статья и есть
  // английская; выбрали любой другой — английская заглушка создаётся вместе с ней.
  const [язык, setЯзык] = useState(props.settings.основнойЯзык);

  // Пока человек не тронул адрес руками, он идёт из названия: владелец не должен придумывать
  // адреса, но и подменять его выбор, если он уже написал своё, программа не вправе.
  const итоговый = правлюАдрес ? адрес : адресИзНазвания(название);
  const готово = название.trim() !== '' && итоговый !== '' && props.раздел !== null && !props.занято;

  return (
    <div className="newarticle" role="dialog">
      <div className="newarticle-body">
        <label>
          <span>{п.названиеСтатьи}</span>
          <input
            autoFocus
            value={название}
            onChange={(event) => setНазвание(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && готово) props.onСоздать(название, итоговый, язык);
              if (event.key === 'Escape') props.onЗакрыть();
            }}
          />
        </label>

        <label>
          <span>{п.адресСтатьи}</span>
          <input
            value={итоговый}
            onChange={(event) => {
              setПравлюАдрес(true);
              setАдрес(event.target.value);
            }}
          />
        </label>

        <label>
          <span>{п.языкСтатьи}</span>
          <select value={язык} onChange={(event) => setЯзык(event.target.value)}>
            {Object.entries(props.settings.локали).map(([код, имя]) => (
              <option key={код} value={код}>{имя}</option>
            ))}
          </select>
        </label>

        <p className="newarticle-hint">
          {props.раздел === null ? п.выберитеРаздел : `${п.статьяЛяжет} ${props.раздел}`}
        </p>

        <div className="newarticle-buttons">
          <button className="ghost" disabled={!готово} onClick={() => props.onСоздать(название, итоговый, язык)}>
            {п.создать}
          </button>
          <button className="ghost" onClick={props.onЗакрыть}>{п.неСоздавать}</button>
        </div>
      </div>
    </div>
  );
}
