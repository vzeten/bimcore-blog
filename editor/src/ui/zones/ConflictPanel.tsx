// Панель расхождения: файл статьи изменили снаружи, пока человек работал.
//
// Непересекающиеся правки сервер объединил сам, сюда попадает только то, где решает человек.
// Отдельная панель, а не правка прямо в тексте: выбирать между двумя версиями одного места посреди
// набора текста значит решать вслепую — рядом должно стоять и «что было», и обе стороны.

import type {Settings, Спор, СпорноеМесто} from '../types';

/** Ответ по одному месту: ключ — место и его номер, значение — сторона, которую оставляем. */
export type ОтветыСпора = Record<string, 'мои' | 'внешние'>;

/** Ключ ответа. Номер считается внутри своего места, поэтому одного номера мало. */
export const ключМеста = (место: СпорноеМесто): string => `${место.место}|${место.номер}`;

/** Текст стороны или слово «пусто»: пустая сторона означает, что там ничего не осталось. */
function Сторона(props: {settings: Settings; подпись: string; текст: string; тусклая?: boolean}) {
  const с = props.settings.сведение;

  return (
    <div className={props.тусклая ? 'conflict-side conflict-side-quiet' : 'conflict-side'}>
      <div className="conflict-side-name">{props.подпись}</div>
      <pre>{props.текст === '' ? с.пусто : props.текст}</pre>
    </div>
  );
}

/** Одно спорное место: что было, обе стороны и выбор между ними. */
function Место(props: {
  settings: Settings;
  место: СпорноеМесто;
  выбрано: 'мои' | 'внешние' | undefined;
  onОтвет: (сторона: 'мои' | 'внешние') => void;
  заперто: boolean;
}) {
  const с = props.settings.сведение;
  const имяМеста = с.места[props.место.место] ?? props.место.место;

  return (
    <div className="conflict-spot">
      <div className="conflict-spot-name">{имяМеста}</div>

      {/* «Было» стоит первым и приглушено: это опора для выбора, а не одна из сторон. */}
      <Сторона settings={props.settings} подпись={с.было} текст={props.место.база} тусклая />

      <div className="conflict-choice">
        <button
          className={props.выбрано === 'мои' ? 'ghost chosen' : 'ghost'}
          disabled={props.заперто}
          onClick={() => props.onОтвет('мои')}
        >
          {с['оставитьМоё']}
        </button>
        <Сторона settings={props.settings} подпись={с['моё']} текст={props.место.мои} />
      </div>

      <div className="conflict-choice">
        <button
          className={props.выбрано === 'внешние' ? 'ghost chosen' : 'ghost'}
          disabled={props.заперто}
          onClick={() => props.onОтвет('внешние')}
        >
          {с.оставитьВнешнее}
        </button>
        <Сторона settings={props.settings} подпись={с.внешнее} текст={props.место.внешние} />
      </div>
    </div>
  );
}

/**
 * Вся панель. Показывается, пока у версии есть неразрешённое расхождение, и возвращается сама
 * при каждом новом заходе в статью: молча продолжать работу поверх нерешённого нельзя.
 *
 * У вида `нетФайла` выбора нет вовсе: версии на диске больше не существует, и предлагать кнопку
 * «применить» значило бы обещать возврат, которого программа не делает.
 */
export function ConflictPanel(props: {
  settings: Settings;
  спор: Спор;
  ответы: ОтветыСпора;
  идёт: boolean;
  onОтвет: (ключ: string, сторона: 'мои' | 'внешние') => void;
  onПрименить: () => void;
}) {
  const с = props.settings.сведение;
  const решаемый = props.спор.вид !== 'нетФайла' && props.спор.спорные.length > 0;
  const всёВыбрано = props.спор.спорные.every((место) => props.ответы[ключМеста(место)] !== undefined);

  return (
    <div className="conflict" role="alert">
      <div className="conflict-head">
        <strong>{с.заголовок}</strong>
        <span>{с[props.спор.вид]}</span>
      </div>

      {props.спор.спорные.map((место) => (
        <Место
          key={ключМеста(место)}
          settings={props.settings}
          место={место}
          выбрано={props.ответы[ключМеста(место)]}
          заперто={props.идёт}
          onОтвет={(сторона) => props.onОтвет(ключМеста(место), сторона)}
        />
      ))}

      {решаемый && (
        <div className="conflict-foot">
          <button className="primary" disabled={props.идёт || !всёВыбрано} onClick={props.onПрименить}>
            {с.применить}
          </button>
          {!всёВыбрано && <span>{с.неВсёВыбрано}</span>}
        </div>
      )}
    </div>
  );
}
