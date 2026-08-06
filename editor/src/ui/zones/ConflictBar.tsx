import type {Article, Settings} from '../types';

/**
 * Полоса выбора, когда файл на диске разошёлся с тем, что в окне.
 * Два случая, оба решает человек, а не программа:
 * при открытии — что открыть (автосохранение или файл);
 * при сохранении — перечитать файл или записать поверх.
 */
export function ConflictBar(props: {
  settings: Settings;
  вид: 'открытие' | 'сохранение';
  onПервый: () => void;
  onВторой: () => void;
}) {
  const п = props.settings.подписи;
  const приОткрытии = props.вид === 'открытие';

  return (
    <div className="conflictbar" role="alert">
      <span>{приОткрытии ? п.конфликтПояснение : п.конфликтСохранения}</span>
      <button className="ghost" onClick={props.onПервый}>
        {приОткрытии ? п.взятьЧерновик : п.сохранитьПоверх}
      </button>
      <button className="ghost" onClick={props.onВторой}>
        {приОткрытии ? п.взятьФайл : п.перечитатьФайл}
      </button>
    </div>
  );
}

/**
 * Обе полосы конфликта разом: при открытии статьи и при сохранении.
 * Собрано в одном месте, чтобы окно не решало, какую из них показывать.
 */
export function ConflictBars(props: {
  settings: Settings;
  article: Article | null;
  конфликтСохранения: boolean;
  onВзятьЧерновик: () => void;
  onВзятьФайл: () => void;
  onСохранитьПоверх: () => void;
  onПеречитать: () => void;
}) {
  if (!props.article) return null;

  return (
    <>
      {/* Выбор при открытии показывается, только пока нет конфликта сохранения: после него
          «Открыть файл» подставил бы файл, каким он был при открытии, а на диске уже другое —
          и следующее «Сохранить поверх» затёрло бы чужую правку старым содержимым. */}
      {!props.конфликтСохранения && props.article.черновикРешение === 'конфликт' && props.article.черновик && (
        <ConflictBar
          settings={props.settings}
          вид="открытие"
          onПервый={props.onВзятьЧерновик}
          onВторой={props.onВзятьФайл}
        />
      )}

      {props.конфликтСохранения && (
        <ConflictBar
          settings={props.settings}
          вид="сохранение"
          onПервый={props.onСохранитьПоверх}
          onВторой={props.onПеречитать}
        />
      )}
    </>
  );
}

/** Спокойная полоса ошибки: сообщение и способ его убрать. Статью не перекрывает. */
export function ErrorBar(props: {settings: Settings; текст: string | null; onЗакрыть: () => void}) {
  if (!props.текст) return null;

  return (
    <div className="errorbar" role="alert">
      <span>{props.текст}</span>
      <button className="errorbar-close" onClick={props.onЗакрыть}>{props.settings.подписи.закрытьОшибку}</button>
    </div>
  );
}
