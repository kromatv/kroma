// How the player chrome fits itself to the stage it is drawn on. Every number
// below is at design scale; `chromeMetrics` returns the multiplier to draw at.

import type { ControlId } from './nav';

export const CONTROL_SIZE: Record<ControlId, number> = {
  rewind: 62,
  play: 80,
  forward: 62,
  next: 56,
  volume: 56,
  subtitles: 56,
  audio: 56,
  settings: 56,
  cast: 56,
  pip: 56,
  fullscreen: 56,
};

export const VOLUME_RAIL = 96;
export const TRANSPORT_GAP = 20;
export const CLUSTER_GAP = 14;
export const GUTTER = 34;
// Fallback for the measured transport height: legacy TV Chromium (53-94, see
// clients/tv-build/polyfills.legacy.ts) has no ResizeObserver polyfill for
// `onLayout`, so a zero here would draw the skip-intro pill through the seek bar.
export const TRANSPORT_HEIGHT = 164;
export const ROW_GAP = 24;

const TRANSPORT: ReadonlySet<ControlId> = new Set<ControlId>(['rewind', 'play', 'forward']);

export const isTransport = (id: ControlId): boolean => TRANSPORT.has(id);

// The floor the chrome may shrink to: 56 × 0.78 ≈ 44px, the smallest
// comfortable touch target. Below this the row sheds instead of shrinking.
export const MIN_SCALE = 0.78;

// Quantized so a window drag neither mints a <Box> style-cache entry per pixel
// nor re-lays-out the row on every one of them.
const STEP = 0.02;

export interface ChromeMetrics {
  scale: number;
  controls: ControlId[];
  rail: boolean;
  overflow: ControlId[];
  clusterWidth: number;
}

// What the row moves into the settings panel, in order, once shrinking would
// take a circle below the touch-target floor. Ordered by how often a control is
// reached for; nothing is lost, it is all reported as `overflow`.
const SHED: readonly (readonly ControlId[])[] = [
  ['pip'],
  ['audio'],
  ['subtitles'],
  ['next'],
  ['volume'],
  ['cast'],
  ['rewind', 'forward'],
];

interface RowFit {
  controls: ControlId[];
  rail: boolean;
}

function rowWidth(ids: readonly ControlId[], gap: number, rail: boolean): number {
  const controls = ids.reduce(
    (sum, id) => sum + CONTROL_SIZE[id] + (id === 'volume' && rail ? VOLUME_RAIL : 0),
    0,
  );
  return controls + Math.max(0, ids.length - 1) * gap;
}

// Every way this row can be drawn, widest first: the design, the rail
// collapsed, then one SHED step after another.
function rowFits(row: readonly ControlId[]): [RowFit, ...RowFit[]] {
  let controls = [...row];
  const fits: [RowFit, ...RowFit[]] = [{ controls, rail: true }];
  if (controls.includes('volume')) fits.push({ controls, rail: false });
  for (const shed of SHED) {
    const next = controls.filter((id) => !shed.includes(id));
    // A control the flags already left out is not a step.
    if (next.length === controls.length) continue;
    controls = next;
    fits.push({ controls, rail: false });
  }
  return fits;
}

// Two row gaps, not one: the gap falls on both sides of the transport
// (spacer | transport | cluster), which is what keeps the transport centred.
function designWidth({ controls, rail }: RowFit): number {
  const transport = rowWidth(controls.filter(isTransport), TRANSPORT_GAP, rail);
  const cluster = rowWidth(
    controls.filter((id) => !isTransport(id)),
    CLUSTER_GAP,
    rail,
  );
  return GUTTER * 2 + transport + ROW_GAP * 2 + cluster;
}

// An unmeasured stage (0) is treated as roomy, so the first frame draws the
// full row rather than the floor.
function scaleFor(fit: RowFit, stageWidth: number): number {
  const needed = designWidth(fit);
  if (stageWidth <= 0 || needed <= 0) return 1;
  const ratio = stageWidth / needed;
  return ratio >= 1 ? 1 : quantize(ratio);
}

function measure(fit: RowFit, scale: number, row: readonly ControlId[]): ChromeMetrics {
  const cluster = rowWidth(
    fit.controls.filter((id) => !isTransport(id)),
    CLUSTER_GAP,
    fit.rail,
  );
  return {
    scale,
    controls: fit.controls,
    rail: fit.rail,
    overflow: row.filter((id) => !fit.controls.includes(id)),
    clusterWidth: Math.round(cluster * scale),
  };
}

// Rounded away from float noise: 0.02 × 39 is not 0.78 in binary floating point.
function quantize(scale: number): number {
  return Math.round(Math.floor(scale / STEP) * STEP * 100) / 100;
}

/**
 * How the control row fits `stageWidth`: draw it as large as the stage allows,
 * and where that would take a circle below the touch-target floor, shed a
 * control and ask again. The row never wraps onto a second line. The returned
 * `controls` is both what is drawn and what the nav machine steps through, so
 * nothing focusable is ever off screen.
 */
export function chromeMetrics(row: readonly ControlId[], stageWidth: number): ChromeMetrics {
  const fits = rowFits(row);
  let last = fits[0];
  for (const fit of fits) {
    last = fit;
    const scale = scaleFor(fit, stageWidth);
    if (scale >= MIN_SCALE) return measure(fit, scale, row);
  }
  // Narrower than even the last row: hold the floor rather than shed play itself.
  return measure(last, MIN_SCALE, row);
}

export function px(scale: number, size: number): number {
  return Math.round(size * scale);
}

export type Px = (size: number) => number;

export const scaler =
  (scale: number): Px =>
  (size) =>
    px(scale, size);

export const PANEL_FRACTION = 0.44;
export const PANEL_MAX = 720;
// The width below which the panel covers the whole stage instead: 44% of a
// phone-width browser is 170px, which sets every row label one letter per line.
export const PANEL_MIN = 420;

// The gap kept on each side of the shrunken picture. Shared with panelGeometry
// rather than duplicated, so the two constraints can't disagree on it.
export const CARD_MARGIN = 64;

const MIN_CARD_SCALE = 0.2;

export interface PanelGeometry {
  width: number;
  covers: boolean;
}

/** Where the settings panel sits on this stage, and whether the video still has
 * somewhere to shrink to beside it. */
export function panelGeometry(stageWidth: number): PanelGeometry {
  if (stageWidth <= 0) return { width: PANEL_MAX, covers: false };
  const share = Math.min(stageWidth * PANEL_FRACTION, PANEL_MAX);
  const wanted = Math.max(share, PANEL_MIN);
  // Asked in the same terms the card is laid out in, margins included: a rule
  // stated as a bare fraction of the stage leaves the card nothing to occupy.
  const card = stageWidth - wanted - CARD_MARGIN * 2;
  const covers = card < stageWidth * MIN_CARD_SCALE;
  return { width: covers ? stageWidth : wanted, covers };
}
