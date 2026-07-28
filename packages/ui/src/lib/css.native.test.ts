// The two halves of the CSS-feature bridge.
//
// Both are declared together on purpose. The whole point of this pair is that a
// gradient stays ONE css string in ONE source file instead of a css value on
// the web and a <LinearGradient> component on native, and that only works while
// the two halves agree about which helpers are real and which are deliberate
// no-ops. A helper that silently gains a native implementation on one side, or
// loses one on the other, is exactly the drift these pin.
//
// The asymmetry is intentional and worth stating: mask and blur have no React
// Native spelling at any prefix - masking means a second off-screen view tree,
// blurring means a platform blur view the kit stays free of - so those two
// return nothing on native and a caller needing a masked edge there provides
// its own answer (see virtual-rail, which paints the page colour over the row).

import { describe, expect, it } from 'vitest';
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
    // Empty, not undefined: the result is spread into a style array, so it has
    // to be a style object either way.
    expect(native.maskImage('linear-gradient(to right, transparent, #000 32px)')).toEqual({});
    expect(native.backdropBlur(12)).toEqual({});
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
    // webOS shells run, so both have to be written.
    expect(web.backdropBlur(12)).toEqual({
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    });
  });

  it('promotes with translateZ(0) plus willChange', () => {
    // translateZ(0) is the portable "own texture"; willChange keeps the layer
    // alive between animations rather than paying to rebuild it.
    expect(web.promote()).toEqual({ transform: 'translateZ(0)', willChange: 'transform' });
  });
});

describe('the two halves together', () => {
  it('expose exactly the same helpers', () => {
    // A helper on one side and not the other is a crash on whichever platform
    // is missing it, at the call site of a component that looks portable.
    expect(Object.keys(web).sort()).toEqual(Object.keys(native).sort());
  });

  it('agree that a gradient is a real feature on both', () => {
    const css = 'linear-gradient(180deg, #000, #fff)';
    // Different property NAMES, same single source string - which is the entire
    // reason this pair exists.
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
