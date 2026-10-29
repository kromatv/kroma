// @vitest-environment jsdom
//
// The 10-foot canvas, fitted inside a browser window.
//
// The shared TV UI is drawn in real pixels on a 1080-tall canvas. Every packaged
// shell IS that panel; a browser window is not, and below 1080 logical px of
// height the browse screen's header, filter chips, grid and hint bar stop
// fitting - so the HEIGHT is what the scale is taken from, always.
//
// The size is not fitted, it is HANDED OVER: the canvas is as wide and as tall
// as the window leaves at that scale, and the layout fills it. What this file
// guards is that the canvas covers the window exactly, with no bar on any side.
//
// The maths itself is `fitStage` (tested beside it); this is the browser
// half - the box, the custom properties, and the resize listener.

import { beforeEach, describe, expect, it } from 'vitest';
import { fitStage, installStage, MIN_STAGE_W, STAGE_H, STAGE_W } from './stage';

function resizeTo(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

const scale = () => Number(document.documentElement.style.getPropertyValue('--kroma-stage-scale'));
const width = () =>
  Number.parseFloat(document.documentElement.style.getPropertyValue('--kroma-stage-width'));
const height = () =>
  Number.parseFloat(document.documentElement.style.getPropertyValue('--kroma-stage-height'));

const css = () => document.head.querySelector('style')?.textContent ?? '';

beforeEach(() => {
  document.head.innerHTML = '';
  document.documentElement.style.cssText = '';
  resizeTo(STAGE_W, STAGE_H);
});

describe('fitting the canvas', () => {
  it('is the design canvas, 1:1, on a 1080p window', () => {
    installStage();
    expect(scale()).toBe(1);
    expect(width()).toBe(STAGE_W);
  });

  it('hands a window wider than 16:9 the extra width instead of a pillarbox', () => {
    resizeTo(2560, 1080);
    installStage();
    expect(scale()).toBeCloseTo(1, 6);
    expect(width()).toBe(2560);
  });

  it('scales a narrower window down instead of clipping its chrome', () => {
    resizeTo(1400, 900);
    installStage();
    expect(width()).toBe(MIN_STAGE_W);
    expect(scale()).toBeCloseTo(1400 / MIN_STAGE_W, 6);
  });

  it('hands a window taller than 16:9 the extra height instead of a letterbox', () => {
    resizeTo(1280, 800);
    installStage();
    expect(width()).toBe(MIN_STAGE_W);
    expect(height()).toBe(1200);
  });

  it('covers the window exactly', () => {
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
      // A rail's last poster clipped, the right gutter gone, the grid's last
      // column off the edge - all the same overflow.
      expect(Math.abs(width() * scale() - w)).toBeLessThanOrEqual(1);
      expect(Math.abs(height() * scale() - h)).toBeLessThanOrEqual(1);
    }
  });

  it('refits when the window is resized', () => {
    installStage();
    resizeTo(960, 540);
    window.dispatchEvent(new Event('resize'));
    const fit = fitStage(960, 540);
    expect(scale()).toBeCloseTo(fit.scale, 6);
    expect(width()).toBe(fit.width);
    expect(height()).toBe(fit.height);
  });
});

describe('the stage box', () => {
  it('is as large as the fit says, and scales from the centre', () => {
    installStage();
    expect(css()).toContain('height: var(--kroma-stage-height');
    expect(css()).toContain('width: var(--kroma-stage-width');
    // Symmetric surround: a corner origin puts all of it on two sides.
    expect(css()).toContain('transform-origin: center center');
  });

  it('falls back to the design size before the first fit is written', () => {
    installStage();
    expect(css()).toContain(`var(--kroma-stage-width, ${STAGE_W}px)`);
    expect(css()).toContain(`var(--kroma-stage-height, ${STAGE_H}px)`);
  });

  it('makes #root the containing block for the app’s fixed layers', () => {
    installStage();
    // Home, player and detail are `position: fixed`; without the transform they
    // fill the WINDOW and escape the stage.
    expect(css()).toContain('scale(var(--kroma-stage-scale, 1))');
  });

  it('paints the page, since nothing renders behind a browser', () => {
    installStage();
    expect(css()).toContain('var(--kroma-bg, #0a0a0c)');
    expect(css()).not.toContain('background: transparent');
  });

  it('stops the page itself scrolling', () => {
    installStage();
    expect(css()).toMatch(/html, body \{[^}]*overflow: hidden/);
  });
});
