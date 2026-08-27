import type {PrepareFinding, PrepareReport as Отчёт} from '../publishTypes';
import type {Settings} from '../types';

/**
 * Отчёт подготовки: что мешает выпуску и что стоит поправить.
 *
 * Слова берутся из настроек по коду находки: правило отдаёт запись для программы, а не фразу для
 * человека, иначе рядом с правилом появился бы второй его источник (SPEC 4.4). Кода без своей
 * фразы быть не должно, но молчать о нём нельзя — показывается общая фраза с самим кодом.
 *
 * Отчёт честно называет этапы, которые не выполнялись вовсе: без этой строки «препятствий нет»
 * человек прочтёт как «сборка сайта это переживёт», а её на этом шаге никто не проверял.
 */
export function PrepareReport(props: {
  settings: Settings;
  отчёт: Отчёт | null;
  ошибка: string | null;
  onЗакрыть: () => void;
}) {
  const п = props.settings.подготовка;

  // Запрос не дошёл — это тоже ответ человеку, и молчать о нём нельзя.
  if (props.ошибка !== null) {
    return (
      <section className="prepare prepare-failed">
        <div className="prepare-head">
          <strong>{props.ошибка}</strong>
          <button className="ghost" onClick={props.onЗакрыть}>{п.закрыть}</button>
        </div>
      </section>
    );
  }

  if (props.отчёт === null) return null;

  const {находки, прошла, невыполненные} = props.отчёт;

  return (
    <section className="prepare" aria-label={п.заголовок}>
      <div className="prepare-head">
        <strong>{прошла ? п.чисто : п.заголовок}</strong>
        {/* Кнопки публикации здесь нет намеренно: «Доработать» — необязательный взгляд на статью,
            а не разрешение публиковать. Публикация живёт своей кнопкой и своим маршрутом. */}
        <button className="ghost" onClick={props.onЗакрыть}>{п.закрыть}</button>
      </div>

      {находки.length > 0 && (
        <ul className="prepare-list">
          {находки.map((находка, номер) => (
            <li key={`${находка.код}|${находка.путь ?? ''}|${номер}`} className={класс(находка)}>
              <span className="prepare-level">{п.уровни[находка.уровень] ?? находка.уровень}</span>
              <span className="prepare-text">{фраза(находка, п)}</span>
              {место(находка) && <span className="prepare-where">{место(находка)}</span>}
            </li>
          ))}
        </ul>
      )}

      <p className="prepare-skipped">
        {п.невыполненные} {невыполненные.map((этап) => п.этапы[этап] ?? этап).join(', ')}
      </p>
    </section>
  );
}

/** Блокеры видны глазом отдельно от предупреждений: у них разная судьба выпуска. */
function класс(находка: PrepareFinding): string {
  return находка.уровень === 'блокер' ? 'prepare-item prepare-block' : 'prepare-item';
}

/** Фраза человеку по коду находки; неизвестный код называется прямо, а не проглатывается. */
function фраза(находка: PrepareFinding, п: Settings['подготовка']): string {
  const своя = п.находки[находка.код];
  if (typeof своя === 'string') return своя;

  return `${п.неизвестнаяНаходка} ${находка.код}`;
}

/** Где искать: файл языковой версии и поле. У находок про статью целиком места нет — и не выдумываем. */
function место(находка: PrepareFinding): string {
  return [находка.путь, находка.поле].filter((часть) => typeof часть === 'string' && часть !== '').join(' · ');
}
