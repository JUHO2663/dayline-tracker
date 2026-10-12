import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDate } from '../../utils/time';
import { formatLabValue, type SeriesPoint } from './labs';

// Colors come from CSS (.trend …) so light/dark tokens apply; see styles.css.
// Deliberately no reference ranges, bands or high/low coloring.

interface Datum extends SeriesPoint {
  t: number;
  label: string;
}

const DAY_MS = 86_400_000;

function toTime(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function tickLabel(t: number, multiYear: boolean): string {
  const d = new Date(t);
  const y = String(d.getUTCFullYear()).slice(2);
  return multiYear ? `${y}.${d.getUTCMonth() + 1}` : `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** At most ~5 ticks, placed on actual measurement dates. */
function pickTicks(data: Datum[]): number[] {
  if (data.length <= 5) return data.map((d) => d.t);
  const step = (data.length - 1) / 4;
  return [0, 1, 2, 3, 4].map((i) => data[Math.round(i * step)]!.t);
}

interface TooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  unit: string;
}

function ChartTooltip({ active, payload, unit }: TooltipProps) {
  const datum = active ? (payload?.[0]?.payload as Datum | undefined) : undefined;
  if (!datum) return null;
  return (
    <div className="trend-tooltip">
      <strong>
        {datum.label} <span className="muted">{unit}</span>
      </strong>
      <span className="muted">{formatDate(datum.date, true)}</span>
    </div>
  );
}

interface Props {
  title: string;
  unit: string;
  points: SeriesPoint[];
}

export function TrendChart({ title, unit, points }: Props) {
  const data: Datum[] = points.map((p) => ({ ...p, t: toTime(p.date), label: formatLabValue(p) }));
  const first = data[0];
  const last = data.at(-1);
  if (!first || !last) return null;
  // One value is a number, not a trend; the list below already shows it.
  if (data.length === 1) return <p className="muted small-text">값이 2개 이상 쌓이면 그래프로 보여줘요.</p>;

  const span = last.t - first.t;
  const pad = span === 0 ? 15 * DAY_MS : Math.max(span * 0.04, DAY_MS);
  const multiYear = new Date(first.t).getUTCFullYear() !== new Date(last.t).getUTCFullYear();
  const hasComparator = data.some((d) => d.comparator);

  return (
    <figure className="trend">
      <div
        className="trend-plot"
        role="img"
        aria-label={`${title} ${unit} 추이: ${data.length}개 값, 가장 최근 ${formatDate(last.date, true)} ${last.label}`}
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 20, right: 28, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[first.t - pad, last.t + pad]}
              ticks={pickTicks(data)}
              tickFormatter={(t: number) => tickLabel(t, multiYear)}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              dataKey="value"
              domain={['auto', 'auto']}
              axisLine={false}
              tickLine={false}
              width={44}
              tickCount={4}
            />
            <Tooltip
              content={(props) => <ChartTooltip {...props} unit={unit} />}
              cursor={{ className: 'trend-cursor' }}
              isAnimationActive={false}
            />
            <Line
              dataKey="value"
              type="linear"
              isAnimationActive={false}
              className="trend-line"
              dot={(props: { cx?: number; cy?: number; index?: number; payload?: Datum }) => (
                <circle
                  key={props.index}
                  cx={props.cx}
                  cy={props.cy}
                  // r=5 with a 2px surface ring leaves an 8px filled marker.
                  r={5}
                  className={props.payload?.comparator ? 'trend-dot open' : 'trend-dot'}
                />
              )}
              activeDot={{ r: 7, className: 'trend-dot active' }}
              label={(props: { x?: number | string; y?: number | string; index?: number }) =>
                props.index === data.length - 1 ? (
                  <text
                    key="end"
                    x={Number(props.x)}
                    y={Number(props.y) - 12}
                    textAnchor="middle"
                    className="trend-end-label"
                  >
                    {last.label}
                  </text>
                ) : (
                  <g key={props.index} />
                )
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {hasComparator && (
        <figcaption className="muted small-text">
          속이 빈 점은 &lt; 또는 &gt;가 붙은 값이에요. 적힌 숫자 위치에 표시했어요.
        </figcaption>
      )}
    </figure>
  );
}
