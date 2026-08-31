import type { HistoryBucket } from '@kroma/core';
import { useFormat, useT } from '@kroma/ui';
import { Chart, type ChartPoint, type ColorValue } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { KIND_SERIES } from '#web/features/admin/chart-palette';

const DEFAULT_STEP_SEC = 3;

const METRICS_HEIGHT = 208;
const HISTORY_HEIGHT = 256;

export interface MetricsSeries {
  field: string;
  label: string;
  data: number[];
  color: ColorValue;
  fill?: boolean;
}

function sampleTimes(count: number, stepSec: number, startedAtSec?: number): number[] {
  const step = stepSec * 1000;
  const first = startedAtSec === undefined ? Date.now() - (count - 1) * step : startedAtSec * 1000;
  return Array.from({ length: count }, (_, at) => first + at * step);
}

function samplesOf(
  series: readonly MetricsSeries[],
  times: readonly number[],
  nameAt: (ms: number) => string,
): ChartPoint[] {
  return times.map((ms, at) => {
    const point: ChartPoint = { at: nameAt(ms) };
    for (const one of series) point[one.field] = one.data[at] ?? null;
    return point;
  });
}

export function MetricsChart({
  series,
  max,
  formatValue,
  label,
  footer,
  startedAtSec,
  stepSec = DEFAULT_STEP_SEC,
}: Readonly<{
  series: MetricsSeries[];
  max: number;
  formatValue: (value: number) => string;
  label: string;
  footer?: ReactNode;
  startedAtSec?: number;
  stepSec?: number;
}>) {
  const fmt = useFormat();
  const count = Math.max(0, ...series.map((one) => one.data.length));
  return (
    <Chart.Root
      data={samplesOf(series, sampleTimes(count, stepSec, startedAtSec), fmt.elapsed)}
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
          <Chart.Area key={one.field} series={one.field} label={one.label} color={one.color} />
        ) : (
          <Chart.Line key={one.field} series={one.field} label={one.label} color={one.color} />
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

export function HistoryBars({
  buckets,
  label,
  footer,
}: Readonly<{ buckets: HistoryBucket[]; label: string; footer?: ReactNode }>) {
  const t = useT();
  const fmt = useFormat();
  const data = buckets.map((bucket) => ({
    at: bucket.label,
    movie: bucket.filmsMs,
    tv: bucket.tvMs,
  }));
  return (
    <Chart.Root data={data} x="at" height={HISTORY_HEIGHT} format={fmt.hours} label={label} min={0}>
      <Chart.Grid />
      <Chart.Bar series="movie" label={t('admin.kindMovie')} color={KIND_SERIES.movie} />
      <Chart.Bar series="tv" label={t('admin.kindTv')} color={KIND_SERIES.tv} stack />
      <Chart.Axis edge="left" />
      <Chart.Axis edge="bottom" />
      <Chart.Tooltip />
      <Chart.Legend />
      {footer ? <Chart.Footer>{footer}</Chart.Footer> : null}
    </Chart.Root>
  );
}
