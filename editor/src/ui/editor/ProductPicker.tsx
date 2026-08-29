// Выбор товара для карточки. Человек видит список товаров магазина и вводит руками только то,
// чего в магазине нет: название на языке статьи и, по желанию, короткое описание. Всё остальное —
// адрес, код товара, надзаголовок, подпись картинки, артикул и подписи кнопок — заполняет
// программа, а цену по коду товара подставляет сборка сайта.
import {useEffect, useState} from 'react';
import type {EditorView} from '@codemirror/view';
import {articlePlace} from '../../core/frontmatterRules.mjs';
import {каталогТоваров, вставитьТовар, значениеГодно, карточкаУжеЕсть, названиеТовара, type Товар} from './products';
import type {Settings} from '../types';

export function ProductPicker(props: {
  settings: Settings;
  article: string;
  view: EditorView;
  onClose: () => void;
}) {
  const слова = props.settings.товары.слова;
  const локаль: string | null = articlePlace(props.article, props.settings.контент).locale;

  const [товары, setТовары] = useState<Товар[] | null>(null);
  const [выбран, setВыбран] = useState<Товар | null>(null);
  const [название, setНазвание] = useState('');
  const [описание, setОписание] = useState('');
  const [идёт, setИдёт] = useState(false);
  // Карточка в статье уже есть: имя переменной картинки одно на статью, и вторая карточка
  // оборвала бы связь первой со своим файлом. Спрашивается один раз, при открытии окна.
  const [ошибка, setОшибка] = useState(карточкаУжеЕсть(props.view.state.doc.toString()) ? слова.ужеЕсть : '');
  const занято = ошибка === слова.ужеЕсть;

  useEffect(() => {
    if (занято) return;
    let живо = true;
    каталогТоваров()
      .then((список) => живо && setТовары(список))
      .catch((беда: Error) => живо && setОшибка(беда.message));
    return () => {
      живо = false;
    };
  }, []);

  return (
    <div className="product-pick-back" onMouseDown={props.onClose}>
      <div className="block-panel product-pick" onMouseDown={(событие) => событие.stopPropagation()}>
        <div className="block-panel-head">
          <div className="block-panel-name">{слова.заголовок}</div>
          <button className="block-panel-close" onClick={props.onClose}>✕</button>
        </div>

        {ошибка !== '' && <div className="block-panel-bad">{ошибка}</div>}
        {!занято && ошибка === '' && товары === null && <div className="block-panel-empty">{слова.загрузка}</div>}
        {товары !== null && товары.length === 0 && <div className="block-panel-empty">{слова.пусто}</div>}

        {выбран === null ? (
          <div>
            {(товары ?? []).map((товар) => (
              <button key={товар.id} className="product-pick-row" onClick={() => взять(товар)}>
                <span className="product-pick-name">{подпись(товар)}</span>
                <span className="md-block-name">{товар.категория[локаль ?? ''] ?? ''}</span>
              </button>
            ))}
          </div>
        ) : (
          <div>
            <div className="product-pick-name">{подпись(выбран)}</div>

            <label className="block-panel-field">
              {слова.названиеПоле}
              <input value={название} autoFocus onChange={(событие) => setНазвание(событие.target.value)} />
            </label>

            <label className="block-panel-field">
              {слова.описаниеПоле}
              <input
                value={описание}
                maxLength={props.settings.товары.пределОписания}
                onChange={(событие) => setОписание(событие.target.value)}
              />
            </label>

            <div className="product-pick-buttons">
              <button onClick={() => setВыбран(null)} disabled={идёт}>{слова.назад}</button>
              <button className="product-pick-go" onClick={() => void вставить()} disabled={идёт || название.trim() === ''}>
                {идёт ? слова.вставляем : слова.вставить}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /** Чем товар подписан в списке: название языка статьи, а нет его — любое, какое есть в магазине. */
  function подпись(товар: Товар): string {
    const своё = названиеТовара(товар, локаль);
    return своё !== '' ? своё : `${Object.values(товар.названия).find((имя) => имя !== '') ?? товар.id} · ${слова.нетНазвания}`;
  }

  function взять(товар: Товар): void {
    setВыбран(товар);
    setНазвание(названиеТовара(товар, локаль));
    setОписание('');
    setОшибка('');
  }

  async function вставить(): Promise<void> {
    if (выбран === null) return;
    if (!значениеГодно(название) || !значениеГодно(описание)) return setОшибка(слова.опасныйЗнак);

    setИдёт(true);
    setОшибка('');
    try {
      const вышло = await вставитьТовар({
        article: props.article,
        view: props.view,
        товар: выбран,
        название,
        описание,
        локаль,
        кнопки: props.settings.товары.кнопки[локаль ?? ''] ?? {},
        актуально: () => props.view.dom.isConnected,
      });
      if (вышло) props.onClose();
      else setОшибка(слова.окноСменилось);
    } catch (беда) {
      setОшибка((беда as Error).message);
    } finally {
      setИдёт(false);
    }
  }
}
