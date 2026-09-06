// The shared @kroma/tv UI is drawn on a 1080-tall canvas, so the shell renders
// #root at that height and scales it to the window - the panel of a fixed screen
// as much as a resizable desktop window, where the raw pixels would clip the
// 10-foot rows rather than shrink them.
//
// The WIDTH is not fixed: `fitStage` hands back however much canvas the window
// leaves at that scale, and the grids auto-fill it (see @kroma/tv/stage). The
// `transform` also makes #root the containing block for the app's
// `position: fixed` layers; `vh`-based `clamp()`s still resolve against the real
// window and drift slightly on heavy scale. The page is opaque on every OS: where
// a native plane draws the picture, the shell cuts it into the page (video-hole).

import { fitStage, STAGE_H, STAGE_W } from '@kroma/tv/stage';

/** Installs the self-scaling stage. */
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
