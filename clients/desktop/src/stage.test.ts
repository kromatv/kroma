// @vitest-environment jsdom
//
// The self-scaling 1920x1080 stage, for fixed-screen shells.
//
// The shared TV UI is authored on a fixed canvas in real pixels, so on a Steam
// Deck or a fullscreen kiosk the whole thing is rendered at 1920x1080 and scaled
// to fit. The scale must be the SMALLER of the two ratios: take the larger and
// the canvas overflows the screen, which on a 10-foot layout means the row of
// controls along one edge is simply not on the television. Letterboxing is the
// deliberate trade.
//
// The transparent background is the one platform-specific decision. On the Linux
// desktop shell mpv renders in a native window BEHIND the web view, so a painted
// background hides the film entirely - a black screen with working audio and
// working controls. Everywhere else the surround has to be painted, or the
// letterbox bars show whatever the compositor last had there.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installStage } from './stage';

const STAGE_W = 1920;
const STAGE_H = 1080;

/** Pretend the window is this size, and report the stage's scale. */
function resizeTo(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

const scale = () => Number(document.documentElement.style.getPropertyValue('--kroma-stage-scale'));

const css = () => document.head.querySelector('style')?.textContent ?? '';

beforeEach(() => {
  document.head.innerHTML = '';
  document.documentElement.style.cssText = '';
  resizeTo(STAGE_W, STAGE_H);
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the scale', () => {
  it('is 1 on an exactly 1080p screen', () => {
    installStage();
    expect(scale()).toBe(1);
  });

  it('fits a smaller screen', () => {
    resizeTo(1280, 720);
    installStage();
    expect(scale()).toBeCloseTo(1280 / STAGE_W, 6);
  });

  it('fills a larger one', () => {
    resizeTo(3840, 2160);
    installStage();
    expect(scale()).toBeCloseTo(2, 6);
  });

  it('takes the SMALLER ratio on a wider screen', () => {
    // 21:9. Scaling to the width would push the top and bottom of the layout off
    // the panel - on a 10-foot UI, that is the whole nav row.
    resizeTo(2560, 1080);
    installStage();
    expect(scale()).toBeCloseTo(1080 / STAGE_H, 6);
  });

  it('takes the SMALLER ratio on a taller screen', () => {
    resizeTo(1920, 1440);
    installStage();
    expect(scale()).toBeCloseTo(1, 6);
  });

  it('never overflows the window, whatever its shape', () => {
    for (const [w, h] of [
      [1280, 800],
      [1366, 768],
      [1920, 1080],
      [2560, 1080],
      [3440, 1440],
      [800, 1280],
    ] as Array<[number, number]>) {
      document.head.innerHTML = '';
      resizeTo(w, h);
      installStage();
      expect(STAGE_W * scale()).toBeLessThanOrEqual(w + 0.001);
      expect(STAGE_H * scale()).toBeLessThanOrEqual(h + 0.001);
    }
  });

  it('follows the window as it is resized', () => {
    installStage();
    expect(scale()).toBe(1);

    resizeTo(960, 540);
    window.dispatchEvent(new Event('resize'));
    // A kiosk changes resolution when a television renegotiates HDMI; a stage
    // frozen at the old scale is cropped or postage-stamped until relaunch.
    expect(scale()).toBeCloseTo(0.5, 6);
  });
});

describe('the stage box', () => {
  it('renders the canvas at its authored size', () => {
    installStage();
    expect(css()).toContain(`width: ${STAGE_W}px`);
    expect(css()).toContain(`height: ${STAGE_H}px`);
  });

  it('centres it and scales from the centre', () => {
    installStage();
    // Letterboxing has to be symmetric; a corner origin puts the whole surround
    // on two sides.
    expect(css()).toContain('transform-origin: center center');
    expect(css()).toContain('translate(-50%, -50%)');
  });

  it('scales through the custom property the resize handler writes', () => {
    installStage();
    expect(css()).toContain('scale(var(--kroma-stage-scale, 1))');
  });

  it('makes #root a containing block for the app’s fixed layers', () => {
    installStage();
    // The transform is what makes home/player/detail fill the STAGE rather than
    // the window; without it they escape the letterbox.
    expect(css()).toMatch(/#root\s*\{[^}]*position: fixed/);
  });

  it('stops the page itself scrolling', () => {
    installStage();
    expect(css()).toMatch(/html, body \{[^}]*overflow: hidden/);
  });
});

describe('the letterbox surround', () => {
  it('is painted in a browser', () => {
    installStage();
    // Nothing renders behind the web view here, so unpainted bars show whatever
    // the compositor last had.
    expect(css()).toContain('var(--kroma-bg, #0a0a0c)');
    expect(css()).not.toContain('background: transparent');
  });

  it('is TRANSPARENT on the Linux desktop shell, where mpv is behind', () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {});
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64)',
      configurable: true,
    });
    installStage();
    // Painting here hides the film entirely: a black screen with working audio
    // and working controls.
    expect(css()).toContain('background: transparent');
  });

  it('is painted on Tauri where mpv is NOT behind', () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {});
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
    });
    installStage();
    expect(css()).not.toContain('background: transparent');
  });

  it('is painted on Android, whose user agent also says Linux', () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {});
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel)',
      configurable: true,
    });
    // Every Android UA contains "Linux"; matching on that alone makes the TV
    // shell transparent over nothing.
    installStage();
    expect(css()).not.toContain('background: transparent');
  });

  it('accepts either spelling of the Tauri global', () => {
    vi.stubGlobal('__TAURI__', {});
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64)',
      configurable: true,
    });
    installStage();
    expect(css()).toContain('background: transparent');
  });
});
