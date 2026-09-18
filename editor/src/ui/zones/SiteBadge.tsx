import {useState} from 'react';
import {useSiteState} from '../useSiteState';
import {значокСайта, type СостояниеСайта} from '../siteState';
import type {Settings} from '../types';

/**
 * Значок «Сайт» в верхней строке, виден на любом экране, в том числе в реестре (решения владельца
 * 2026-09-18, п.5б, и 2026-09-19). Сборки на компьютере нет — сайт собирает GitHub, и чем это
 * кончилось, человек узнаёт здесь: «Сайт обновляется…» → «Сайт обновлён» (зелёный, гаснет сам) или
 * красный «Сайт не обновился» с объяснением и ссылкой на отчёт GitHub. Сайт не на GitHub или
 * публикаций не было — значка нет вовсе.
 */
export function SiteBadge(props: {settings: Settings}) {
  const в = props.settings.выкладка;
  const {сайт, понятно} = useSiteState(в.окноСек, в.гаснетСек);
  const [открыт, setОткрыт] = useState(false);
  const вид = значокСайта(сайт);
  if (вид === 'нет' || сайт === null) return null;

  const нажимается = вид === 'неОбновился' || вид === 'неизвестно';
  const класс = {обновляется: 'site-badge', обновлён: 'site-badge site-badge-ok', неОбновился: 'site-badge site-badge-fail', неизвестно: 'site-badge site-badge-quiet'}[вид];

  return (
    <div className="site-anchor">
      {нажимается ? (
        <button type="button" className={класс} onClick={() => setОткрыт(!открыт)} aria-expanded={открыт}>{в[вид]}</button>
      ) : (
        <span className={класс} role="status">{в[вид]}</span>
      )}
      {нажимается && открыт && (
        <Подробно settings={props.settings} сайт={сайт} onПонятно={() => {
          setОткрыт(false);
          понятно(сайт.sha);
        }} />
      )}
    </div>
  );
}

/**
 * Что это значит для человека: сбой GitHub — опубликовать позже; упала сборка — на сайте прежняя
 * версия, и следующие публикации тоже не дойдут; итог неизвестен — так и сказано. [Подробности] —
 * отчёт GitHub, [Понятно].
 */
function Подробно(props: {settings: Settings; сайт: СостояниеСайта; onПонятно: () => void}) {
  const в = props.settings.выкладка;
  const {сайт} = props;
  const текст = сайт.состояние === 'выкладкаУпала' ? в.сбойGitHub : сайт.состояние === 'сборкаУпала' ? в.прежняяВерсия : в.неизвестно;

  return (
    <section className="publish" aria-live="polite">
      <p>{текст}</p>
      <div className="publish-actions">
        {сайт.runUrl && <a className="ghost" href={сайт.runUrl} target="_blank" rel="noreferrer">{в.подробности}</a>}
        <button type="button" className="ghost" onClick={props.onПонятно}>{в.понятно}</button>
      </div>
    </section>
  );
}
