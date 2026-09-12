import {useEffect, useState} from 'react';
import {trashList, trashRestore, type TrashEntry} from '../trashActions';
import {label} from '../labels';
import type {Settings} from '../types';

/**
 * Корзина удалённых статей поверх реестра: что лежит, до какого дня вернуть, кнопка возврата.
 * Перечень спрашивается у сервера при открытии и после каждого возврата: срок и уборку
 * просроченного считает он, окно ничего не хранит.
 */
export function TrashPanel(props: {settings: Settings; onЗакрыть: () => void; onВозвращено: () => void}) {
  const п = props.settings.подписи;
  const [записи, setЗаписи] = useState<TrashEntry[] | null>(null);
  const [занята, setЗанята] = useState<string | null>(null);
  const [сообщение, setСообщение] = useState('');

  const перечитать = (): void => {
    trashList()
      .then((ответ) => setЗаписи(ответ.записи))
      .catch((error: unknown) => setСообщение(error instanceof Error ? error.message : label('ошибкаЗапроса')));
  };
  useEffect(перечитать, []);

  const вернуть = async (запись: TrashEntry): Promise<void> => {
    if (занята !== null) return;
    setЗанята(запись.id);
    await trashRestore(запись.id, {
      ok: (итог) => {
        setСообщение(label('статьяВозвращена', {пути: итог.возвращено.join(', ')}));
        перечитать();
        props.onВозвращено();
      },
      // Конфликт на месте статьи — обычный отказ: возврат не перезаписывает чужое, а называет, что мешает.
      fail: (текст, конфликты) => setСообщение(`${label('ошибкаВозврата')}: ${текст}${конфликты.length > 0 ? ` ${конфликты.join(', ')}` : ''}`),
    });
    setЗанята(null);
  };

  const когда = (iso: string): string => {
    const мс = Date.parse(iso);
    return Number.isFinite(мс) ? new Date(мс).toLocaleDateString() : iso;
  };

  return (
    <section className="trash-panel" role="dialog" aria-label={п.корзина}>
      <div className="trash-head">
        <h2>{п.корзина}</h2>
        <button className="ghost" onClick={props.onЗакрыть}>{п.закрытьКорзину}</button>
      </div>
      {сообщение !== '' && <p className="trash-note">{сообщение}</p>}
      {записи !== null && записи.length === 0 && <p className="trash-note">{п.корзинаПуста}</p>}
      {(записи ?? []).map((запись) => (
        <div className="trash-row" key={запись.id}>
          <span className="trash-name">
            {запись.название || (запись.пути ?? []).join(', ')}
            {запись.языки && запись.языки.length > 0 && <span className="trash-meta"> · {запись.языки.join(', ')}</span>}
          </span>
          <span className="trash-meta">
            {запись.состояние === 'готово' ? label('срокДо', {срок: когда(запись.срокДо)}) : п.записьНезавершена}
          </span>
          <button className="ghost" disabled={занята !== null} onClick={() => void вернуть(запись)}>
            {занята === запись.id ? п.вернутьИдёт : п.вернуть}
          </button>
        </div>
      ))}
    </section>
  );
}
