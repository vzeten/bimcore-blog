import {useMemo, useState} from 'react';
import {filterArticles, lastEditOf, sortArticles} from '../../core/registry.mjs';
import {порядокРежима} from '../../core/siteOrder.mjs';
import {признакиЛокали, подсказкаЛокали} from '../../core/localeSigns.mjs';
import {LocaleMark} from './LocaleMark';
import {NewArticle} from './NewArticle';
import {SectionTree} from './SectionTree';
import {TrashPanel} from './TrashPanel';
import {ViewsPanel} from './ViewsPanel';
import {useViews, type Просмотры} from '../useViews';
import type {ArticleRow, Settings} from '../types';

/** Реестр статей — стартовый экран: дерево разделов слева, таблица справа. */
export function Registry(props: {
  settings: Settings;
  articles: ArticleRow[];
  onOpen: (path: string) => void;
  /** Перечитать реестр: из корзины вернулась статья, и список обязан её показать. */
  onОбновить: () => Promise<void>;
  /** Сообщение об удаче в полосе над окном (статья вернулась из корзины). */
  onУдача?: (текст: string) => void;
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
  const [отбор, setОтбор] = useState<'' | 'опубликовать' | 'недоделано'>('');
  const [запрос, setЗапрос] = useState('');
  // Порядок задаёт режим — «как на сайте» при каждом открытии (решение владельца 2026-09-21).
  // Щелчок по заголовку колонки поверх режима даёт ручную сортировку; она держится и при смене
  // раздела, потому что сказана явно, а кнопка режима возвращает к его порядку.
  const [режим, setРежим] = useState<'сайт' | 'правки'>('сайт');
  const [выбранныйПорядок, setВыбранныйПорядок] = useState<{колонка: string; сторона: 'вверх' | 'вниз'} | null>(null);
  const [корзина, setКорзина] = useState(false);
  // Просмотры спрашиваются своим запросом: таблица показывается сразу, числа встают, когда придут.
  const просмотры = useViews();
  const [аналитика, setАналитика] = useState<ArticleRow | null>(null);

  const поРежиму = порядокРежима(режим);
  const колонка = выбранныйПорядок?.колонка ?? поРежиму.колонка;
  const сторона = выбранныйПорядок?.сторона ?? поРежиму.сторона;
  const выбратьРежим = (новый: 'сайт' | 'правки') => {
    setРежим(новый);
    setВыбранныйПорядок(null);
  };

  const строки = useMemo(
    () => sortArticles(
      filterArticles(props.articles, {раздел, отбор, запрос}, props.settings),
      колонка,
      сторона,
      props.settings,
    ) as ArticleRow[],
    [props.articles, раздел, отбор, запрос, колонка, сторона, props.settings],
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
        <TrashPanel settings={props.settings} onЗакрыть={() => setКорзина(false)} onВозвращено={(текст) => {
          props.onУдача?.(текст);
          void props.onОбновить();
        }} />
      )}

      {аналитика && просмотры?.поДень && просмотры.статьи[аналитика.key] && (
        <ViewsPanel
          settings={props.settings}
          название={аналитика.title}
          числа={просмотры.статьи[аналитика.key]}
          поДень={просмотры.поДень}
          onЗакрыть={() => setАналитика(null)}
        />
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

          <select value={отбор} onChange={(event) => setОтбор(event.target.value as typeof отбор)}>
            <option value="">{р.отборВсе}</option>
            <option value="опубликовать">{р.отборОпубликовать}</option>
            <option value="недоделано">{р.отборНедоделано}</option>
          </select>

          <span className="registry-order">
            {([['сайт', р.порядокКакНаСайте], ['правки', р.порядокПоследниеПравки]] as const).map(([код, подпись]) => (
              <button
                key={код}
                className={режим === код && !выбранныйПорядок ? 'order-on' : ''}
                aria-pressed={режим === код && !выбранныйПорядок}
                onClick={() => выбратьРежим(код)}
              >
                {подпись}
              </button>
            ))}
          </span>

          <span className="registry-count">{строки.length}</span>
        </div>

        {просмотры?.надпись && <p className="views-note">{просмотры.надпись}</p>}

        <table className="registry-table">
          <thead>
            <tr>
              {р.колонки.map((столбец) => (
                <th
                  key={столбец.ключ}
                  className={колонка === столбец.ключ ? 'th-on' : ''}
                  onClick={() => !столбец.безПорядка && setВыбранныйПорядок({
                    колонка: столбец.ключ,
                    сторона: колонка === столбец.ключ && сторона === 'вверх' ? 'вниз' : 'вверх',
                  })}
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
                    {клетка(article, столбец.ключ, {...props, просмотры, onАналитика: setАналитика})}
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
    просмотры: Просмотры | null;
    onАналитика: (article: ArticleRow) => void;
  },
) {
  const {settings} = props;

  // Прочерк — чисел нет: статья не выходила на сайт, Google ещё не ответил или ответить не смог.
  if (ключ === 'просмотры') {
    const числа = props.просмотры?.статьи[article.key];
    if (!числа) return <span className="views-none">—</span>;
    return (
      <button className="cell-views" title={settings.просмотры.подсказка} onClick={() => props.onАналитика(article)}>
        {числа.за30.toLocaleString(settings.основнойЯзык)}
      </button>
    );
  }

  if (ключ === 'название') {
    const основная = article.versions[settings.основнойЯзык] ?? Object.values(article.versions)[0];

    return (
      <button
        // Название пишется обычным цветом, даже когда взято из другой языковой версии: решение
        // владельца 2026-09-18, замены прежней красной пометке нет.
        className="cell-title"
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
