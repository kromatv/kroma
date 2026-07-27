// @vitest-environment jsdom
//
// The page's scrolling policy, which is the whole of what <FocusScroll> decides:
// a row rests `offsetFromStart` below the top edge, and neither end of the
// content is ever scrolled past. The clamps are not cosmetic - the first one is
// what makes the home hero come back whole when the focus climbs out of the
// rails into it.

import { describe, expect, it } from 'vitest';
import { pageOffset } from './focus-scroll';

/** A 1080-tall stage over a page of six screenfuls. */
const page = { viewport: 1080, content: 6480 };

describe('pageOffset', () => {
  it('rests a row below the top edge by the offset', () => {
    expect(pageOffset({ top: 1400, offsetFromStart: 120, ...page })).toBe(1280);
  });

  it('shows the first row whole, offset or not', () => {
    // The home hero: a 691pt block at the very top of the page. Its buttons sit
    // near its bottom, and following THEM is what used to leave it cropped.
    expect(pageOffset({ top: 0, offsetFromStart: 120, ...page })).toBe(0);
  });

  it('never scrolls past the last screenful', () => {
    expect(pageOffset({ top: 6400, offsetFromStart: 120, ...page })).toBe(5400);
  });

  it('does not scroll a page that fits', () => {
    expect(pageOffset({ top: 700, offsetFromStart: 120, viewport: 1080, content: 900 })).toBe(0);
  });
});
