// @vitest-environment jsdom
//
// The 1920x1080 stage, fitted inside a browser window.
//
// The shared TV UI is not responsive - it is a fixed canvas in real pixels.
// PosterGrid says so outright: 1792px of content is exactly 8 x 203px tiles plus
// 7 x 24px gaps, which with its 2 x 64px padding is exactly 1920. Every packaged
// shell IS that panel; a browser window is not.
//
// So the canvas is what gets fitted, by the smaller of the two ratios. The two
// ways to get that wrong are both real regressions this file guards:
//
//   - Fitting WIDTH only (fill, no surround) was tried. At any window shorter
//     than 16:9 the browse screen no longer has 1080 logical px of height, and
//     the grid's clip box - which bleeds 32px for focus rings - rides up over
//     the filter chips.
//   - Taking the larger ratio overflows the canvas: a rail's last poster is
//     clipped, the right gutter is gone, and the grid's 8th column is off the
//     edge.
//
// The surround it costs is painted in the app background, so it reads as the
// frame of the picture rather than as a bug. (The desktop shell's stage makes
// the one exception, going transparent where mpv renders behind the web view;
// there is nothing behind a browser, so this one always paints.)

import { beforeEach, describe, expect, it } from 'vitest';
import { installStage } from './stage';

const STAGE_W = 1920;
const STAGE_H = 1080;

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
});

describe('fitting the canvas', () => {
  it('is 1:1 on a 1080p window', () => {
    installStage();
    expect(scale()).toBe(1);
  });

  it('fits a smaller window', () => {
    resizeTo(1280, 720);
    installStage();
    expect(scale()).toBeCloseTo(1280 / STAGE_W, 6);
  });

  it('takes the HEIGHT ratio on a window wider than 16:9', () => {
    resizeTo(2560, 1080);
    installStage();
    // Fitting the width instead is what pushed the grid's clip box up over the
    // filter chips.
    expect(scale()).toBeCloseTo(1, 6);
  });

  it('takes the WIDTH ratio on a window taller than 16:9', () => {
    resizeTo(1280, 1440);
    installStage();
    expect(scale()).toBeCloseTo(1280 / STAGE_W, 6);
  });

  it('never lets the canvas overflow the window', () => {
    for (const [w, h] of [
      [1024, 768],
      [1280, 720],
      [1440, 900],
      [1920, 1080],
      [2560, 1080],
      [3440, 1440],
      [600, 900],
    ] as Array<[number, number]>) {
      document.head.innerHTML = '';
      resizeTo(w, h);
      installStage();
      // A rail's last poster clipped, the right gutter gone, the grid's 8th
      // column off the edge - all the same overflow.
      expect(STAGE_W * scale()).toBeLessThanOrEqual(w + 0.001);
      expect(STAGE_H * scale()).toBeLessThanOrEqual(h + 0.001);
    }
  });

  it('always keeps a full 1080 logical px of height', () => {
    // The browse screen's header, chips, grid and hint bar are sized for 1080.
    for (const [w, h] of [
      [2560, 1080],
      [3440, 1440],
      [1280, 720],
    ] as Array<[number, number]>) {
      document.head.innerHTML = '';
      resizeTo(w, h);
      installStage();
      expect(STAGE_H * scale()).toBeLessThanOrEqual(h + 0.001);
      expect(scale()).toBeGreaterThan(0);
    }
  });

  it('refits when the window is resized', () => {
    installStage();
    resizeTo(960, 540);
    window.dispatchEvent(new Event('resize'));
    expect(scale()).toBeCloseTo(0.5, 6);
  });
});

describe('the stage box', () => {
  it('renders at the authored size and scales from the centre', () => {
    installStage();
    expect(css()).toContain(`width: ${STAGE_W}px`);
    expect(css()).toContain(`height: ${STAGE_H}px`);
    // Symmetric letterboxing: a corner origin puts the whole surround on two
    // sides.
    expect(css()).toContain('transform-origin: center center');
  });

  it('makes #root the containing block for the app’s fixed layers', () => {
    installStage();
    // Home, player and detail are `position: fixed`; without the transform they
    // fill the WINDOW and escape the letterbox.
    expect(css()).toMatch(/#root\s*\{[^}]*position: fixed/);
    expect(css()).toContain('scale(var(--kroma-stage-scale, 1))');
  });

  it('paints the surround, since nothing renders behind a browser', () => {
    installStage();
    // The desktop shell goes transparent where mpv is behind the web view; here
    // an unpainted bar is just an unpainted bar.
    expect(css()).toContain('var(--kroma-bg, #0a0a0c)');
    expect(css()).not.toContain('background: transparent');
  });

  it('stops the page itself scrolling', () => {
    installStage();
    expect(css()).toMatch(/html, body \{[^}]*overflow: hidden/);
  });
});
