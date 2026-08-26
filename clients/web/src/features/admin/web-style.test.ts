import { describe, expect, it } from 'vitest';
import {
  ADMIN_BAR_TOP,
  ADMIN_RAIL_WIDTH,
  ADMIN_SCROLLER,
  ADMIN_SCROLLER_CONTENT,
} from './web-style';

describe('the console frame', () => {
  it('scrolls the pages and nothing else, so the rail has nothing to be pinned to', () => {
    expect(ADMIN_SCROLLER.flex).toBe(1);
    expect(ADMIN_SCROLLER.minWidth).toBe(0);
    expect(ADMIN_SCROLLER_CONTENT.flexGrow).toBe(1);
  });

  it('states the rail width in points, not in a viewport unit', () => {
    expect(ADMIN_RAIL_WIDTH).toBeGreaterThan(0);
    expect(typeof ADMIN_RAIL_WIDTH).toBe('number');
  });

  it('clears the notch above the phone bar', () => {
    expect(String(ADMIN_BAR_TOP.paddingTop)).toContain('safe-area-inset-top');
  });
});
