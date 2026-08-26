import { useId, useState } from 'react';
import { scaleFor } from '#site/components/stats/scale';

export interface TrendPoint {
  day: string;
  instances: number;
}

export interface TrendProps {
  title: string;
  points: readonly TrendPoint[];
  empty: string;
  /** Announced to the tooltip, e.g. "instances". */
  unit: string;
}

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };
const PLOT = { w: WIDTH - PAD.left - PAD.right, h: HEIGHT - PAD.top - PAD.bottom };
export function Trend({ title, points, empty, unit }: Readonly<TrendProps>) {
  const gradientId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <section className="rounded-2xl border border-border bg-surface-1 p-6">
        <h3 className="font-display text-lg font-bold text-text">{title}</h3>
        <p className="mt-4 text-sm text-muted">{empty}</p>
      </section>
    );
  }

  const { top, lines } = scaleFor(points.reduce((peak, p) => Math.max(peak, p.instances), 0));
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * PLOT.w;
  const y = (v: number) => PAD.top + PLOT.h - (v / top) * PLOT.h;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.instances)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${PAD.top + PLOT.h} L${PAD.left},${PAD.top + PLOT.h} Z`;
  const active = hovered === null ? null : points[hovered];

  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-6">
      <h3 className="font-display text-lg font-bold text-text">{title}</h3>
      <div className="relative mt-5 text-accent-text">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          role="img"
          aria-label={`${title}: ${points[0]?.day} ${points[0]?.instances} ${unit}, ${points[points.length - 1]?.day} ${points[points.length - 1]?.instances} ${unit}`}
          onPointerLeave={() => setHovered(null)}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const at = ((event.clientX - box.left) / box.width) * WIDTH;
            const ratio = (at - PAD.left) / PLOT.w;
            const index = Math.round(ratio * (points.length - 1));
            setHovered(Math.min(points.length - 1, Math.max(0, index)));
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
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
                  x={PAD.left - 8}
                  y={y(value) + 4}
                  textAnchor="end"
                  className="fill-dim text-[11px] tabular-nums"
                >
                  {value}
                </text>
              </g>
            );
          })}
          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {active && hovered !== null && (
            <g>
              <line
                x1={x(hovered)}
                x2={x(hovered)}
                y1={PAD.top}
                y2={PAD.top + PLOT.h}
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle
                cx={x(hovered)}
                cy={y(active.instances)}
                r="5"
                fill="currentColor"
                className="stroke-surface-1"
                strokeWidth="2"
              />
            </g>
          )}
          <text x={PAD.left} y={HEIGHT - 6} className="fill-dim text-[11px]">
            {points[0]?.day}
          </text>
          <text
            x={WIDTH - PAD.right}
            y={HEIGHT - 6}
            textAnchor="end"
            className="fill-dim text-[11px]"
          >
            {points[points.length - 1]?.day}
          </text>
        </svg>
        {active && (
          <p className="mt-3 text-sm text-muted tabular-nums">
            {active.day} · <span className="text-text">{active.instances}</span> {unit}
          </p>
        )}
      </div>
    </section>
  );
}
