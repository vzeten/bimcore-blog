import {useEffect, useRef, useState} from 'react';

/** Точка ряда: начало шага, значение и пометка «Google ещё досчитывает». */
export interface ТочкаГрафика {
  начало: string;
  значение: number;
  неполный: boolean;
}

/** Метка события «Действий» под осью: день и подписи (что изменилось). */
export interface МеткаГрафика {
  день: string;
  подписи: string[];
}

const ВЫСОТА = 150;
const ОТСТУП = {слева: 52, справа: 12, сверху: 10, снизу: 38};

/** Круглая верхняя граница оси: 1, 2 или 5 на порядок. */
function граница(максимум: number): number {
  if (максимум <= 0) return 1;
  const порядок = 10 ** Math.floor(Math.log10(максимум));
  return [1, 2, 5, 10].map((к) => к * порядок).find((в) => в >= максимум) ?? максимум;
}

/**
 * Линейный график одного показателя (показы или переходы) — одна ось, один цвет; второй показатель рисуется
 * своим графиком под этим, а не второй осью. Неполные шаги — пунктиром. Под осью — метки событий: щелчок
 * открывает дни вокруг события. Наведение — вертикальная линия и подсказка со значением и событиями шага.
 */
export function TrendChart(props: {
  название: string;
  точки: ТочкаГрафика[];
  метки: МеткаГрафика[];
  подписьДня: (день: string) => string;
  число: (значение: number) => string;
  неполныйТекст: string;
  onМетка?: (день: string) => void;
}) {
  const рамка = useRef<HTMLDivElement>(null);
  const [ширина, setШирина] = useState(640);
  const [наведено, setНаведено] = useState<number | null>(null);

  useEffect(() => {
    const узел = рамка.current;
    if (!узел || typeof ResizeObserver === 'undefined') return undefined;
    const наблюдатель = new ResizeObserver(([запись]) => setШирина(Math.max(320, запись.contentRect.width)));
    наблюдатель.observe(узел);
    return () => наблюдатель.disconnect();
  }, []);

  const {точки} = props;
  const поле = {ш: ширина - ОТСТУП.слева - ОТСТУП.справа, в: ВЫСОТА - ОТСТУП.сверху - ОТСТУП.снизу};
  const верх = граница(Math.max(0, ...точки.map((т) => т.значение)));
  const x = (номер: number) => ОТСТУП.слева + (точки.length <= 1 ? поле.ш / 2 : (номер / (точки.length - 1)) * поле.ш);
  const y = (значение: number) => ОТСТУП.сверху + поле.в - (значение / верх) * поле.в;

  // Шаг, в который попадает день: последняя точка, начавшаяся не позже него.
  const шагДня = (день: string) => {
    let найден = -1;
    точки.forEach((т, номер) => {
      if (т.начало <= день) найден = номер;
    });
    return найден;
  };
  const меткиПоШагу = new Map<number, МеткаГрафика[]>();
  for (const метка of props.метки) {
    const номер = шагДня(метка.день);
    if (номер < 0) continue;
    меткиПоШагу.set(номер, [...(меткиПоШагу.get(номер) ?? []), метка]);
  }

  const первыйНеполный = точки.findIndex((т) => т.неполный);
  const полные = первыйНеполный < 0 ? точки : точки.slice(0, первыйНеполный);
  const линия = (отрезок: ТочкаГрафика[], начало: number) =>
    отрезок.map((т, i) => `${i === 0 ? 'M' : 'L'}${x(начало + i).toFixed(1)},${y(т.значение).toFixed(1)}`).join(' ');
  const хвост = первыйНеполный < 0 ? [] : точки.slice(Math.max(0, первыйНеполный - 1));
  const подписиОси = точки.length <= 1 ? [0] : [0, 0.2, 0.4, 0.6, 0.8, 1].map((доля) => Math.round(доля * (точки.length - 1)));

  const навести = (событие: React.MouseEvent<SVGSVGElement>) => {
    const прямоугольник = событие.currentTarget.getBoundingClientRect();
    const позиция = ((событие.clientX - прямоугольник.left) / прямоугольник.width) * ширина;
    const номер = Math.round(((позиция - ОТСТУП.слева) / поле.ш) * (точки.length - 1));
    setНаведено(номер >= 0 && номер < точки.length ? номер : null);
  };

  const точка = наведено === null ? null : точки[наведено];

  return (
    <div className="trend" ref={рамка}>
      <div className="trend-title">{props.название}</div>
      <svg width={ширина} height={ВЫСОТА} onMouseMove={навести} onMouseLeave={() => setНаведено(null)} role="img" aria-label={props.название}>
        {[0, 0.5, 1].map((доля) => (
          <g key={доля}>
            <line className="trend-grid" x1={ОТСТУП.слева} x2={ширина - ОТСТУП.справа} y1={y(верх * доля)} y2={y(верх * доля)} />
            <text className="trend-axis" x={ОТСТУП.слева - 6} y={y(верх * доля) + 4} textAnchor="end">{props.число(верх * доля)}</text>
          </g>
        ))}
        {подписиОси.map((номер) => (
          <text key={номер} className="trend-axis" x={x(номер)} y={ВЫСОТА - 6} textAnchor="middle">{props.подписьДня(точки[номер]?.начало ?? '')}</text>
        ))}
        {полные.length > 0 && <path className="trend-line" d={линия(полные, 0)} />}
        {хвост.length > 1 && <path className="trend-line trend-line-fresh" d={линия(хвост, Math.max(0, первыйНеполный - 1))} />}
        {[...меткиПоШагу.keys()].map((номер) => (
          <g key={номер} className="trend-marker" onClick={() => props.onМетка?.(меткиПоШагу.get(номер)![0].день)}>
            <rect x={x(номер) - 8} y={ОТСТУП.сверху + поле.в + 2} width={16} height={16} fill="transparent" />
            <path d={`M${x(номер)},${ОТСТУП.сверху + поле.в + 4} l5,9 h-10 z`} />
          </g>
        ))}
        {точка && (
          <g>
            <line className="trend-cross" x1={x(наведено!)} x2={x(наведено!)} y1={ОТСТУП.сверху} y2={ОТСТУП.сверху + поле.в} />
            <circle className="trend-dot" cx={x(наведено!)} cy={y(точка.значение)} r={4} />
          </g>
        )}
      </svg>
      {точка && (
        <div className="trend-tip" style={{left: Math.min(x(наведено!) + 10, ширина - 230)}}>
          <strong>{props.подписьДня(точка.начало)}: {props.число(точка.значение)}</strong>
          {точка.неполный && <div className="trend-tip-note">{props.неполныйТекст}</div>}
          {(меткиПоШагу.get(наведено!) ?? []).flatMap((метка) => метка.подписи).slice(0, 6).map((подпись, номер) => (
            <div key={номер} className="trend-tip-event">▲ {подпись}</div>
          ))}
        </div>
      )}
    </div>
  );
}
