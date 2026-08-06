import {ConflictBars, ErrorBar} from './ConflictBar';
import {RestoreBars} from './RestoreBar';
import type {Article, Settings} from '../types';

/**
 * Все полосы над статьёй в одном месте и в постоянном порядке: ошибка, выбор при расхождении
 * с файлом, возврат к версии. Собрано вместе, чтобы окно не решало, какая из них видна,
 * и не выходило за предел размера файла (SPEC 4.9).
 */
export function Bars(props: {
  settings: Settings;
  article: Article | null;
  ошибка: string | null;
  onЗакрытьОшибку: () => void;
  конфликтСохранения: boolean;
  /**
   * Идёт просмотр версии. Панель конфликта прячется целиком: обе её кнопки пишут на диск или
   * подменяют рабочий текст, а просмотр не меняет ничего. Выбор ждёт возврата к работе.
   */
  просмотрИдёт: boolean;
  /** Открыт реестр: полосы работы со статьёй к нему не относятся. */
  реестр: boolean;
  спрашиваемВозврат: boolean;
  откатДоступен: boolean;
  onВзятьЧерновик: () => void;
  onВзятьФайл: () => void;
  onСохранитьПоверх: () => void;
  onПеречитать: () => void;
  onПодтвердитьВозврат: () => void;
  onОтменитьВозврат: () => void;
  onОткатить: () => void;
}) {
  return (
    <>
      <ErrorBar settings={props.settings} текст={props.ошибка} onЗакрыть={props.onЗакрытьОшибку} />

      {!props.просмотрИдёт && (
        <ConflictBars
          settings={props.settings}
          article={props.article}
          конфликтСохранения={props.конфликтСохранения}
          onВзятьЧерновик={props.onВзятьЧерновик}
          onВзятьФайл={props.onВзятьФайл}
          onСохранитьПоверх={props.onСохранитьПоверх}
          onПеречитать={props.onПеречитать}
        />
      )}

      {!props.реестр && (
        <RestoreBars
          settings={props.settings}
          спрашиваем={props.спрашиваемВозврат}
          откатДоступен={props.откатДоступен}
          onПодтвердить={props.onПодтвердитьВозврат}
          onОтменить={props.onОтменитьВозврат}
          onОткатить={props.onОткатить}
        />
      )}
    </>
  );
}
