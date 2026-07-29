// How the player chrome fits itself to the stage it is drawn on.
//
// The chrome was drawn for a 1920 television, where a 62 / 80 / 62 transport and
// eight 56px cluster circles have room to spare. A browser window is whatever
// the user made it: at 1280 the cluster already reaches back into the transport,
// and the fixed-size circles simply drew ON TOP of each other, because nothing
// in the row was allowed to shrink.
//
// So the row's sizes are DERIVED from the space there actually is, against the
// controls that are actually present (a film with no next episode and no live
// receiver is two circles narrower, and gets to stay full-size for longer).
// Every number below is at design scale; `chromeMetrics` returns the multiplier
// the chrome draws them at.
//
// And when shrinking is no longer enough, the row SHEDS rather than wraps: a
// control row that folds onto a second line stops reading as a transport (see
// `SHED`). What it gives up first is what the player still offers elsewhere.

import type { ControlId } from './nav';

/** Diameter of every control circle, at design scale (§4). */
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

/** The volume pill's rail, which sits beside its mute button inside one pill. */
export const VOLUME_RAIL = 96;
/** Gap between the transport keys, and between the cluster circles (§4). */
export const TRANSPORT_GAP = 20;
export const CLUSTER_GAP = 14;
/** The chrome's side gutters (top bar and bottom chrome share them). */
export const GUTTER = 34;
/**
 * What the transport (seek bar + control row) stands at design scale: the bar's
 * 80 - timecodes, their 13 of air, the 18 track and its 20 margin - over the
 * cluster's 84 (4 of top padding and the 80 play key).
 *
 * The player MEASURES the real thing to place the skip-intro pill above it, and
 * this is the answer until that measurement lands. It is not belt-and-braces:
 * `onLayout` is a ResizeObserver in react-native-web, which the legacy TV tier
 * (Chromium 53-94, see clients/tv-build/polyfills.legacy.ts) does not have and
 * does not polyfill - so on those televisions this number is the ONLY answer,
 * and a zero here would draw the pill straight through the seek bar.
 */
export const TRANSPORT_HEIGHT = 164;
/** The least space allowed between the transport and the cluster: the point at
 * which they stop being two groups and start being one crowded row. */
export const ROW_GAP = 24;

/** The transport keys, which sit centred; everything else is the right cluster. */
const TRANSPORT: ReadonlySet<ControlId> = new Set<ControlId>(['rewind', 'play', 'forward']);

export const isTransport = (id: ControlId): boolean => TRANSPORT.has(id);

/**
 * The floor the chrome may shrink to.
 *
 * Set by the smallest control rather than by taste: 56 × 0.78 ≈ 44, the smallest
 * comfortable touch target. Below this the row stops shrinking and sheds
 * instead - a smaller circle would be a button nobody can hit.
 */
export const MIN_SCALE = 0.78;

/**
 * The scale is quantized to this step. Two reasons, both real: <Box>'s shared
 * style cache is keyed on the shorthand values, so a scale that varies per pixel
 * of window width would mint a cache entry per pixel while a window is dragged;
 * and a row that re-lays-out on every one of those pixels reads as jitter rather
 * than as a resize.
 */
const STEP = 0.02;

export interface ChromeMetrics {
  /** Multiplier for every size in the chrome (1 = the design's own scale). */
  scale: number;
  /** The controls this stage has room for, in visual order - a prefix of the
   *  row it was asked about, minus whatever had to be shed. This is the row the
   *  player draws AND the row the nav machine steps through, so a control that
   *  is not on screen never keeps a D-pad stop (see ./nav). */
  controls: ControlId[];
  /** The volume control keeps its inline rail. False = a bare mute key: the
   *  first 96px the row gives up, and the only one that costs no control. */
  rail: boolean;
  /** The controls this stage had no room for, in the row's own order.
   *
   *  They are moved, not lost: the player lists them in the settings panel the
   *  gear opens (which is why `settings` is never shed), so a 390px browser
   *  window can still cast, open picture-in-picture or jump to the next
   *  episode - two taps instead of one. Empty at every width that fits. */
  overflow: ControlId[];
  /** The cluster's content width at `scale`. Handed to the cluster box as its
   *  minimum, so flexbox takes the space out of the centring spacer instead of
   *  out of the buttons - which is what made them overlap. */
  clusterWidth: number;
}

