// Both halves of the CSS-feature bridge are pinned together: they only work
// while they agree on which helpers are real and which are deliberate no-ops.

import { describe, expect, it, vi } from 'vitest';
import * as native from './css';
import * as web from './css.web';

describe('the native half', () => {
  it('writes the experimental_ prefix React Native needs', () => {
    expect(native.gradient('linear-gradient(158deg, #a 0%, #b 72%)')).toEqual({
      experimental_backgroundImage: 'linear-gradient(158deg, #a 0%, #b 72%)',
    });
    expect(native.bgPosition('50% 28%')).toEqual({ experimental_backgroundPosition: '50% 28%' });
    expect(native.bgSize('cover')).toEqual({ experimental_backgroundSize: 'cover' });
  });

  it('returns nothing for the two features native cannot express', () => {
    // Empty, not undefined: the result is spread into a style array.
    expect(native.maskImage('linear-gradient(to right, transparent, #000 32px)')).toEqual({});
    expect(native.backdropBlur(12)).toEqual({});
    expect(native.fieldSizing()).toEqual({});
  });

  it('promotes nothing: the OS compositor already decides layers', () => {
    expect(native.promote()).toEqual({});
  });
});

describe('the web half', () => {
  it('writes the plain CSS names react-native-web passes through', () => {
    expect(web.gradient('linear-gradient(158deg, #a 0%, #b 72%)')).toEqual({
      backgroundImage: 'linear-gradient(158deg, #a 0%, #b 72%)',
    });
    expect(web.bgPosition('50% 28%')).toEqual({ backgroundPosition: '50% 28%' });
    expect(web.bgSize('cover')).toEqual({ backgroundSize: 'cover' });
  });

  it('really masks, which is the half native cannot do', () => {
    expect(web.maskImage('linear-gradient(to right, transparent, #000 32px)')).toEqual({
      maskImage: 'linear-gradient(to right, transparent, #000 32px)',
    });
  });

  it('blurs with the -webkit- spelling alongside, for the 2019 TV WebKits', () => {
    // The unprefixed property alone does not land on the WebKits the Tizen and
    // webOS shells run.
    expect(web.backdropBlur(12)).toEqual({
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    });
  });

  it('promotes with translateZ(0) plus willChange', () => {
    expect(web.promote()).toEqual({ transform: 'translateZ(0)', willChange: 'transform' });
  });

  // A backdrop-filter is not paid once: it re-blurs whenever anything BEHIND it
  // changes, and a television composites that on the CPU. With the sign-in
  // artwork drifting behind every frosted control, a 2024 Samsung panel measured
  // 40fps with the blur and 60 without. The sets lose nothing they had, since
  // the 2019 WebKits ignore the property outright.
  it('gives a television no blur at all, at any strength', async () => {
    Object.assign(globalThis, { __KROMA_TV_TIER__: true });
    vi.resetModules();
    try {
      const tv = await import('./css.web');
      expect(tv.backdropBlur(12)).toEqual({});
      expect(tv.backdropBlur(1)).toEqual({});
      // Everything else the tier still gets.
      expect(tv.promote()).toEqual({ transform: 'translateZ(0)', willChange: 'transform' });
    } finally {
      Reflect.deleteProperty(globalThis, '__KROMA_TV_TIER__');
      vi.resetModules();
    }
  });
});

describe('the two halves together', () => {
  it('expose exactly the same helpers', () => {
    expect(Object.keys(web).sort()).toEqual(Object.keys(native).sort());
  });

  it('agree that a gradient is a real feature on both', () => {
    const css = 'linear-gradient(180deg, #000, #fff)';
    expect(Object.values(native.gradient(css))).toEqual([css]);
    expect(Object.values(web.gradient(css))).toEqual([css]);
  });

  it('agree that mask and blur are web-only', () => {
    expect(native.maskImage('x')).toEqual({});
    expect(native.backdropBlur(1)).toEqual({});
    expect(Object.keys(web.maskImage('x'))).toHaveLength(1);
    expect(Object.keys(web.backdropBlur(1))).toHaveLength(2);
  });
});
