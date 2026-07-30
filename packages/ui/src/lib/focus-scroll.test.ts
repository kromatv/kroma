// @vitest-environment jsdom
//
// <FocusScroll>'s whole policy: a row rests `offsetFromStart` below the top edge,
// and neither end of the content is ever scrolled past.

import { describe, expect, it } from 'vitest';
import { pageOffset } from './focus-scroll';

const page = { viewport: 1080, content: 6480 };

describe('pageOffset', () => {
  it('rests a row below the top edge by the offset', () => {
    expect(pageOffset({ top: 1400, offsetFromStart: 120, ...page })).toBe(1280);
  });

  it('shows the first row whole, offset or not', () => {
    expect(pageOffset({ top: 0, offsetFromStart: 120, ...page })).toBe(0);
  });

  it('never scrolls past the last screenful', () => {
    expect(pageOffset({ top: 6400, offsetFromStart: 120, ...page })).toBe(5400);
  });

  it('does not scroll a page that fits', () => {
    expect(pageOffset({ top: 700, offsetFromStart: 120, viewport: 1080, content: 900 })).toBe(0);
  });
});
