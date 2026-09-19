import { useId, useState } from 'react';
import { scaleFor } from '#site/components/stats/scale';
import { formatDay, formatDayShort } from '#site/lib/day';
import { getLocale } from '#site/lib/i18n';

export interface TrendSeries {
  id: string;
  label: string;
  /** Read after the value: `12 servers`. */
  unit: string;
  values: readonly number[];
}

export interface TrendProps {
  /** One `YYYY-MM-DD` per value, oldest first. */
  days: readonly string[];
  series: readonly TrendSeries[];
  empty: string;
}

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 20, right: 20, bottom: 30, left: 44 };
const PLOT = { w: WIDTH - PAD.left - PAD.right, h: HEIGHT - PAD.top - PAD.bottom };

export function Trend({ days, series, empty }: Readonly<TrendProps>) {
  const lang = getLocale();
  const gradientId = useId();
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const current = series[selected] ?? series[0];

  if (!current || days.length < 2) return <p className="text-sm text-muted">{empty}</p>;

  const { values } = current;
  const last = values.length - 1;
  const { top, lines } = scaleFor(values.reduce((peak, v) => Math.max(peak, v), 0));
  const x = (i: number) => PAD.left + (i / last) * PLOT.w;
  const y = (v: number) => PAD.top + PLOT.h - (v / top) * PLOT.h;
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const floor = PAD.top + PLOT.h;
  const area = `${line} L${x(last)},${floor} L${PAD.left},${floor} Z`;
  const shown = hovered ?? last;
  const shownDay = days[shown];
  const shownValue = values[shown] ?? 0;
  const firstDay = days[0];
  const lastDay = days[last];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="inline-flex rounded-full border border-border bg-surface-2/60 p-0.5">
          {series.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={i === selected}
              onClick={() => setSelected(i)}
              className={`rounded-full px-3.5 py-1.5 font-sans text-xs font-semibold transition-colors ${
                i === selected ? 'bg-surface-1 text-text shadow-sm' : 'text-muted hover:text-text'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-right tabular-nums">
          <span className="font-display text-3xl font-extrabold leading-none text-text">
            {shownValue.toLocaleString(lang)}
          </span>
          <span className="ml-2 text-sm text-muted">{current.unit}</span>
          <span className="mt-1 block text-xs text-dim">
            {shownDay && formatDay(shownDay, lang)}
          </span>
        </p>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-6 w-full text-accent-wash"
        role="img"
        aria-label={`${current.label}: ${firstDay} ${values[0]} ${current.unit}, ${lastDay} ${values[last]} ${current.unit}`}
        onPointerLeave={() => setHovered(null)}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const at = ((event.clientX - box.left) / box.width) * WIDTH;
          const index = Math.round(((at - PAD.left) / PLOT.w) * last);
          setHovered(Math.min(last, Math.max(0, index)));
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: lines + 1 }, (_, i) => {
          const value = (top / lines) * i;
          return (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(value)}
                y2={y(value)}
                className="stroke-border"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 10}
                y={y(value) + 4}
                textAnchor="end"
                className="fill-dim text-[11px] tabular-nums"
              >
                {value.toLocaleString(lang)}
              </text>
            </g>
          );
        })}
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hovered !== null && (
          <line
            x1={x(hovered)}
            x2={x(hovered)}
            y1={PAD.top}
            y2={floor}
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
        <circle
          cx={x(shown)}
          cy={y(shownValue)}
          r="5.5"
          fill="currentColor"
          className="stroke-surface-1"
          strokeWidth="2.5"
        />
        <text x={PAD.left} y={HEIGHT - 8} className="fill-dim text-[11px]">
          {firstDay && formatDayShort(firstDay, lang)}
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 8}
          textAnchor="end"
          className="fill-dim text-[11px]"
        >
          {lastDay && formatDayShort(lastDay, lang)}
        </text>
      </svg>
    </div>
  );
}
