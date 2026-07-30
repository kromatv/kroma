// The shared @kroma/tv UI is authored on a fixed 1920x1080 canvas, so a
// fixed-screen shell renders #root at that size and scales it to fit. The
// `transform` also makes #root the containing block for the app's
// `position: fixed` layers; `vh`-based `clamp()`s still resolve against the real
// window and drift slightly on heavy scale.

const STAGE_W = 1920;
const STAGE_H = 1080;

/** Installs the self-scaling 1920x1080 stage. Only for fixed-screen shells. */
export function installStage(): void {
  // Transparent when a native mpv window renders behind the UI.
  const inTauri = '__TAURI_INTERNALS__' in globalThis || '__TAURI__' in globalThis;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const mpvBehind = inTauri && /Linux/i.test(ua) && !/Android/i.test(ua);
  const bg = mpvBehind ? 'transparent' : 'var(--kroma-bg, #0a0a0c)';

  const style = document.createElement('style');
  style.textContent = `
    html, body { height: 100%; margin: 0; overflow: hidden; background: ${bg}; }
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
