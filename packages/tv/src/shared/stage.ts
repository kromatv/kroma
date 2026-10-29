// The DESIGN stage: the canvas the 10-foot layout is drawn against, and how it
// is fitted to a window that is not a television.
//
// A packaged television shell IS this canvas, exactly. A desktop window is not,
// so anything a screen can measure it measures, and these are what it assumes
// until the measurement arrives - a first frame drawn at the design size
// rather than a blank one. Nothing here is a limit: a grid handed more room
// fills it with more columns, a page handed more height shows more rows.

import { webDocument, webWindow } from '@kromatv/ui/kit';

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
// the canvas is scaled down instead of narrowed. Lowering it is a change to the
// CHROME, not to this number.
export const MIN_STAGE_W = STAGE_W;

export interface StageFit {
  scale: number;
  width: number;
  height: number;
}

/**
 * The canvas for a window of `windowW` x `windowH` device-independent pixels.
 *
 * The scale is the largest that keeps the design canvas whole, so 10-foot type
 * is drawn at the size it was designed at relative to the window, and the
 * canvas then takes the WHOLE window in those same units: a wide window earns
 * columns, a tall one earns rows, and neither keeps a bar. The width floors at
 * {@link MIN_STAGE_W} and the height at {@link STAGE_H}.
 */
export function fitStage(windowW: number, windowH: number): StageFit {
  if (windowW <= 0 || windowH <= 0) return { scale: 1, width: STAGE_W, height: STAGE_H };
  const scale = Math.min(windowH / STAGE_H, windowW / MIN_STAGE_W);
  return { scale, width: Math.round(windowW / scale), height: Math.round(windowH / scale) };
}

/**
 * Fit the canvas to a browser window: `#root` is drawn at the fitted size,
 * centred in the window by the body's flex box and scaled to it, so it fills
 * the window edge to edge. The `transform` also makes `#root` the containing
 * block for the app's `position: fixed` layers, so they fill the stage rather
 * than the window. Web shells only.
 */
export function installStage(): void {
  const doc = webDocument();
  const win = webWindow();
  if (!doc || !win) return;
  const style = doc.createElement('style');
  style.textContent = `
    html, body { height: 100%; margin: 0; overflow: hidden; background: var(--kroma-bg, #0a0a0c); }
    body { display: flex; align-items: center; justify-content: center; }
    #root {
      flex: none;
      width: var(--kroma-stage-width, ${STAGE_W}px);
      height: var(--kroma-stage-height, ${STAGE_H}px);
      transform: scale(var(--kroma-stage-scale, 1));
      transform-origin: center center;
      overflow: hidden;
    }
  `;
  doc.head.appendChild(style);

  const apply = () => {
    const fit = fitStage(win.innerWidth, win.innerHeight);
    const root = doc.documentElement.style;
    root.setProperty('--kroma-stage-scale', String(fit.scale));
    root.setProperty('--kroma-stage-width', `${fit.width}px`);
    root.setProperty('--kroma-stage-height', `${fit.height}px`);
  };
  apply();
  win.addEventListener('resize', apply);
}