/**
 * What the row moves into the panel, in order, once shrinking would take a
 * circle below the size of a fingertip.
 *
 * Nothing is lost by shedding: everything here is reported as `overflow` and
 * the player lists it in the settings panel, so a narrow window trades one tap
 * for two rather than losing a feature. The order is therefore about how often
 * a control is reached for, not about what can be sacrificed:
 *
 *  - `pip` is the browser convenience nobody reaches for mid-film;
 *  - `audio` and `subtitles` are already rows of that panel, so they cost
 *    nothing at all to move;
 *  - `next` is also the first card of the "À suivre" sheet;
 *  - `volume` is the one the keyboard (and every phone's own volume keys) still
 *    reaches, and its rail has already gone by then;
 *  - `cast` is late, because handing the film to a television is the one thing
 *    people do from a small window;
 *  - the ±10 s keys go last, and together, or the transport reads lopsided.
 *
 * What is never shed: play, the gear (which is the way to everything above),
 * and fullscreen. That is the row a 250px stage still draws.
 */
const SHED: readonly (readonly ControlId[])[] = [
  ['pip'],
  ['audio'],
  ['subtitles'],
  ['next'],
  ['volume'],
  ['cast'],
  ['rewind', 'forward'],
];

/** One way the row can be drawn: which controls, and whether volume keeps its
 * rail. */
interface RowFit {
  controls: ControlId[];
  rail: boolean;
}

/** Width of one row of controls: their diameters (plus the volume rail, when it
 * is still there to ride inside the volume pill) and the gaps between them. */
function rowWidth(ids: readonly ControlId[], gap: number, rail: boolean): number {
  const controls = ids.reduce(
    (sum, id) => sum + CONTROL_SIZE[id] + (id === 'volume' && rail ? VOLUME_RAIL : 0),
    0,
  );
  return controls + Math.max(0, ids.length - 1) * gap;
}

/** Every way this row can be drawn, widest first: the design, the rail
 * collapsed, then one {@link SHED} step after another. */
function rowFits(row: readonly ControlId[]): [RowFit, ...RowFit[]] {
  let controls = [...row];
  const fits: [RowFit, ...RowFit[]] = [{ controls, rail: true }];
  if (controls.includes('volume')) fits.push({ controls, rail: false });
  for (const shed of SHED) {
    const next = controls.filter((id) => !shed.includes(id));
    // A control the flags already left out is not a step: shedding nothing
    // would offer the fitter the same row twice.
    if (next.length === controls.length) continue;
    controls = next;
    fits.push({ controls, rail: false });
  }
  return fits;
}

/**
 * What this row costs at design scale: two gutters, the transport, a row gap on
 * either side of it, and the cluster.
 *
 * Two row gaps, not one: the outer row's gap falls on both sides of the
 * transport (spacer | transport | cluster), which is also what keeps the
 * transport exactly centred while there is room for it to be.
 */
function designWidth({ controls, rail }: RowFit): number {
  const transport = rowWidth(controls.filter(isTransport), TRANSPORT_GAP, rail);
  const cluster = rowWidth(
    controls.filter((id) => !isTransport(id)),
    CLUSTER_GAP,
    rail,
  );
  return GUTTER * 2 + transport + ROW_GAP * 2 + cluster;
}

/** The scale this fit would be drawn at on `stageWidth` - 1 when it has room to
 * spare, and never above the design. An unmeasured stage (0) is treated as
 * roomy: the first frame draws the full row rather than the floor. */
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
    // Whatever the flags allowed but this stage could not hold. Derived from the
    // two lists rather than accumulated while shedding, so it cannot drift out
    // of step with what was actually dropped.
    overflow: row.filter((id) => !fit.controls.includes(id)),
    // The cluster's width is ALWAYS reported at the scale it will be drawn at,
    // so that rule lives in one place rather than once per outcome.
    clusterWidth: Math.round(cluster * scale),
  };
}

