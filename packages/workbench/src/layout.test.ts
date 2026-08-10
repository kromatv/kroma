import { describe, expect, it } from 'vitest';
import { BREAKPOINTS, layoutFor } from './layout';

describe('layoutFor', () => {
  it('keeps all three regions side by side on a desk', () => {
    const layout = layoutFor(1920, 1080);
    expect(layout.mode).toBe('wide');
    expect(layout.nav).toBe('column');
    expect(layout.panel).toBe('side');
  });

  it('docks the inspector below before the list becomes a drawer', () => {
    const medium = layoutFor(BREAKPOINTS.wide - 1, 900);
    expect(medium.mode).toBe('medium');
    expect(medium.nav).toBe('column');
    expect(medium.panel).toBe('below');

    const compact = layoutFor(BREAKPOINTS.medium - 1, 900);
    expect(compact.mode).toBe('compact');
    expect(compact.nav).toBe('drawer');
    expect(compact.panel).toBe('below');
  });

  it('switches mode exactly at each breakpoint, not one pixel either side', () => {
    expect(layoutFor(BREAKPOINTS.wide, 900).mode).toBe('wide');
    expect(layoutFor(BREAKPOINTS.medium, 900).mode).toBe('medium');
  });

  it('gives the drawer most of a phone, never the whole of it', () => {
    const layout = layoutFor(400, 800);
    expect(layout.navWidth).toBe(328);
    expect(layout.navWidth).toBeLessThan(400);
    expect(layoutFor(200, 800).navWidth).toBe(240);
  });

  it('clamps the nav column and the inspector on any window', () => {
    for (const width of [880, 1240, 1440, 2560, 5120]) {
      const layout = layoutFor(width, 1440);
      expect(layout.navWidth).toBeGreaterThanOrEqual(232);
      expect(layout.navWidth).toBeLessThanOrEqual(288);
      expect(layout.panelWidth).toBeGreaterThanOrEqual(320);
      expect(layout.panelWidth).toBeLessThanOrEqual(400);
    }
  });

  it('keeps the docked inspector to a third of the height, clamped both ways', () => {
    expect(layoutFor(1000, 900).panelHeight).toBe(306);
    expect(layoutFor(1000, 400).panelHeight).toBe(220);
    expect(layoutFor(1000, 2160).panelHeight).toBe(380);
  });

  it('tightens the gutter and the stage padding as the window narrows', () => {
    expect([layoutFor(1440, 900).gutter, layoutFor(1440, 900).stagePad]).toEqual([28, 32]);
    expect([layoutFor(1000, 900).gutter, layoutFor(1000, 900).stagePad]).toEqual([22, 32]);
    expect([layoutFor(500, 900).gutter, layoutFor(500, 900).stagePad]).toEqual([16, 16]);
  });

  it('assumes a desk for an unmeasured window rather than a very narrow phone', () => {
    const layout = layoutFor(0, 0);
    expect(layout.mode).toBe('wide');
    expect([layout.width, layout.height]).toEqual([1440, 900]);
  });
});
