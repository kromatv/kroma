// The dashboard's two plots, composed out of the kit's <Chart>: the shared
// metrics chart (throughput / CPU / RAM) and the stacked films-vs-TV history.
// What stays here is product policy - the time axis counts back from now, and
// the captions are the admin's own copy.

import type { HistoryBucket } from '@kroma/core';
import { useFormat } from '@kroma/ui';
import { Chart, type ChartPoint, type ColorValue } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { CHART_SERIES } from '#web/features/admin/chart-palette';

// Fallback only; the server is authoritative via `sampleIntervalMs`
// (see server/crates/kroma-engine/src/infra/metrics.rs).
const DEFAULT_SAMPLE_SEC = 3;

const METRICS_HEIGHT = 208;
const HISTORY_HEIGHT = 256;

function timeAgo(secondsAgo: number): string {
  if (secondsAgo <= 0) return 'MAINTENANT';
  const total = Math.round(secondsAgo);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds}s`;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

interface MetricsSeries {
  /** The field each sample carries this series under. */
  id: string;
  label: string;
  data: number[];
  color: ColorValue;
  fill?: boolean;
}

// The server's columns, zipped into one point per sample and named by how long
// ago it was taken.
function samplesOf(series: readonly MetricsSeries[], sampleSec: number): ChartPoint[] {
  const count = Math.max(0, ...series.map((one) => one.data.length));
  return Array.from({ length: count }, (_, at) => {
    const point: ChartPoint = { at: timeAgo((count - 1 - at) * sampleSec) };
    for (const one of series) point[one.id] = one.data[at] ?? null;
    return point;
  });
}

/** A multi-series line/area plot with a left scale, a key and a caption. */
export function MetricsChart({
  series,
  max,
  formatValue,
  label,
  footer,
  sampleSec = DEFAULT_SAMPLE_SEC,
}: Readonly<{
  series: MetricsSeries[];
  max: number;
  formatValue: (value: number) => string;
  label: string;
  footer?: ReactNode;
  sampleSec?: number;
}>) {
  return (
    <Chart.Root
      data={samplesOf(series, sampleSec)}
      x="at"
      height={METRICS_HEIGHT}
      min={0}
      max={max}
      format={formatValue}
      label={label}
    >
      <Chart.Grid />
      {series.map((one) =>
        one.fill ? (
          <Chart.Area key={one.id} series={one.id} label={one.label} color={one.color} />
        ) : (
          <Chart.Line key={one.id} series={one.id} label={one.label} color={one.color} />
        ),
      )}
      <Chart.Axis edge="left" />
      <Chart.Axis edge="bottom" />
      <Chart.Tooltip />
      <Chart.Legend />
      {footer ? <Chart.Footer>{footer}</Chart.Footer> : null}
    </Chart.Root>
  );
}

/** Stacked weekly bars: films (green) + TV (red). */
export function HistoryBars({
  buckets,
  label,
}: Readonly<{ buckets: HistoryBucket[]; label: string }>) {
  const fmt = useFormat();
  const totalFilms = buckets.reduce((sum, bucket) => sum + bucket.filmsMs, 0);
  const totalTv = buckets.reduce((sum, bucket) => sum + bucket.tvMs, 0);
  const data = buckets.map((bucket) => ({
    at: bucket.label,
    films: bucket.filmsMs,
    tv: bucket.tvMs,
  }));
  return (
    <Chart.Root data={data} x="at" height={HISTORY_HEIGHT} format={fmt.hours} label={label} min={0}>
      <Chart.Grid />
      <Chart.Bar series="films" label="FILMS" color={CHART_SERIES.films} />
      <Chart.Bar series="tv" label="TV" color={CHART_SERIES.tv} stack />
      <Chart.Axis edge="left" />
      <Chart.Axis edge="bottom" />
      <Chart.Tooltip />
      <Chart.Legend />
      <Chart.Footer>
        Totaux : Films {fmt.hours(totalFilms)} · TV {fmt.hours(totalTv)}
      </Chart.Footer>
    </Chart.Root>
  );
}
