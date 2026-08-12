// What <Chart>'s parts share: the box the Root resolved, the scale every mark
// is drawn against, and the series it read off its own children.

import type { ColorValue } from '#ui/core';
import { partContext } from '#ui/lib/part-context';
import type { ChartBox, ChartDomain, ChartPoint } from './chart-scale';

/** How a series is drawn. */
export type ChartMark = 'line' | 'area' | 'bar';

export interface ChartSeries {
  /** The field this series reads off every point. */
  series: string;
  /** What the legend, the tooltip and the summary call it. */
  label?: string;
  /** The slot this series' position earned, or the paint the mark asked for. */
  color: ColorValue;
  mark: ChartMark;
  column: readonly (number | null)[];
  /** Where a stacked bar's foot sits, per sample. */
  base?: readonly number[];
  /** Which stack a bar belongs to. Bars sharing one round the stack's outer
   *  corners between them and leave every join square. */
  stackAt?: number;
}

export interface ChartState {
  data: readonly ChartPoint[];
  count: number;
  /** The drawable box, with whatever the axes reserved already taken off. */
  plot: ChartBox;
  domain: ChartDomain;
  series: readonly ChartSeries[];
  /** True once a bar is drawn: a sample owns a slice of the width rather than
   *  a position on it, and the cursor picks the slice. */
  band: boolean;
  /** What each sample is called along the bottom edge. */
  labels: readonly string[];
  format: (value: number) => string;
  label?: string;
  active: number | null;
  setActive: (index: number | null) => void;
}

const [ChartContext, useChart] = partContext<ChartState>('Chart.Root');

export { ChartContext, useChart };
