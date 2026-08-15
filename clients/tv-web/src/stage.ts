// The 10-foot canvas, fitted inside a browser window.
//
// The shared @kroma/tv UI is drawn in real pixels on a 1080-tall canvas. Every
// packaged shell IS that panel; a browser window is not, and the raw pixels do
// not survive the difference: at any height under 1080 the browse screen's
// header, filter chips, grid and hint bar no longer fit.
//
// So the canvas is scaled by the HEIGHT, and its WIDTH is however much the
// window leaves at that scale (`fitStage`, see @kroma/tv/stage). The layout is
// auto-filled from the width it is given rather than pinned to 1920, so a wide
// window earns grid columns instead of bars either side, and a narrow one loses
// them instead of clipping. Only below the canvas's floor does the scale come
// down and the window keep a surround, painted in the app background so it reads
// as the frame of the picture rather than as a bug.
//
// As in the desktop stage, the `transform` on #root makes it the containing
// block for the app's `position: fixed` full-screen layers (home / player /
// detail), so they fill the stage rather than the window.

import { fitStage, STAGE_H, STAGE_W } from '@kroma/tv/stage';

/** Install the self-scaling stage. */
export function installStage(): void {
  const style = document.createElement('style');
  style.textContent = `
    html, body { height: 100%; margin: 0; overflow: hidden; background: var(--kroma-bg, #0a0a0c); }
    #root {
      position: fixed; top: 50%; left: 50%;
      width: var(--kroma-stage-width, ${STAGE_W}px); height: ${STAGE_H}px;
      transform: translate(-50%, -50%) scale(var(--kroma-stage-scale, 1));
      transform-origin: center center;
      overflow: hidden;
    }
  `;
  document.head.appendChild(style);

  const apply = () => {
    const fit = fitStage(window.innerWidth, window.innerHeight);
    const root = document.documentElement.style;
    root.setProperty('--kroma-stage-scale', String(fit.scale));
    root.setProperty('--kroma-stage-width', `${fit.width}px`);
  };
  apply();
  window.addEventListener('resize', apply);
}
