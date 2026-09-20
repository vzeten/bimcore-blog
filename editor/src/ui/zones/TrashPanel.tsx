import {useEffect, useState} from 'react';
import {ключВозврата, trashDrop, trashList, trashRestore, type TrashEntry} from '../trashActions';
import {label} from '../labels';
import type {Settings} from '../types';

/**
 * Корзина удалённых статей поверх реестра: что лежит, когда удалено, кнопка возврата и кнопка
 * «стереть насовсем» с отдельным подтверждением. Сама корзина ничего не удаляет по сроку —
 * запись уходит только этой кнопкой (решение владельца 2026-09-18). Перечень спрашивается у
 * сервера при открытии и после каждого действия: окно ничего не хранит.
 */
export function TrashPanel(props: {settings: Settings; onЗакрыть: () => void; onВозвращено: (текст: string) => void}) {
  const п = props.settings.подписи;
  const [записи, setЗаписи] = useState<TrashEntry[] | null>(null);
  const [занята, setЗанята] = useState<string | null>(null);
  // Какая запись ждёт подтверждения стирания. Одно нажатие ничего не стирает: вернуть будет нечем.
  const [стереть, setСтереть] = useState<string | null>(null);
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
      ok: () => {
        // Слово подбирается по ВИДУ записи: вернулись файлы папки — про статью говорить нечего.
        const слово = label(ключВозврата(запись));
        setСообщение(слово);
        перечитать();
        // Полоса над окном говорит то же: прежнее «Статья в корзине…» больше неправда.
        props.onВозвращено(слово);
      },
      // Конфликт на месте статьи — обычный отказ: возврат не перезаписывает чужое, а называет, что мешает.
      fail: (текст, конфликты) => setСообщение(`${label('ошибкаВозврата')}: ${текст}${конфликты.length > 0 ? ` ${конфликты.join(', ')}` : ''}`),
    });
    setЗанята(null);
  };

  const стиратьНасовсем = async (запись: TrashEntry): Promise<void> => {
    if (занята !== null) return;
    setЗанята(запись.id);
    await trashDrop(запись.id, true, {
      ok: () => {
        setСтереть(null);
        setСообщение(label('записьСтёрта', {название: запись.название || (запись.пути ?? []).join(', ')}));
        перечитать();
      },
      fail: (текст) => setСообщение(текст),
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
            {запись.языки && запись.языки.length > 0 && <span className="trash-meta"> · {языкиЗаписи(запись.языки, props.settings)}</span>}
          </span>
          <span className="trash-meta">
            {запись.состояние === 'готово' ? label('удаленаКогда', {когда: когда(запись.удалено)}) : п.записьНезавершена}
          </span>
          <button className="ghost" disabled={занята !== null} onClick={() => void вернуть(запись)}>
            {занята === запись.id ? п.вернутьИдёт : п.вернуть}
          </button>
          {стереть === запись.id ? (
            <>
              <span className="trash-meta">{п.стеретьВопрос}</span>
              <button className="ghost" disabled={занята !== null} onClick={() => void стиратьНасовсем(запись)}>
                {п.стеретьДа}
              </button>
              <button className="ghost" onClick={() => setСтереть(null)}>{п.неУдалять}</button>
            </>
          ) : (
            <button className="ghost" disabled={занята !== null} onClick={() => setСтереть(запись.id)}>
              {п.стереть}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

/** Языки записи корзины — заглавными кодами в порядке языков настроек, как буквы в реестре: «RU, EN». */
export function языкиЗаписи(языки: string[], settings: Settings): string {
  const порядок = Object.keys(settings.локали);
  const место = (код: string) => (порядок.includes(код) ? порядок.indexOf(код) : порядок.length);
  return [...языки].sort((a, b) => место(a) - место(b)).map((код) => код.toUpperCase()).join(', ');
}