/** Round to the quantization step, and away from float noise (0.02 × 39 is not
 * 0.78 in binary floating point). */
function quantize(scale: number): number {
  return Math.round(Math.floor(scale / STEP) * STEP * 100) / 100;
}

/**
 * How the control row fits `stageWidth`: how large it is drawn, and what it is
 * made of.
 *
 * One rule, applied to each way the row can be drawn in turn (see
 * {@link rowFits}): draw it as large as the stage allows, and if that would take
 * a circle below the touch-target floor, give something up and ask again. So a
 * window loses, in order, a little size, the volume rail, then one control at a
 * time - and what it never loses is the single line. The row used to wrap onto a
 * second one instead, which put eight buttons in two ragged rows under the
 * transport and read as a broken layout rather than a compact one.
 *
 * The returned `controls` is the row that is actually drawn, and the one the nav
 * machine steps through: shedding a control takes its D-pad stop with it, so
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
  // Narrower than even the last row can be drawn in. Hold the floor rather than
  // shed play itself: the row reaches into the gutters, and every key on it is
  // still the size of a fingertip.
  return measure(last, MIN_SCALE, row);
}

/** A size at the chrome's current scale. Integers: a 43.68px circle beside a
 * 43.68px circle is two different roundings in the browser's hands. */
export function px(scale: number, size: number): number {
  return Math.round(size * scale);
}

/** What every part of the chrome measures with. */
export type Px = (size: number) => number;

/** `px` bound to one scale, which is how the parts actually use it: each is
 * handed a scale once and then asks for sizes. Here rather than written out in
 * every part, so there is one rounding rule and not five. */
export const scaler =
  (scale: number): Px =>
  (size) =>
    px(scale, size);

/** The settings panel's share of a stage that has room for it (§5). */
export const PANEL_FRACTION = 0.44;
export const PANEL_MAX = 720;
/**
 * The width below which the panel stops being readable.
 *
 * Its rows are an icon, a label and a value on one line; 44% of a phone-width
 * browser is 170px, which set every label one letter per line. Below this it
 * takes the whole stage instead - it is a full screen on a small screen, which
 * is what every other player does there too.
 */
export const PANEL_MIN = 420;

/**
 * The gap kept on each side of the shrunken picture, beside the panel.
 *
 * Here rather than in `<Player>` because [`panelGeometry`] has to know it: the
 * two used to be decided in different files, so "the panel leaves room" and "the
 * room is enough for a card" could disagree - and did. Between 526 and 548 px
 * the panel declined to cover while the card computed a width of zero, so
 * opening settings made the picture vanish outright instead of shrinking.
 */
export const CARD_MARGIN = 64;

/** The smallest picture worth shrinking to, as a fraction of the stage. Below
 * this the panel takes the whole stage instead: a postage stamp of film down one
 * side is not a picture anyone is watching. */
const MIN_CARD_SCALE = 0.2;

export interface PanelGeometry {
  /** The panel's width in px. */
  width: number;
  /** It leaves too little beside it to be worth shrinking the picture into, so
   *  it covers the stage and the video stays where it is (which is already what
   *  happens behind a native plane). */
  covers: boolean;
}

/** Where the settings panel sits on this stage, and whether the video still has
 * somewhere to shrink to beside it. */
export function panelGeometry(stageWidth: number): PanelGeometry {
  if (stageWidth <= 0) return { width: PANEL_MAX, covers: false };
  const share = Math.min(stageWidth * PANEL_FRACTION, PANEL_MAX);
  // Its share of the stage, but never narrower than it can be read at.
  const wanted = Math.max(share, PANEL_MIN);
  // Whether what is left beside it could hold a picture worth looking at, ASKED
  // IN THE SAME TERMS the card is laid out in - its margins included. A rule
  // stated only as a fraction of the stage (this was `wanted >= stageWidth *
  // 0.8`) does not know about them, which is how a stage could be wide enough
  // to refuse to cover and still leave the card nothing to occupy.
  const card = stageWidth - wanted - CARD_MARGIN * 2;
  const covers = card < stageWidth * MIN_CARD_SCALE;
  return { width: covers ? stageWidth : wanted, covers };
}
