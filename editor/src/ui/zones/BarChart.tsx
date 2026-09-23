import {useState} from 'react';

/** Столбик: начало шага, значение по каждому языку и пометка «Google ещё досчитывает». */
export interface СтолбикГрафика {
  начало: string;
  языки: Record<string, number>;
  неполный: boolean;
}

/** Метка события «Действий» под столбиком: день и подписи (что изменилось). */
export interface МеткаГрафика {
  день: string;
  подписи: string[];
}

/**
 * Круглая верхняя граница шкалы: 2, 4, 6, 8 или 10 на порядок, не меньше 2 — чтобы подпись середины шкалы была
 * целым числом (у границы 1 середина 0,5 округлялась до «1», проба 2026-09-24).
 */
export function граница(максимум: number): number {
  if (максимум <= 2) return 2;
  const порядок = 10 ** Math.floor(Math.log10(максимум));
  return [2, 4, 6, 8, 10].map((к) => к * порядок).find((в) => в >= максимум) ?? 20 * порядок;
}

/** Числа под каждым столбиком — только когда им хватает места. */
const ПОДПИСИ_ВСЕХ = 16;

/**
 * Столбики одного показателя (просмотры, показы или переходы) — от нуля, без сглаживания; столбик делится
 * на языки, части в сумме дают ровно столбик. Включённый язык окрашен своим цветом, выключенный — серым
 * (как в окне просмотров статьи, решение владельца 2026-09-24). Незаконченный шаг — бледнее и с пометкой.
 * Под столбиками — числа (если помещаются), подписи шагов и метки изменений: щелчок открывает дни вокруг.
 */
export function BarChart(props: {
  название: string;
  столбики: СтолбикГрафика[];
  коды: string[];
  цвета: Record<string, string>;
  цветные: string[];
  метки: МеткаГрафика[];
  подписьШага: (день: string) => string;
  частыеПодписи: boolean;
  число: (значение: number) => string;
  неполныйТекст: string;
  onМетка?: (день: string) => void;
}) {
  const [наведено, setНаведено] = useState<number | null>(null);
  const {столбики} = props;
  const сумма = (с: СтолбикГрафика) => props.коды.reduce((итог, код) => итог + (с.языки[код] ?? 0), 0);
  const верх = граница(Math.max(0, ...столбики.map(сумма)));
  const всеЧисла = столбики.length <= ПОДПИСИ_ВСЕХ;

  // Шаг, в который попадает день: последний столбик, начавшийся не позже него.
  const меткиПоШагу = new Map<number, МеткаГрафика[]>();
  for (const метка of props.метки) {
    let номер = -1;
    столбики.forEach((с, i) => {
      if (с.начало <= метка.день) номер = i;
    });
    if (номер >= 0) меткиПоШагу.set(номер, [...(меткиПоШагу.get(номер) ?? []), метка]);
  }
  const шагПодписи = props.частыеПодписи ? 1 : Math.max(1, Math.ceil(столбики.length / 8));

  return (
    <div className="bars">
      <div className="trend-title">{props.название}</div>
      <div className="bars-area">
        <div className="bars-scale">
          {[1, 0.5, 0].map((доля) => <span key={доля}>{props.число(верх * доля)}</span>)}
        </div>
        <div className="bars-plot" onMouseLeave={() => setНаведено(null)}>
          {столбики.map((с, номер) => {
            const всего = сумма(с);
            const метки = меткиПоШагу.get(номер) ?? [];
            return (
              <div key={с.начало} className={`bars-col${с.неполный ? ' bars-fresh' : ''}${наведено === номер ? ' bars-hover' : ''}`}
                onMouseEnter={() => setНаведено(номер)}>
                <div className="bars-track">
                  <div className="bars-bar" style={{height: `${(всего / верх) * 100}%`}}>
                    {[...props.коды].reverse().map((код) => (с.языки[код] ?? 0) > 0 && (
                      <span key={код} className="bars-part" style={{
                        flexGrow: с.языки[код],
                        background: props.цветные.includes(код) ? props.цвета[код] : undefined,
                      }} />
                    ))}
                  </div>
                </div>
                <span className="bars-count">{всеЧисла || наведено === номер ? props.число(всего) : ''}</span>
                <span className="bars-label">{номер % шагПодписи === 0 || номер === столбики.length - 1 ? props.подписьШага(с.начало) : ''}</span>
                <span className="bars-marker">
                  {метки.length > 0 && (
                    <button title={метки.flatMap((м) => м.подписи).join('\n')} onClick={() => props.onМетка?.(метки[0].день)}>▲</button>
                  )}
                </span>
                {наведено === номер && (
                  <div className="bars-tip">
                    <strong>{props.подписьШага(с.начало)}: {props.число(всего)}</strong>
                    {с.неполный && <div className="trend-tip-note">{props.неполныйТекст}</div>}
                    {props.коды.map((код) => (с.языки[код] ?? 0) > 0 && (
                      <div key={код}><i style={{background: props.цвета[код]}} /> {код.toUpperCase()} {props.число(с.языки[код])}</div>
                    ))}
                    {метки.flatMap((м) => м.подписи).slice(0, 5).map((подпись, i) => <div key={i} className="trend-tip-event">▲ {подпись}</div>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
