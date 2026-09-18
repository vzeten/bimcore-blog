import type {Остановка} from '../usePublish';
import type {PrepareFinding} from '../publishTypes';
import type {Settings} from '../types';

/**
 * Почему не опубликовано — по нажатию на «Не опубликовано» (решение владельца 2026-09-18, п.5а, макет
 * одобрен): одна строка причины, «На сайт ничего не ушло», [Перейти к месту] (если место известно)
 * и [Понятно]. Всё остальное, что сервер приложил к отказу, — свёрнутые сведения для диагностики.
 */
export function PublishReason(props: {
  settings: Settings;
  остановка: Остановка;
  onПерейти: (место: {путь: string; строка: number}) => void;
  onПонятно: () => void;
}) {
  const п = props.settings.публикация;
  const {находки, чужие, разрывы, невосстановленные, вывод} = props.остановка;
  const место = местоОстановки(props.остановка);

  return (
    <section className="publish" aria-live="polite">
      <p className="publish-block">{строкаПричины(props.остановка, props.settings)}</p>
      <p className="publish-quiet">{п.ничегоНеУшло}</p>
      <div className="publish-actions">
        {место !== null && (
          <button type="button" className="ghost ghost-main" onClick={() => props.onПерейти(место)}>{п.перейтиКМесту}</button>
        )}
        <button type="button" className="ghost" onClick={props.onПонятно}>{п.понятно}</button>
      </div>

      {(находки.length > 1 || разрывы.length > 0 || чужие.length > 0 || невосстановленные.length > 0 || вывод !== '') && (
        <details className="publish-tech">
          <summary>{п.подробности}</summary>
          {находки.length > 1 && <Находки список={находки} settings={props.settings} />}
          {разрывы.length > 0 && <Пути список={разрывы.map((разрыв) => `${props.settings.выпуск.разрывы[разрыв.причина] ?? разрыв.причина}${разрыв.путь ? `: ${разрыв.путь}` : ''}`)} />}
          {/* Посторонний файл — чужая работа, непривёденный путь — наша незаконченная. */}
          {невосстановленные.length > 0 && <><p className="publish-quiet">{п.неПривелось} {невосстановленные.length}</p><Пути список={невосстановленные} /></>}
          {чужие.length > 0 && <><p className="publish-quiet">{п.постороннего} {чужие.length}</p><Пути список={чужие} /></>}
          {вывод !== '' && <pre className="publish-log">{вывод}</pre>}
        </details>
      )}
    </section>
  );
}

/** Находки проверок словами человека; код без своей фразы называется прямо, а не проглатывается. */
export function Находки(props: {список: PrepareFinding[]; settings: Settings}) {
  const п = props.settings.подготовка;

  return (
    <ul className="publish-list">
      {props.список.map((находка, номер) => (
        <li
          key={`${находка.код}|${находка.путь ?? ''}|${номер}`}
          className={находка.уровень === 'блокер' ? 'publish-item publish-block' : 'publish-item'}
        >
          <span className="publish-label">{п.уровни[находка.уровень] ?? находка.уровень}</span>
          <span>{словаНаходки(находка, props.settings)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Просто перечень строк: техническая подробность, которая на решение не влияет. */
function Пути(props: {список: string[]}) {
  return (
    <ul className="publish-list">
      {props.список.map((путь, номер) => <li key={`${путь}|${номер}`} className="publish-item publish-block"><span>{путь}</span></li>)}
    </ul>
  );
}

/** Фраза находки и то, о чём она: адрес ссылки, имя компонента, текст разборщика. */
function словаНаходки(находка: PrepareFinding, settings: Settings): string {
  const п = settings.подготовка;
  const фраза = п.находки[находка.код] ?? `${п.неизвестнаяНаходка} ${находка.код}`;
  const где = находка.строка ? settings.публикация.место.replace('{строка}', String(находка.строка)) : '';
  return [фраза, находка.значение ?? '', где].filter(Boolean).join(' ');
}

/**
 * Одна строка причины: первая находка словами (со счётом остальных) либо причина окна, либо слова
 * сервера. Человек читает одну строку — остальное свёрнуто в сведения.
 */
export function строкаПричины(остановка: Остановка, settings: Settings): string {
  const п = settings.публикация;
  if (остановка.находки.length > 0) {
    const ещё = остановка.находки.length - 1;
    const первая = словаНаходки(остановка.находки[0], settings);
    return ещё > 0 ? `${первая} ${п.ещё.replace('{n}', String(ещё))}` : первая;
  }
  if (остановка.ключ === null) return остановка.текст;
  return п.причины[остановка.ключ] ?? остановка.ключ;
}

/** Место в статье, куда можно перейти: первая находка, у которой известны файл и строка тела. */
export function местоОстановки(остановка: Остановка): {путь: string; строка: number} | null {
  const находка = остановка.находки.find((н) => typeof н.путь === 'string' && н.путь !== '' && typeof н.строка === 'number');
  return находка ? {путь: находка.путь as string, строка: находка.строка as number} : null;
}
