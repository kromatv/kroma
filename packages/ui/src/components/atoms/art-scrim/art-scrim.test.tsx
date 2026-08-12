// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ArtScrim, type ArtScrimVariant, CARD_SCRIM, POSTER_SCRIM } from './art-scrim';

afterEach(cleanup);

// jsdom drops a gradient's direction keyword, so the stops are what identify a ramp.
const stops = (css: string) => css.replace(/^linear-gradient\((?:to [a-z]+, )?/, '');

function paint(variant?: ArtScrimVariant): CSSStyleDeclaration {
  const { container } = render(<ArtScrim variant={variant} radius="lg" />);
  return getComputedStyle(container.firstElementChild as HTMLElement);
}

describe('<ArtScrim>', () => {
  it('paints the ramp its variant names', () => {
    expect(stops(paint().backgroundImage)).toBe(stops(CARD_SCRIM));
    cleanup();
    expect(stops(paint('deep').backgroundImage)).toBe(stops(POSTER_SCRIM));
  });

  it('writes both ramps from palette alpha rather than from raw colour', () => {
    for (const ramp of [CARD_SCRIM, POSTER_SCRIM]) {
      expect(ramp).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(ramp.match(/rgba\(0, 0, 0, /g)?.length ?? 0).toBeGreaterThan(1);
    }
  });

  it('fills its tile and never catches a press meant for the tile under it', () => {
    const style = paint();
    expect(style.position).toBe('absolute');
    expect([style.top, style.right, style.bottom, style.left]).toEqual([
      '0px',
      '0px',
      '0px',
      '0px',
    ]);
    expect(style.pointerEvents).toBe('none');
  });

  it('rounds itself to the corner it was given, because the parent cannot clip it', () => {
    expect(paint().borderTopLeftRadius).toBe('13px');
  });
});
