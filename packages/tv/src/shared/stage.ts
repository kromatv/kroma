// The DESIGN stage: the canvas the 10-foot layout is drawn against, and how it
// is fitted to a window that is not a television.
//
// A packaged television shell IS this canvas, exactly. A desktop window is not,
// so anything a screen can measure it measures, and these are what it assumes
// until the measurement arrives - a first frame drawn at the design width
// rather than a blank one. Nothing here is a limit: a grid handed more room
// fills it with more columns.

/** The design canvas, in the pixels the layout is authored in. */
export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** The gutter every full-screen surface keeps clear at the panel edges. */
export const SCREEN_PAD = 64;

/** The design's content width: the stage inside its gutters. */
export const CONTENT_W = STAGE_W - SCREEN_PAD * 2;

// The canvas grows past the design width but never below it, because the top
// bar is what holds the floor: a fixed set of labels either side of a centred
// pill, roughly 1760px of them, not a grid that can drop a column. Below this
// the canvas is scaled down instead of narrowed, and the window keeps a
// surround. Lowering it is a change to the CHROME, not to this number.
export const MIN_STAGE_W = STAGE_W;

export interface StageFit {
  scale: number;
  width: number;
}

/**
 * The canvas for a window of `windowW` x `windowH` device-independent pixels.
 *
 * The scale comes from the HEIGHT, so 10-foot type is drawn at the size it was
 * designed at whatever the window's shape, and the WIDTH is however much of the
 * canvas the window leaves in those same units: a wide window earns columns
 * instead of a pillarbox, a narrow one loses them instead of clipping. The
 * width floors at {@link MIN_STAGE_W}, past which the scale comes down and the
 * window keeps a surround top and bottom.
 */
export function fitStage(windowW: number, windowH: number): StageFit {
  if (windowW <= 0 || windowH <= 0) return { scale: 1, width: STAGE_W };
  const scale = Math.min(windowH / STAGE_H, windowW / MIN_STAGE_W);
  return { scale, width: Math.round(windowW / scale) };
}
