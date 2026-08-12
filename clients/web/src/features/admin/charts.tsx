// Admin-dashboard charts, rendered with Chart.js (react-chartjs-2): a reusable
// multi-series line/area chart (Débit / CPU / RAM) and the stacked films-vs-TV
// history bars. Chart.js owns the plot, axes, grid and tooltips; the key under
// each plot is the kit's <Legend>, and the footer is bespoke React.

import type { HistoryBucket } from '@kroma/core';
import type { ColorValue } from '@kroma/ui/kit';
import { Box, Legend, Row, Text } from '@kroma/ui/kit';
import { withAlpha } from '@kroma/ui/tokens/colors';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  type ScriptableContext,
  Tooltip,
} from 'chart.js';
import type { ReactNode } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { CHART_INK, CHART_SERIES } from '#web/features/admin/chart-palette';
import { formatHours } from '#web/shared/lib/adminFormat';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
);

ChartJS.defaults.font.family =
  'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

// Fallback only; the server is authoritative via `sampleIntervalMs`
// (see server/crates/kroma-engine/src/infra/metrics.rs).
const DEFAULT_SAMPLE_SEC = 3;

const GRID = CHART_INK.grid;

function areaFill(color: string) {
  return (ctx: ScriptableContext<'line'>) => {
    const { chart } = ctx;
    const { ctx: canvas, chartArea } = chart;
    if (!chartArea) return withAlpha(color, 0.18);
    const g = canvas.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, withAlpha(color, 0.35));
    g.addColorStop(1, withAlpha(color, 0));
    return g;
  };
}

function timeAgo(secondsAgo: number): string {
  if (secondsAgo <= 0) return 'MAINTENANT';
  const total = Math.round(secondsAgo);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function timeLabels(n: number, sampleSec: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const tickEvery = (n - 1) / 6;
    const onTick = n <= 7 || Math.abs(i % tickEvery) < 0.5 || i === n - 1;
    return onTick ? timeAgo((n - 1 - i) * sampleSec) : '';
  });
}

interface SeriesDef {
  label: string;
  data: number[];
  color: string;
  fill?: boolean;
}

/** A multi-series line/area chart with a left y-axis, legend and footer. */
export function MetricsChart({
  series,
  max,
  formatValue,
  legend,
  footer,
  sampleSec = DEFAULT_SAMPLE_SEC,
}: Readonly<{
  series: SeriesDef[];
  max: number;
  formatValue: (v: number) => string;
  legend: { label: string; color: ColorValue }[];
  footer?: ReactNode;
  sampleSec?: number;
}>) {
  const n = Math.max(0, ...series.map((s) => s.data.length));
  const labels = timeLabels(n, sampleSec);

  const data = {
    labels,
    datasets: series.map((s) => ({
      label: s.label,
      data: s.data,
      borderColor: s.color,
      backgroundColor: s.fill ? areaFill(s.color) : 'transparent',
      fill: s.fill ? 'origin' : false,
      borderWidth: 2.6,
      tension: 0.35,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBackgroundColor: s.color,
      pointHoverBorderColor: CHART_INK.point,
    })),
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: (c) => (c.tick.label === 'MAINTENANT' ? CHART_INK.tickNow : CHART_INK.tick),
          autoSkip: false,
          maxRotation: 0,
          font: { size: 11, weight: 500 },
        },
      },
      y: {
        min: 0,
        max,
        grid: { color: GRID },
        border: { display: false },
        ticks: {
          color: CHART_INK.tick,
          count: 6,
          font: { size: 11, weight: 500 },
          callback: (v) => formatValue(Number(v)),
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: CHART_INK.tooltipBg,
        borderColor: CHART_INK.tooltipBorder,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 9,
        titleColor: CHART_INK.tooltipTitle,
        bodyColor: CHART_INK.tooltipBody,
        usePointStyle: true,
        callbacks: {
          title: (items) => {
            const i = items[0]?.dataIndex ?? 0;
            return timeAgo((n - 1 - i) * sampleSec);
          },
          label: (item) => ` ${item.dataset.label}: ${formatValue(item.parsed.y ?? 0)}`,
        },
      },
    },
  };

  return (
    <Box>
      <Box h={208}>
        <Line data={data} options={options} />
      </Box>
      <Row wrap between gap={16} mt={14}>
        <Legend.Root>
          {legend.map((l) => (
            <Legend.Item key={l.label} color={l.color}>
              {l.label}
            </Legend.Item>
          ))}
        </Legend.Root>
        {footer ? (
          <Text variant="meta" color="textDim">
            {footer}
          </Text>
        ) : null}
      </Row>
    </Box>
  );
}

/** Stacked weekly bars: films (green) + TV (red). */
export function HistoryBars({ buckets }: Readonly<{ buckets: HistoryBucket[] }>) {
  const totalFilms = buckets.reduce((a, b) => a + b.filmsMs, 0);
  const totalTv = buckets.reduce((a, b) => a + b.tvMs, 0);

  const data = {
    labels: buckets.map((b) => b.label),
    datasets: [
      {
        label: 'FILMS',
        data: buckets.map((b) => b.filmsMs),
        backgroundColor: CHART_SERIES.films,
        borderRadius: { topLeft: 6, topRight: 6 },
        borderSkipped: false as const,
      },
      {
        label: 'TV',
        data: buckets.map((b) => b.tvMs),
        backgroundColor: CHART_SERIES.tv,
        borderRadius: { topLeft: 6, topRight: 6 },
        borderSkipped: false as const,
      },
    ],
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        border: { color: GRID },
        ticks: { color: CHART_INK.tick, font: { size: 12, weight: 500 } },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: { color: GRID },
        border: { display: false },
        ticks: {
          color: CHART_INK.tick,
          count: 6,
          font: { size: 11, weight: 500 },
          callback: (v) => formatHours(Number(v)),
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: CHART_INK.tooltipBg,
        borderColor: CHART_INK.tooltipBorder,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 9,
        titleColor: CHART_INK.tooltipTitle,
        bodyColor: CHART_INK.tooltipBody,
        usePointStyle: true,
        callbacks: {
          label: (item) => ` ${item.dataset.label}: ${formatHours(item.parsed.y ?? 0)}`,
        },
      },
    },
  };

  return (
    <Box>
      <Box h={256}>
        <Bar data={data} options={options} />
      </Box>
      <Row wrap between gap={16} mt={14}>
        <Legend.Root>
          <Legend.Item color={CHART_SERIES.films}>FILMS</Legend.Item>
          <Legend.Item color={CHART_SERIES.tv}>TV</Legend.Item>
        </Legend.Root>
        <Text variant="meta" color="textDim">
          Totaux : Films {formatHours(totalFilms)} · TV {formatHours(totalTv)}
        </Text>
      </Row>
    </Box>
  );
}
