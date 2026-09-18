import {useState} from 'react';
import {useSiteState} from '../useSiteState';
import {значокСайта, type СостояниеСайта} from '../siteState';
import type {Settings} from '../types';

/**
 * Значок «Сайт» в верхней строке, виден на любом экране, в том числе в реестре (решение владельца
 * 2026-09-18, п.5б, макет одобрен). Сборки на компьютере нет — сайт собирает GitHub, и чем это
 * кончилось, человек узнаёт здесь: «Сайт обновляется» → «Сайт обновлён» (зелёный, гаснет сам) или
 * красный «Сайт не обновился» с причиной по упавшему шагу и ссылкой на отчёт GitHub.
 */
export function SiteBadge(props: {settings: Settings}) {
  const в = props.settings.выкладка;
  const {сайт, понятно} = useSiteState(в.окноСек, в.гаснетСек);
  const [открыт, setОткрыт] = useState(false);
  const вид = значокСайта(сайт);
  if (вид === 'нет' || сайт === null) return null;

  const нажимается = вид === 'неОбновился' || вид === 'неВидно';
  const класс = {обновляется: 'site-badge', обновлён: 'site-badge site-badge-ok', неОбновился: 'site-badge site-badge-fail', неВидно: 'site-badge site-badge-quiet'}[вид];
  const слово = вид === 'неВидно' ? `${в.неВидно} ${в.причины[сайт.причина ?? ''] ?? ''}`.trim() : в[вид];

  return (
    <div className="site-anchor">
      {нажимается ? (
        <button type="button" className={класс} onClick={() => setОткрыт(!открыт)} aria-expanded={открыт}>{слово}</button>
      ) : (
        <span className={класс} role="status">{слово}</span>
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

/** Что случилось: статья и языки, упавший шаг словами, что это значит для сайта, отчёт GitHub. */
function Подробно(props: {settings: Settings; сайт: СостояниеСайта; onПонятно: () => void}) {
  const в = props.settings.выкладка;
  const {сайт} = props;
  const языки = (сайт.локали ?? []).map((код) => props.settings.локали[код] ?? код).join(', ');
  const упала = сайт.состояние === 'сборкаУпала' || сайт.состояние === 'выкладкаУпала';

  return (
    <section className="publish" aria-live="polite">
      {сайт.путь && <p className="publish-quiet">{в.статья} {сайт.путь}{языки ? ` (${языки})` : ''}</p>}
      {упала && <p className="publish-block">{в[сайт.состояние as 'сборкаУпала' | 'выкладкаУпала']}</p>}
      {упала && сайт.шаг && <p className="publish-quiet">{в.шаг} {сайт.шаг}</p>}
      {упала && <p>{в.прежняяВерсия}{сайт.состояние === 'сборкаУпала' ? ` ${в.неПройдут}` : ''}</p>}
      {!упала && <p>{в.неВидноПояснение}</p>}
      <div className="publish-actions">
        {сайт.runUrl && <a className="ghost" href={сайт.runUrl} target="_blank" rel="noreferrer">{в.отчёт}</a>}
        <button type="button" className="ghost" onClick={props.onПонятно}>{в.понятно}</button>
      </div>
    </section>
  );
}
