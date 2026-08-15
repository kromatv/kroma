// @vitest-environment jsdom

import { fitStage, MIN_STAGE_W, STAGE_H, STAGE_W } from '@kroma/tv/stage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installStage } from './stage';

function resizeTo(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

const scale = () => Number(document.documentElement.style.getPropertyValue('--kroma-stage-scale'));
const width = () =>
  Number.parseFloat(document.documentElement.style.getPropertyValue('--kroma-stage-width'));

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

describe('the fit', () => {
  it('is the design canvas, 1:1, on an exactly 1080p screen', () => {
    installStage();
    expect(scale()).toBe(1);
    expect(width()).toBe(STAGE_W);
  });

  it('draws the design at 2x on a 4K panel', () => {
    resizeTo(3840, 2160);
    installStage();
    expect(scale()).toBeCloseTo(2, 6);
    expect(width()).toBe(STAGE_W);
  });

  // A desktop window is any shape the user drags it to; the canvas follows its
  // width rather than clipping the fixed-px rows at the right edge.
  it('takes its extra width from the window', () => {
    resizeTo(2560, 1080);
    installStage();
    expect(width()).toBe(2560);
  });

  it('scales down rather than narrowing past the design width', () => {
    resizeTo(1310, 790);
    installStage();
    expect(width()).toBe(MIN_STAGE_W);
    expect(scale()).toBeCloseTo(1310 / MIN_STAGE_W, 6);
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
      expect(width() * scale()).toBeLessThanOrEqual(w + 1);
      expect(STAGE_H * scale()).toBeLessThanOrEqual(h + 1);
    }
  });

  it('follows the window as it is resized', () => {
    installStage();
    expect(scale()).toBe(1);

    resizeTo(960, 540);
    window.dispatchEvent(new Event('resize'));
    const fit = fitStage(960, 540);
    expect(scale()).toBeCloseTo(fit.scale, 6);
    expect(width()).toBe(fit.width);
  });
});

describe('the stage box', () => {
  it('renders the canvas at its authored height, as wide as the fit says', () => {
    installStage();
    expect(css()).toContain(`height: ${STAGE_H}px`);
    expect(css()).toContain(`var(--kroma-stage-width, ${STAGE_W}px)`);
  });

  it('centres it and scales from the centre', () => {
    installStage();
    expect(css()).toContain('transform-origin: center center');
    expect(css()).toContain('translate(-50%, -50%)');
  });

  it('scales through the custom property the resize handler writes', () => {
    installStage();
    expect(css()).toContain('scale(var(--kroma-stage-scale, 1))');
  });

  it('makes #root a containing block for the app’s fixed layers', () => {
    installStage();
    expect(css()).toMatch(/#root\s*\{[^}]*position: fixed/);
  });

  it('stops the page itself scrolling', () => {
    installStage();
    expect(css()).toMatch(/html, body \{[^}]*overflow: hidden/);
  });
});

describe('the surround', () => {
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
    // mpv renders in a native window behind the web view; painting here hides
    // the film entirely.
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

  it('is painted where there is no navigator to ask', () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {});
    vi.stubGlobal('navigator', undefined);
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
