import {usePublish, идётПубликация} from '../usePublish';
import {непроверенное} from '../publishSteps';
import {перейтиКСтроке} from '../editor/jumpTo';
import {PublishAsk} from './PublishAsk';
import {PublishReason} from './PublishReason';
import type {Article, Settings} from '../types';

/**
 * Главное действие человека: «Опубликовать» (решение владельца 2026-09-18, п.2–5, макет одобрен).
 *
 * Нажатие открывает единственный вопрос (`PublishAsk`); после ответа программа идёт сама, а кнопка
 * говорит «Публикуется…». Отказ быстрой проверки или отправки — «Не опубликовано»; по нажатию видна
 * причина (`PublishReason`). Заперта кнопка только там, где писать нельзя, — в просмотре старой
 * версии, — и пока идёт сам ход.
 *
 * Панель причины стоит в одной опоре с кнопкой и выпадает прямо под ней: полоса во всю ширину окна
 * не показывала бы, откуда она взялась.
 */
export function PublishButton(props: {
  settings: Settings;
  article: Article | null;
  dirty: boolean;
  просмотр: boolean;
  onSave: () => Promise<boolean>;
  onДата: (дата: string) => Promise<boolean>;
  onОбложка: (адрес: string) => Promise<boolean>;
  onДоступность: (режим: string) => Promise<boolean>;
  onOpen: (path: string) => void | Promise<boolean | void>;
  onСообщить: (текст: string) => void;
}) {
  const п = props.settings.публикация;
  const публикация = usePublish(
    props.article?.path ?? null,
    props.dirty,
    props.article?.заход ?? 0,
    {сохранить: props.onSave, дата: props.onДата, обложка: props.onОбложка, доступность: props.onДоступность},
    // Опубликовано, но ссылки на компьютере убрать не вышло или что-то не проверено: одна строка в
    // полосе сообщений. Сайт это соберёт GitHub, но молчать о непроверенном нельзя.
    (исход) => {
      const что = непроверенное(исход.предупреждения ?? [], п.чтоНепроверено);
      const строки = [
        ...(исход.ссылкиНеУбраны.length > 0 ? [`${п.ссылкиНеУбраны} ${исход.ссылкиНеУбраны.join(', ')}`] : []),
        ...(что.length > 0 ? [п.непроверено.replace('{что}', что.join(', '))] : []),
      ];
      if (строки.length > 0) props.onСообщить(строки.join(' '));
    },
  );
  const идёт = идётПубликация(публикация.шаг);
  const неВышло = публикация.остановка !== null;

  // «Перейти к месту»: переход ждёт редактор нужной статьи — открытой или той, что откроется.
  const перейти = async (место: {путь: string; строка: number}) => {
    перейтиКСтроке(место.путь, место.строка);
    if (место.путь !== props.article?.path) await props.onOpen(место.путь);
  };

  return (
    <div className="publish-anchor">
      <button
        className={неВышло ? 'ghost publish-failed' : 'ghost ghost-main'}
        disabled={идёт || props.просмотр || !props.article}
        title={props.просмотр ? props.settings.подписи.идётПросмотр : (идёт ? (п.шаги[публикация.шаг] ?? '') : '')}
        onClick={неВышло ? публикация.показатьПричину : публикация.открыть}
      >
        {идёт ? п.публикуется : неВышло ? п.неОпубликовано : props.settings.подписи.опубликовать}
      </button>

      {неВышло && публикация.причинаОткрыта && (
        <PublishReason
          settings={props.settings}
          остановка={публикация.остановка!}
          onПерейти={(место) => void перейти(место)}
          onПонятно={публикация.понятно}
        />
      )}

      {публикация.окно !== null && props.article && !props.просмотр && (
        <PublishAsk
          settings={props.settings}
          path={props.article.path}
          окно={публикация.окно}
          onВыбрать={публикация.выбрать}
          onОтметить={публикация.отметить}
          onОпубликовать={() => void публикация.начать()}
          onОтмена={публикация.отмена}
        />
      )}
    </div>
  );
}
