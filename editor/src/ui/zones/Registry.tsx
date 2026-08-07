import {useMemo, useState} from 'react';
import {filterArticles, lastEditOf, readinessOf, sortArticles, visibilityOf} from '../../core/registry.mjs';
import {NewArticle} from './NewArticle';
import {SectionTree} from './SectionTree';
import type {ArticleRow, Settings} from '../types';

/** Реестр статей — стартовый экран: дерево разделов слева, таблица справа. */
export function Registry(props: {
  settings: Settings;
  articles: ArticleRow[];
  onOpen: (path: string) => void;
  /** Создание статьи: своё состояние живёт в хуке окна, реестр только показывает форму. */
  создание: {
    раздел: string | null | undefined;
    идёт: boolean;
    начать: (раздел: string | null) => void;
    закрыть: () => void;
    создать: (название: string, адрес: string) => Promise<void>;
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
          раздел={props.создание.раздел}
          занято={props.создание.идёт}
          onЗакрыть={props.создание.закрыть}
          onСоздать={(название, адрес) => void props.создание.создать(название, адрес)}
        />
      )}

      <SectionTree settings={props.settings} articles={props.articles} chosen={раздел} onChoose={setРаздел} />

      <div className="registry-main">
        <div className="registry-filters">
          {/* В блоге создание пока не делается: правила его шапки не описаны. Кнопка не прячется,
              а гаснет с причиной — спрятанный запрет человек принимает за поломку. */}
          <button
            className="ghost"
            disabled={раздел?.startsWith('blog') === true}
            title={раздел?.startsWith('blog') === true ? props.settings.ошибкиСоздания.блогПока : ''}
            onClick={() => props.создание.начать(раздел)}
          >
            {п.новаяСтатья}
          </button>

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

  if (ключ === 'переводы') {
    return (
      <span className="cell-langs">
        {Object.keys(settings.локали).map((code) => {
          const version = article.versions[code];
          const дыра = !version;
          const срыв = дыра && code === settings.обязательныйЯзык && article.наСайте;

          return (
            <button
              key={code}
              className={`lang ${срыв ? 'lang-срыв' : дыра ? 'lang-нет' : 'lang-есть'}`}
              disabled={дыра}
              title={срыв ? settings.реестр.нетНаСайте : settings.локали[code]}
              onClick={() => version && props.onOpen(version.path)}
            >
              {code.toUpperCase()}
            </button>
          );
        })}
      </span>
    );
  }

  if (ключ === 'готовность') {
    const {значение, разное} = readinessOf(article, settings);
    return <span title={разное ? settings.реестр.разное : ''}>{значение}{разное ? ' *' : ''}</span>;
  }

  if (ключ === 'видимость') {
    // Только показ. Переключается видимость внутри открытой статьи, не из общего списка.
    const {скрыта, разное} = visibilityOf(article);

    return (
      <span className={скрыта ? 'cell-hidden' : 'cell-shown'}>
        {скрыта ? settings.видимость.поСсылке : settings.видимость.вМеню}
        {разное ? ' *' : ''}
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
