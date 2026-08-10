import { afterEach, describe, expect, it } from 'vitest';
import { sv } from './recipe';
import { createTheme, KROMA, onThemeChange, setTheme, themeVersion } from './theme';

afterEach(() => setTheme(KROMA));

describe('createTheme', () => {
  it('merges overrides over the base without touching it', () => {
    const ocean = createTheme({ colors: { accent: '#3FB6F2' } });
    expect(ocean.colors.accent).toBe('#3FB6F2');
    expect(ocean.colors.bg).toBe(KROMA.colors.bg);
    expect(KROMA.colors.accent).toBe('#F4B642');
  });

  it('re-derives what follows from other groups', () => {
    const ocean = createTheme({
      colors: { accent: '#3FB6F2' },
      fonts: { display: 'Clash Display' },
    });
    // The focus ring follows the accent; the roles follow the family they name.
    expect(ocean.ring.focus.outlineColor).toBe('#3FB6F2');
    expect(ocean.type.hero?.fontFamily).toBe('Clash Display');
    expect(ocean.type.body?.fontFamily).toBe(KROMA.fonts.ui);
  });

  it('merges nested groups per key rather than wholesale', () => {
    const slow = createTheme({ motion: { duration: { fast: 80 } } });
    expect(slow.motion.duration.fast).toBe(80);
    expect(slow.motion.duration.base).toBe(KROMA.motion.duration.base);
    expect(slow.motion.bezier.out).toEqual(KROMA.motion.bezier.out);
  });

  it('carries palette names the base never had', () => {
    const branded = createTheme({ colors: { brand: '#123456' } as never });
    expect((branded.colors as Record<string, string>).brand).toBe('#123456');
  });
});

describe('setTheme', () => {
  it('re-resolves a recipe against the new palette, then back', () => {
    const r = sv({ base: { bg: 'accent' } });
    expect(r().root).toMatchObject({ backgroundColor: '#F4B642' });
    setTheme(createTheme({ colors: { accent: '#3FB6F2' } }));
    expect(r().root).toMatchObject({ backgroundColor: '#3FB6F2' });
    setTheme(KROMA);
    expect(r().root).toMatchObject({ backgroundColor: '#F4B642' });
  });

  it('hands back fresh identities after a swap, so styleq recompiles', () => {
    const r = sv({ base: { bg: 'accent' } });
    const before = r();
    expect(r()).toBe(before);
    setTheme(createTheme({}));
    expect(r()).not.toBe(before);
  });

  it('bumps the version and notifies subscribers once per swap', () => {
    const before = themeVersion();
    let calls = 0;
    const off = onThemeChange(() => {
      calls += 1;
    });
    const theme = createTheme({});
    setTheme(theme);
    // The same theme again is a no-op, not a re-render of the app.
    setTheme(theme);
    off();
    expect(themeVersion()).toBe(before + 1);
    expect(calls).toBe(1);
  });
});
