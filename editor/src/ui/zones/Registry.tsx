import {useMemo, useState} from 'react';
import {filterArticles, lastEditOf, sortArticles} from '../../core/registry.mjs';
import {признакиЛокали, подсказкаЛокали} from '../../core/localeSigns.mjs';
import {LocaleMark} from './LocaleMark';
import {NewArticle} from './NewArticle';
import {SectionTree} from './SectionTree';
import {TrashPanel} from './TrashPanel';
import type {ArticleRow, Settings} from '../types';

/** Реестр статей — стартовый экран: дерево разделов слева, таблица справа. */
export function Registry(props: {
  settings: Settings;
  articles: ArticleRow[];
  onOpen: (path: string) => void;
  /** Перечитать реестр: из корзины вернулась статья, и список обязан её показать. */
  onОбновить: () => Promise<void>;
  /** Создание статьи: своё состояние живёт в хуке окна, реестр только показывает форму. */
  создание: {
    раздел: string | null | undefined;
    идёт: boolean;
    начать: (раздел: string | null) => void;
    закрыть: () => void;
    создать: (раздел: string, название: string, адрес: string, язык: string) => Promise<void>;
  };
}) {
  const р = props.settings.реестр;
  const п = props.settings.подписи;

  const [раздел, setРаздел] = useState<string | null>(null);
  const [готовность, setГотовность] = useState('');
  const [переводы, setПереводы] = useState('');
  const [запрос, setЗапрос] = useState('');
  const [колонка, setКолонка] = useState(р.сортировкаПоУмолчанию);
  const [сторона, setСторона] = useState<'вверх' | 'вниз'>('вверх');
  const [корзина, setКорзина] = useState(false);

  const строки = useMemo(
    () => sortArticles(
      filterArticles(props.articles, {раздел, готовность, переводы, запрос}, props.settings),
      колонка,
      сторона,
      props.settings,
    ) as ArticleRow[],
    [props.articles, раздел, готовность, переводы, запрос, колонка, сторона, props.settings],
  );

  return (
    <div className="registry">
      {props.создание.раздел !== undefined && (
        <NewArticle
          settings={props.settings}
          articles={props.articles}
          раздел={props.создание.раздел}
          занято={props.создание.идёт}
          onЗакрыть={props.создание.закрыть}
          onСоздать={(раздел, название, адрес, язык) => void props.создание.создать(раздел, название, адрес, язык)}
        />
      )}

      {корзина && (
        <TrashPanel settings={props.settings} onЗакрыть={() => setКорзина(false)} onВозвращено={() => void props.onОбновить()} />
      )}

      <SectionTree settings={props.settings} articles={props.articles} chosen={раздел} onChoose={setРаздел} />

      <div className="registry-main">
        <div className="registry-filters">
          <button className="ghost" onClick={() => props.создание.начать(раздел)}>{п.новаяСтатья}</button>
          <button className="ghost" onClick={() => setКорзина(true)}>{п.корзина}</button>

          <input
            className="registry-search"
            value={запрос}
            placeholder={п.поиск}
            onChange={(event) => setЗапрос(event.target.value)}
          />

          <select value={готовность} onChange={(event) => setГотовность(event.target.value)}>
            <option value="">{р.любая}</option>
            {props.settings.статусы.map((статус) => (
              <option key={статус} value={статус}>{статус}</option>
            ))}
          </select>

          <select value={переводы} onChange={(event) => setПереводы(event.target.value)}>
            <option value="">{р.любая}</option>
            <option value="толькоДыры">{р.толькоДыры}</option>
            <option value="нетНаСайте">{р.нетНаСайте}</option>
          </select>

          <span className="registry-count">{строки.length}</span>
        </div>

        <table className="registry-table">
          <thead>
            <tr>
              {р.колонки.map((столбец) => (
                <th
                  key={столбец.ключ}
                  className={колонка === столбец.ключ ? 'th-on' : ''}
                  onClick={() => {
                    setСторона(колонка === столбец.ключ && сторона === 'вверх' ? 'вниз' : 'вверх');
                    setКолонка(столбец.ключ);
                  }}
                >
                  {столбец.подпись}
                  {колонка === столбец.ключ && <span>{сторона === 'вверх' ? ' ↑' : ' ↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {строки.map((article) => (
              <tr key={article.key}>
                {р.колонки.map((столбец) => (
                  <td key={столбец.ключ} className={`td-${столбец.ключ}`}>
                    {клетка(article, столбец.ключ, props)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {строки.length === 0 && <p className="empty">{п.ничегоНеНашлось}</p>}
      </div>
    </div>
  );
}

function клетка(
  article: ArticleRow,
  ключ: string,
  props: {
    settings: Settings;
    onOpen: (path: string) => void;
  },
) {
  const {settings} = props;

  if (ключ === 'название') {
    const основная = article.versions[settings.основнойЯзык] ?? Object.values(article.versions)[0];

    return (
      <button
        className={article.titleFromOtherLocale ? 'cell-title cell-foreign' : 'cell-title'}
        onClick={() => основная && props.onOpen(основная.path)}
      >
        {article.title}
      </button>
    );
  }

  if (ключ === 'категория') return article.category;

  // Состояние статьи живёт здесь и только здесь: сводных столбцов «Готовность» и «Видимость»
  // больше нет — одно слово не описывает три независимые версии (`BUSINESS.md`, 2026-09-07).
  // Показывается состояние КАЖДОЙ локали возле её же обозначения, тем же компонентом, что и в
  // шапке открытой статьи, и по тем же признакам из общего свода.
  if (ключ === 'переводы') {
    return (
      <span className="cell-langs">
        {Object.keys(settings.локали).map((code) => {
          const version = article.versions[code];
          const признаки = признакиЛокали(version ?? null);
          // Нет обязательного языка — статьи нет на сайте вовсе. Это беда статьи, а не состояние
          // версии, поэтому она называется своими словами и остаётся заметнее прочего.
          const срыв = !version && code === settings.обязательныйЯзык && article.наСайте;

          return (
            <LocaleMark
              key={code}
              code={code}
              признаки={признаки}
              срыв={срыв}
              disabled={!version}
              подсказка={срыв ? settings.реестр.нетНаСайте : подсказкаЛокали(code, признаки, settings)}
              onClick={() => version && props.onOpen(version.path)}
            />
          );
        })}
      </span>
    );
  }

  if (ключ === 'автор') return lastEditOf(article).правил ?? settings.реестр.неизвестныйАвтор;

  if (ключ === 'когда') {
    const {когда} = lastEditOf(article);
    return когда > 0 ? new Date(когда * 1000).toLocaleDateString(settings.основнойЯзык) : '';
  }

  return null;
}
