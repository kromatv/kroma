// @vitest-environment jsdom
//
// A translucent glyph, and where its alpha ends up.
//
// The bug this guards: a glyph is several stroked paths, so a translucent STROKE
// composites once per path and every crossing (`volume-off`'s slash over its
// speaker) comes out brighter than the rest of the icon. The fix is that the
// paths draw opaque and the finished glyph is faded once, so what the tests
// below check is not a colour but WHERE the alpha is.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Icon } from '#ui/components/atoms/icon';
import { DEFAULT_ICON_SIZE, resolveIcon, splitAlpha } from './glyph';
import { colors } from './tokens';

afterEach(cleanup);

/** The rendered glyph, or a failure that names what is missing rather than a
 *  `null` dereference three lines later. */
function svgIn(container: HTMLElement): SVGElement {
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('no <svg> was rendered');
  return svg;
}

function parentOf(el: Element): HTMLElement {
  const parent = el.parentElement;
  if (!parent) throw new Error('the glyph has no parent element');
  return parent;
}

describe('splitAlpha', () => {
  it('leaves an opaque colour exactly as it was', () => {
    expect(splitAlpha('#F4B642')).toEqual({ color: '#F4B642', opacity: 1 });
    expect(splitAlpha('rgb(10, 10, 12)')).toEqual({ color: 'rgb(10, 10, 12)', opacity: 1 });
  });

  it('lifts the alpha out of an rgba token', () => {
    expect(splitAlpha(colors.textDim)).toEqual({ color: 'rgb(244, 243, 240)', opacity: 0.45 });
    expect(splitAlpha(colors.textMuted)).toEqual({ color: 'rgb(244, 243, 240)', opacity: 0.62 });
  });

  it('reads the space-slash spelling and a percentage', () => {
    expect(splitAlpha('rgb(244 243 240 / 0.45)')).toEqual({
      color: 'rgb(244, 243, 240)',
      opacity: 0.45,
    });
    expect(splitAlpha('rgba(244, 243, 240, 45%)')).toEqual({
      color: 'rgb(244, 243, 240)',
      opacity: 0.45,
    });
  });

  it('reads the alpha channel of a hex colour, long and short', () => {
    expect(splitAlpha('#F4F3F080')).toEqual({ color: '#F4F3F0', opacity: 128 / 255 });
    expect(splitAlpha('#FFF8')).toEqual({ color: '#FFF', opacity: 8 / 15 });
  });

  it('hands back anything it does not recognise, rather than guessing', () => {
    // A caller's own string has to keep working: an unparsed colour is passed
    // through to the glyph, which is where the platform parses it anyway.
    expect(splitAlpha('white')).toEqual({ color: 'white', opacity: 1 });
    expect(splitAlpha('rgba(1, 2, 3, nope)')).toEqual({ color: 'rgba(1, 2, 3, nope)', opacity: 1 });
  });
});

describe('resolveIcon', () => {
  it('resolves a token to an opaque paint plus its alpha', () => {
    expect(resolveIcon({ name: 'volume-off', color: 'textDim' })).toMatchObject({
      color: 'rgb(244, 243, 240)',
      opacity: 0.45,
      size: DEFAULT_ICON_SIZE,
    });
  });

  it('leaves an opaque token at full opacity, so nothing wraps it', () => {
    expect(resolveIcon({ name: 'player-play', color: 'accent' })).toMatchObject({
      color: colors.accent,
      opacity: 1,
    });
  });
});

describe('<Icon>', () => {
  it('strokes opaque and fades the whole glyph', () => {
    const { container } = render(<Icon name="volume-off" color="textDim" />);
    const svg = svgIn(container);
    expect(svg.getAttribute('stroke')).toBe('rgb(244, 243, 240)');
    // The alpha is on the element ABOVE the paths, which is what makes the
    // crossings inside the glyph invisible.
    expect(parentOf(svg).style.opacity).toBe('0.45');
  });

  it('draws an opaque glyph with no wrapper at all', () => {
    const { container } = render(<Icon name="player-play" color="accent" />);
    const svg = svgIn(container);
    expect(svg.getAttribute('stroke')).toBe(colors.accent);
    expect(parentOf(svg).style.opacity).toBe('');
  });
});
