// The 1920x1080 stage, fitted inside the window.
//
// The shared @kroma/tv UI is authored on a fixed 1920x1080 canvas in real pixels
// - PosterGrid's column math depends on it: 1792px of content is exactly
// 8 x 203px tiles plus 7 x 24px gaps, which with its 2 x 64px padding is exactly
// 1920. Every packaged shell IS that panel; a browser window is not, and the raw
// pixels do not survive the difference: at any other width the fixed-px rows
// overflow, and at any height under 1080 the browse screen's header, filter
// chips, grid and hint bar no longer fit either.
//
// So the canvas is what gets fitted, by the smaller ratio:
//
//   scale = min(w / 1920, h / 1080)
//
// FIT-INSIDE, the same rule the desktop shell's `installStage()` uses for the
// Steam Deck. Fitting WIDTH only would starve the height requirement whenever
// the window isn't 16:9 or taller, riding the grid's clip box (which bleeds
// 32px for focus rings, see organisms/virtual/clip.ts) up over the filter
// chips. The surround FIT-INSIDE costs on a non-16:9 window is painted in the
// app background, so it reads as the frame of the picture rather than as a bug.
//
// The real "no surround" answer is a responsive 10-foot layout - columns and
// gutters derived from the viewport instead of from 1920 - which is a change to
// the design system, not to this shell.
//
// As in the desktop stage, the `transform` on #root makes it the containing
// block for the app's `position: fixed` full-screen layers (home / player /
// detail), so they fill the stage rather than the window.

const STAGE_W = 1920;
const STAGE_H = 1080;

/** Install the self-scaling 1920x1080 stage. */
export function installStage(): void {
  const style = document.createElement('style');
  style.textContent = `
    html, body { height: 100%; margin: 0; overflow: hidden; background: var(--kroma-bg, #0a0a0c); }
    #root {
      position: fixed; top: 50%; left: 50%;
      width: ${STAGE_W}px; height: ${STAGE_H}px;
      transform: translate(-50%, -50%) scale(var(--kroma-stage-scale, 1));
      transform-origin: center center;
      overflow: hidden;
    }
  `;
  document.head.appendChild(style);

  const apply = () => {
    const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    document.documentElement.style.setProperty('--kroma-stage-scale', String(scale));
  };
  apply();
  window.addEventListener('resize', apply);
}
