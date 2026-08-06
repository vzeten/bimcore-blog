import {useState} from 'react';
import type {Сеанс, Settings, Версия} from '../types';

/**
 * Лента версий горизонтальной полосой: время читается слева направо,
 * и она не отъедает ширину у текста, в отличие от колонки.
 * Подряд идущие сохранения одного автора свёрнуты в одну отметку и разворачиваются по нажатию.
 */
export function VersionStrip(props: {
  settings: Settings;
  visible: boolean;
  сеансы: Сеанс[];
  выбрано: string | null;
  /**
   * Идёт запись возврата к версии. Лента на это время заперта: уйдя сейчас на другую версию,
   * человек оставил бы на диске черновик от возврата, которого в окне уже нет.
   */
  занято?: boolean;
  onВыбрать: (версия: Версия) => void;
  onСейчас: () => void;
}) {
  const [развёрнут, setРазвёрнут] = useState<string | null>(null);
  const п = props.settings.подписи;

  if (!props.visible) return null;

  return (
    <div className="strip">
      <span className="strip-label">{п.версии}</span>

      {props.сеансы.length === 0 && <span className="strip-empty">{п.нетВерсий}</span>}

      {props.сеансы.map((сеанс) => {
        const ключ = `${сеанс.author}|${сеанс.from}`;
        const открыт = развёрнут === ключ;
        const свой = сеанс.snapshots.some((версия) => версия.имя === props.выбрано);

        return (
          <span key={ключ} className={открыт ? 'session session-open' : 'session'}>
            <button
              className={свой ? 'session-head session-on' : 'session-head'}
              title={подпись(сеанс, props.settings)}
              onClick={() => setРазвёрнут(открыт ? null : ключ)}
            >
              <span className="session-author">{сеанс.author}</span>
              <span className="session-time">{время(сеанс.to, props.settings)}</span>
              {сеанс.snapshots.length > 1 && (
                <span className="session-count">{сеанс.snapshots.length}</span>
              )}
            </button>

            {открыт && (
              <span className="session-list">
                {[...сеанс.snapshots].reverse().map((версия) => (
                  <button
                    key={версия.имя}
                    className={версия.имя === props.выбрано ? 'version version-on' : 'version'}
                    disabled={props.занято === true}
                    onClick={() => props.onВыбрать(версия)}
                  >
                    {время(версия.iso, props.settings)}
                  </button>
                ))}
              </span>
            )}
          </span>
        );
      })}

      {/* «Сейчас» — не снимок, а текущее состояние окна: отсюда человек возвращается к работе. */}
      <button
        className={props.выбрано === null ? 'session-head session-on' : 'session-head'}
        title={п.вернутьсяКТекущей}
        disabled={props.занято === true}
        onClick={props.onСейчас}
      >
        {п.сейчас}
      </button>
    </div>
  );
}

/** Время версии: язык и вид берутся из настроек, своего формата программа не выдумывает. */
export function время(iso: string, settings: Settings): string {
  const дата = new Date(iso);
  return Number.isFinite(дата.getTime())
    ? дата.toLocaleString(settings.основнойЯзык, settings.форматВремени)
    : iso;
}

function подпись(сеанс: Сеанс, settings: Settings): string {
  const число = settings.подписи.версийВОтметке.replace('{число}', String(сеанс.snapshots.length));
  return `${сеанс.author} · ${время(сеанс.from, settings)} — ${время(сеанс.to, settings)} · ${число}`;
}
