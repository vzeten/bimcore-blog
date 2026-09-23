import {useMemo, useState} from 'react';
import {сЗнаком, type Страница} from '../useAnalytics';
import type {Settings} from '../types';

type Колонка = 'путь' | 'показы' | 'разницаПоказов' | 'переходы' | 'разницаПереходов' | 'ctr' | 'позиция';

/**
 * Страницы охвата за 30 полных дней: показы, переходы, их разница с предыдущими 30 в штуках (зелёная —
 * больше, красная — меньше), CTR и средняя позиция. Щелчок по заголовку сортирует, по странице — открывает
 * её график. Сначала — самые показываемые.
 */
export function PagesTable(props: {
  settings: Settings;
  страницы: Страница[];
  названия: Map<string, string>;
  onСтраница: (путь: string) => void;
}) {
  const п = props.settings.аналитикаОкно;
  const язык = props.settings.основнойЯзык;
  const [порядок, setПорядок] = useState<{колонка: Колонка; вниз: boolean}>({колонка: 'показы', вниз: true});

  const строки = useMemo(() => [...props.страницы].sort((a, b) => {
    const [x, y] = [a[порядок.колонка], b[порядок.колонка]];
    // Позиция — чем меньше, тем лучше; пустые значения — всегда внизу.
    if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1;
    const знак = порядок.вниз ? -1 : 1;
    return typeof x === 'string' ? x.localeCompare(String(y), язык) * знак : ((x as number) - (y as number)) * знак;
  }), [props.страницы, порядок, язык]);

  const заголовок = (колонка: Колонка, подпись: string) => (
    <th
      className={порядок.колонка === колонка ? 'th-on' : ''}
      onClick={() => setПорядок((было) => ({колонка, вниз: было.колонка === колонка ? !было.вниз : колонка !== 'путь' && колонка !== 'позиция'}))}
    >
      {подпись}{порядок.колонка === колонка && (порядок.вниз ? ' ↓' : ' ↑')}
    </th>
  );
  const разница = (число: number) => (
    <span className={число > 0 ? 'views-up' : число < 0 ? 'views-down' : 'views-same'} title={п.разницаПодсказка}>{сЗнаком(число, язык)}</span>
  );

  return (
    <table className="registry-table pages-table">
      <thead>
        <tr>
          {заголовок('путь', п.колонкаСтраница)}
          {заголовок('показы', п.колонкаПоказы)}
          {заголовок('разницаПоказов', '±')}
          {заголовок('переходы', п.колонкаПереходы)}
          {заголовок('разницаПереходов', '±')}
          {заголовок('ctr', п.колонкаCTR)}
          {заголовок('позиция', п.колонкаПозиция)}
        </tr>
      </thead>
      <tbody>
        {строки.map((стр) => (
          <tr key={стр.путь}>
            <td>
              <button className="cell-title" onClick={() => props.onСтраница(стр.путь)}>
                {props.названия.get(стр.путь) ?? стр.путь}
              </button>
              {props.названия.has(стр.путь) && <div className="pages-path">{стр.путь}</div>}
            </td>
            <td className="num">{стр.показы.toLocaleString(язык)}</td>
            <td className="num">{разница(стр.разницаПоказов)}</td>
            <td className="num">{стр.переходы.toLocaleString(язык)}</td>
            <td className="num">{разница(стр.разницаПереходов)}</td>
            <td className="num">{стр.ctr === null ? '—' : `${стр.ctr.toLocaleString(язык)}%`}</td>
            <td className="num">{стр.позиция === null ? '—' : стр.позиция.toLocaleString(язык)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
