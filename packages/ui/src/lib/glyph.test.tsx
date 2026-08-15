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
import { colors } from '#ui/core/tokens';
import { splitAlpha } from '#ui/core/tokens/colors';
import { DEFAULT_ICON_SIZE, resolveIcon } from './glyph';

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
    expect(splitAlpha(colors.textDim)).toEqual({ color: 'rgb(244, 243, 240)', opacity: 0.48 });
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
      color: 'var(--kroma-text-dim-opaque)',
      opacity: 'var(--kroma-text-dim-alpha)',
      size: DEFAULT_ICON_SIZE,
    });
  });

  it('takes the alpha the caller wrote, over the base token', () => {
    expect(resolveIcon({ name: 'player-play', color: 'accent/45' })).toMatchObject({
      color: 'var(--kroma-accent)',
      opacity: 0.45,
    });
  });

  it('leaves an opaque token at full opacity, so nothing wraps it', () => {
    expect(resolveIcon({ name: 'player-play', color: 'accent' })).toMatchObject({
      color: 'var(--kroma-accent)',
      opacity: 1,
    });
  });

  it('reads a faded token at its own step as the single property the build emits', () => {
    expect(resolveIcon({ name: 'volume-off', color: 'textDim/40' })).toMatchObject({
      color: 'var(--kroma-text-dim-40)',
      opacity: 1,
    });
  });

  it('mixes an alpha into a raw colour the cascade knows nothing about', () => {
    expect(resolveIcon({ name: 'player-play', color: '#F4B642/50' })).toMatchObject({
      color: 'rgb(244, 182, 66)',
      opacity: 0.5,
    });
  });

  it('parses a raw colour whose slash is not an alpha suffix', () => {
    expect(resolveIcon({ name: 'player-play', color: 'rgb(255 0 0 / 50%)' })).toMatchObject({
      color: 'rgb(255, 0, 0)',
      opacity: 0.5,
    });
  });

  it('paints body text when the caller names no colour', () => {
    expect(resolveIcon({ name: 'player-play' })).toMatchObject({
      color: 'var(--kroma-text)',
      opacity: 1,
    });
  });
});

describe('<Icon>', () => {
  it('strokes opaque and fades the whole glyph', () => {
    const { container } = render(<Icon name="volume-off" color="textDim" />);
    const svg = svgIn(container);
    expect(svg.getAttribute('stroke')).toBe('var(--kroma-text-dim-opaque)');
    // The alpha is on the svg ITSELF, above its paths, which is what makes the
    // crossings inside the glyph invisible. On this target that is the element
    // the glyph already had; the native file needs a wrapper for it, because
    // Tabler's React Native build would hand the alpha to every path.
    expect((svg as unknown as HTMLElement).style.opacity).toBe('var(--kroma-text-dim-alpha)');
  });

  it('draws a faded glyph without a wrapper element', () => {
    const { container } = render(<Icon name="volume-off" color="textDim" />);

    expect(parentOf(svgIn(container))).toBe(container);
  });

  it('fades without placing itself, so a well can still centre it', () => {
    const { container } = render(<Icon name="volume-off" color="textDim" />);

    expect((svgIn(container) as unknown as HTMLElement).style.alignSelf).toBe('');
  });

  it('draws an opaque glyph with no style at all', () => {
    const { container } = render(<Icon name="player-play" color="accent" />);
    const svg = svgIn(container);
    expect(svg.getAttribute('stroke')).toBe('var(--kroma-accent)');
    expect((svg as unknown as HTMLElement).style.opacity).toBe('');
  });
});
