// @vitest-environment jsdom
//
// How a restatement reaches a browser, and why it is a sheet: the ground switch
// is an attribute, so a theme written as inline properties would outrank it and
// pin every token it touched.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { applyTheme, createTheme, KROMA, KROMA_LIGHT, setTheme, themeVersion } from './theme';
import { applyMode } from './theme-mode';

const sheet = () => document.getElementById('kroma-theme')?.textContent ?? '';

// The token sheet, as a page always has it before a theme is applied: it is
// where the derived properties (the alpha steps) are declared, and so what a
// restatement reads to know which ones it has to carry.
beforeAll(() => {
  document.head.innerHTML =
    '<style>:root{--kroma-text:#FFF;--kroma-text-75:rgba(255,255,255,0.75)}</style>';
});

afterEach(() => {
  setTheme(KROMA);
  applyMode('system');
});

describe('publishing a theme', () => {
  it('writes only what the theme restated, never the tokens it left alone', () => {
    setTheme(createTheme({ colors: { accent: '#FF0000' } }));

    expect(sheet()).toContain('--kroma-accent:#FF0000');
    expect(sheet()).not.toContain('--kroma-bg');
  });

  it('leaves the root element alone, so no ground can be outranked', () => {
    setTheme(createTheme({ colors: { accent: '#FF0000' } }));

    expect(document.documentElement.style.getPropertyValue('--kroma-accent')).toBe('');
  });

  it('paints one theme in both grounds when it names only one', () => {
    setTheme(createTheme({ colors: { accent: '#FF0000' } }));

    expect(sheet()).toContain(':root,[data-theme="dark"]{--kroma-accent:#FF0000}');
    expect(sheet()).toContain('[data-theme="light"]{--kroma-accent:#FF0000}');
  });

  // The unstamped document - `system`, the default - is painted by a rule
  // carrying a `:not()`, so a plainer selector loses to it however late it
  // arrives. This is the block that made a theme reach a page nobody had
  // stamped a ground on.
  it('answers the system ground with the selector the token sheet uses for it', () => {
    setTheme(createTheme({ colors: { accent: '#FF0000' } }));

    expect(sheet()).toContain(
      '@media(prefers-color-scheme:light){:root:not([data-theme]){--kroma-accent:#FF0000}}',
    );
  });

  it('gives a ground-aware theme a block per ground', () => {
    const dark = createTheme({ colors: { bg: '#050807' } });
    const light = createTheme({ colors: { bg: '#F2F5F3' } });
    setTheme(dark, light);

    expect(sheet()).toContain(':root,[data-theme="dark"]{--kroma-bg:#050807}');
    expect(sheet()).toContain('[data-theme="light"]{--kroma-bg:#F2F5F3}');
    expect(sheet()).toContain('@media(prefers-color-scheme:light){:root:not([data-theme])');
  });

  it('hands a ground-aware theme back to the cascade, so a JS read follows too', () => {
    const dark = createTheme({ colors: { bg: '#050807' } });
    const light = createTheme({ colors: { bg: '#F2F5F3' } });
    setTheme(dark, light);

    expect(KROMA.colors.bg).toBe('var(--kroma-bg)');
    expect(dark.colors.bg).toBe('#050807');
    expect(sheet()).toContain('--kroma-bg');
  });

  it('keeps a lone theme literal, which is what pins KROMA_LIGHT on a browser', () => {
    setTheme(KROMA_LIGHT);

    expect(KROMA_LIGHT.colors.bg.startsWith('#')).toBe(true);
  });

  // A palette token is not one property: the build emits one per alpha step the
  // source asks for. A theme that restated `text` and stopped there left every
  // `text/75` holding the built-in ink, which is a label that vanishes rather
  // than a label in the wrong colour.
  it('carries a restated colour into the alpha steps derived from it', () => {
    setTheme(createTheme({ colors: { text: '#050807' } }));

    expect(sheet()).toContain('--kroma-text:#050807');
    expect(sheet()).toContain('--kroma-text-75:rgba(5, 8, 7, 0.75)');
  });

  // The whole point of applying through the cascade: a theme that restates
  // nothing but colour is a stylesheet write, and a version bump would buy one
  // remount of the tree in exchange for a picture that is already correct.
  it('applies a colour-only theme without bumping the version', () => {
    const before = themeVersion();

    applyTheme(createTheme({ colors: { accent: '#00FF00' } }));

    expect(sheet()).toContain('--kroma-accent:#00FF00');
    expect(themeVersion()).toBe(before);
  });

  it('bumps for a theme that moves what no property can carry', () => {
    const before = themeVersion();

    applyTheme(createTheme({ radius: { md: 0 } }));

    expect(themeVersion()).toBeGreaterThan(before);
  });

  it('takes the sheet away with the theme', () => {
    setTheme(createTheme({ colors: { accent: '#FF0000' } }));
    expect(sheet()).not.toBe('');

    setTheme(KROMA);

    expect(document.getElementById('kroma-theme')).toBeNull();
  });
});
