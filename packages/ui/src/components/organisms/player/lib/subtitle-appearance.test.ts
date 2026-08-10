// @vitest-environment jsdom
import { setSessionStorage } from '@kroma/core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SUB_APPEARANCE,
  migrateAppearance,
  SUB_COLORS,
  type SubtitleAppearance,
  subtitleStyle,
  subtitleWindowStyle,
  useSubtitleAppearance,
  withOpacity,
} from './subtitle-appearance';

const base = (over: Partial<SubtitleAppearance> = {}): SubtitleAppearance => ({
  ...DEFAULT_SUB_APPEARANCE,
  ...over,
});

describe('subtitle appearance constants', () => {
  it('defaults to a readable white shadowed 100% md style, with no box or window', () => {
    expect(DEFAULT_SUB_APPEARANCE).toEqual({
      size: 'md',
      color: '#FFFFFF',
      edge: 'shadow',
      font: 'default',
      opacity: 100,
      bgColor: '#000000',
      bgOpacity: 0,
      windowColor: '#000000',
      windowOpacity: 0,
    });
  });

  // CEA-708 names these eight, and an "App UI" caption declaration is graded
  // against offering all of them.
  it('exposes the eight CEA-708 colours', () => {
    expect(SUB_COLORS).toHaveLength(8);
    expect(SUB_COLORS).toEqual([
      '#FFFFFF',
      '#000000',
      '#FF0000',
      '#00FF00',
      '#0000FF',
      '#FFFF00',
      '#FF00FF',
      '#00FFFF',
    ]);
  });
});

describe('subtitleStyle', () => {
  it('maps each size to its pixel value', () => {
    expect(subtitleStyle(base({ size: 'sm' })).fontSize).toBe(26);
    expect(subtitleStyle(base({ size: 'md' })).fontSize).toBe(36);
    expect(subtitleStyle(base({ size: 'lg' })).fontSize).toBe(48);
    expect(subtitleStyle(base({ size: 'xl' })).fontSize).toBe(62);
  });

  it('gives every CEA-708 font style a stack, and passes the colour through', () => {
    expect(String(subtitleStyle(base({ font: 'default' })).fontFamily)).toContain('Hanken Grotesk');
    expect(String(subtitleStyle(base({ font: 'propSerif' })).fontFamily)).toContain('Georgia');
    expect(String(subtitleStyle(base({ font: 'monoSerif' })).fontFamily)).toContain('Courier');
    expect(String(subtitleStyle(base({ font: 'monoSans' })).fontFamily)).toContain('SF Mono');
    expect(String(subtitleStyle(base({ font: 'propSans' })).fontFamily)).toContain('Arial');
    expect(String(subtitleStyle(base({ font: 'casual' })).fontFamily)).toContain('Comic Sans');
    expect(String(subtitleStyle(base({ font: 'cursive' })).fontFamily)).toContain('cursive');
    // The colour carries the text opacity, so it comes back rgba().
    expect(subtitleStyle(base({ color: '#FFFF00' })).color).toBe('rgba(255, 255, 0, 1)');
  });

  it('renders small capitals as a variant rather than a family', () => {
    expect(subtitleStyle(base({ font: 'smallCaps' })).fontVariant).toEqual(['small-caps']);
  });

  // Text opacity rides in the colour, not as node opacity: the same node carries
  // the background box, and each of CEA-708's three layers owns its own opacity.
  it('folds text opacity into the colour, clamped into [0.2, 1]', () => {
    const at = (opacity: number) => subtitleStyle(base({ color: '#FFFFFF', opacity })).color;
    expect(at(100)).toBe('rgba(255, 255, 255, 1)');
    expect(at(50)).toBe('rgba(255, 255, 255, 0.5)');
    expect(at(0)).toBe('rgba(255, 255, 255, 0.2)');
    expect(at(500)).toBe('rgba(255, 255, 255, 1)');
    expect(subtitleStyle(base()).opacity).toBeUndefined();
  });

  it('never dims the background along with the text', () => {
    const css = subtitleStyle(base({ opacity: 20, bgColor: '#000000', bgOpacity: 100 })) as Record<
      string,
      unknown
    >;
    expect(css.backgroundColor).toBe('rgba(0, 0, 0, 1)');
    expect(css.opacity).toBeUndefined();
  });

  // The edge treatment differs per platform (React Native supports one shadow,
  // the web four). These assertions run against the web implementation, which is
  // what the runner resolves (see vitest's resolve.extensions).
  it('shadow edge sets a text shadow and no padding or background', () => {
    const css = subtitleStyle(base({ edge: 'shadow' })) as Record<string, unknown>;
    expect(String(css.textShadow)).toContain('rgba(0,0,0,.92)');
    expect(css.paddingHorizontal).toBeUndefined();
    expect(css.backgroundColor).toBeUndefined();
  });

  it('uniform edge renders a four-corner stroke', () => {
    const css = subtitleStyle(base({ edge: 'uniform' })) as Record<string, unknown>;
    expect(String(css.textShadow)).toContain('-1.5px -1.5px 0 #000');
  });

  it('raised and depressed offset in opposite directions', () => {
    const raised = String(
      (subtitleStyle(base({ edge: 'raised' })) as Record<string, unknown>).textShadow,
    );
    const depressed = String(
      (subtitleStyle(base({ edge: 'depressed' })) as Record<string, unknown>).textShadow,
    );
    expect(raised).toContain('1px 1px 0 #000');
    expect(depressed).toContain('-1px -1px 0 #000');
    expect(raised).not.toBe(depressed);
  });

  it('none edge has neither shadow nor background', () => {
    const css = subtitleStyle(base({ edge: 'none' })) as Record<string, unknown>;
    expect(css.textShadow).toBeUndefined();
    expect(css.backgroundColor).toBeUndefined();
  });

  it('draws the background from its own colour and opacity, independent of the edge', () => {
    const css = subtitleStyle(
      base({ edge: 'shadow', bgColor: '#FF0000', bgOpacity: 50 }),
    ) as Record<string, unknown>;
    expect(css.backgroundColor).toBe('rgba(255, 0, 0, 0.5)');
    expect(css.paddingVertical).toBe(4);
    expect(css.paddingHorizontal).toBe(16);
    expect(String(css.textShadow)).toContain('rgba(0,0,0,.92)');
  });

  it('omits the background entirely at zero opacity', () => {
    const css = subtitleStyle(base({ bgOpacity: 0 })) as Record<string, unknown>;
    expect(css.backgroundColor).toBeUndefined();
    expect(css.paddingHorizontal).toBeUndefined();
  });
});

describe('subtitleWindowStyle', () => {
  it('is empty until the window has opacity', () => {
    expect(subtitleWindowStyle(base({ windowOpacity: 0 }))).toEqual({});
  });

  it('paints the window in its own colour', () => {
    const css = subtitleWindowStyle(base({ windowColor: '#0000FF', windowOpacity: 40 }));
    expect(css.backgroundColor).toBe('rgba(0, 0, 255, 0.4)');
  });
});

describe('withOpacity', () => {
  it('converts #RRGGBB + percent into rgba, clamped', () => {
    expect(withOpacity('#FFFFFF', 100)).toBe('rgba(255, 255, 255, 1)');
    expect(withOpacity('#00FF00', 0)).toBe('rgba(0, 255, 0, 0)');
    expect(withOpacity('#000000', 250)).toBe('rgba(0, 0, 0, 1)');
    expect(withOpacity('#000000', -10)).toBe('rgba(0, 0, 0, 0)');
  });

  it('accepts the three-digit form', () => {
    expect(withOpacity('#F00', 100)).toBe('rgba(255, 0, 0, 1)');
  });
});

// A viewer who set their captions before the renderer took on CEA-708 has a
// stored value naming options that no longer exist.
describe('migrateAppearance', () => {
  it('renames outline to uniform', () => {
    expect(migrateAppearance({ edge: 'outline' }).edge).toBe('uniform');
  });

  it('turns the old box edge into a real background layer, keeping its opacity', () => {
    const m = migrateAppearance({ edge: 'box', bgOpacity: 60 });
    expect(m.edge).toBe('none');
    expect(m.bgColor).toBe('#000000');
    expect(m.bgOpacity).toBe(60);
  });

  it('keeps the shipped 75% when a box stored no opacity of its own', () => {
    expect(migrateAppearance({ edge: 'box' }).bgOpacity).toBe(75);
  });

  it('does not invent a background for anyone who never had one', () => {
    expect(migrateAppearance({ edge: 'shadow', bgOpacity: 75 }).bgOpacity).toBe(0);
  });

  it('maps the three old font names onto CEA-708 styles', () => {
    expect(migrateAppearance({ font: 'sans' }).font).toBe('propSans');
    expect(migrateAppearance({ font: 'serif' }).font).toBe('propSerif');
    expect(migrateAppearance({ font: 'mono' }).font).toBe('monoSans');
  });

  // A colour outside SUB_COLORS cannot be re-selected: the swatch row highlights
  // nothing and one ◀▶ press jumps to whichever end `indexOf` -1 rounds to.
  it('maps the retired brand palette onto its CEA-708 neighbours', () => {
    expect(migrateAppearance({ color: '#F5E050' }).color).toBe('#FFFF00');
    expect(migrateAppearance({ color: '#6FA8FF' }).color).toBe('#00FFFF');
    expect(migrateAppearance({ color: '#F58CC0' }).color).toBe('#FF00FF');
    expect(migrateAppearance({ color: '#FFFFFF' }).color).toBe('#FFFFFF');
  });

  it('refuses a colour no build can select, including a non-string', () => {
    expect(migrateAppearance({ color: '#123456' }).color).toBe(DEFAULT_SUB_APPEARANCE.color);
    expect(migrateAppearance({ windowColor: 7 }).windowColor).toBe(
      DEFAULT_SUB_APPEARANCE.windowColor,
    );
  });

  it('falls back to the defaults for anything unrecognisable', () => {
    expect(migrateAppearance({ edge: 'wat', font: 'nope' })).toEqual(
      expect.objectContaining({ edge: 'shadow', font: 'default' }),
    );
    expect(migrateAppearance(null)).toEqual(DEFAULT_SUB_APPEARANCE);
    expect(migrateAppearance(undefined)).toEqual(DEFAULT_SUB_APPEARANCE);
  });

  it('passes a value already on the new model straight through', () => {
    const current = base({ edge: 'raised', font: 'cursive', bgColor: '#FF0000', bgOpacity: 30 });
    expect(migrateAppearance(current)).toEqual(current);
  });
});

const KEY = 'kroma.subtitleStyle';

function deviceStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  setSessionStorage({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  });
  return map;
}

afterEach(() => setSessionStorage(null));

describe('useSubtitleAppearance', () => {
  it('starts from the defaults, so a server render and the client agree', () => {
    const { result } = renderHook(() => useSubtitleAppearance());
    expect(result.current[0]).toEqual(DEFAULT_SUB_APPEARANCE);
  });

  it('hydrates a stored choice, migrating the names it was written under', () => {
    deviceStore({ [KEY]: JSON.stringify({ edge: 'outline', font: 'sans' }) });
    const { result } = renderHook(() => useSubtitleAppearance());
    expect(result.current[0]).toMatchObject({ edge: 'uniform', font: 'propSans' });
  });

  it('keeps the defaults when the stored value is not JSON at all', () => {
    deviceStore({ [KEY]: '{oops' });
    const { result } = renderHook(() => useSubtitleAppearance());
    expect(result.current[0]).toEqual(DEFAULT_SUB_APPEARANCE);
  });

  it('merges a partial change and writes the whole appearance back', () => {
    const map = deviceStore();
    const { result } = renderHook(() => useSubtitleAppearance());
    act(() => result.current[1]({ size: 'xl' }));
    expect(result.current[0]).toEqual({ ...DEFAULT_SUB_APPEARANCE, size: 'xl' });
    expect(JSON.parse(map.get(KEY) ?? '{}')).toEqual({ ...DEFAULT_SUB_APPEARANCE, size: 'xl' });
  });

  it('honours the change even when the device store refuses to keep it', () => {
    setSessionStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    });
    const { result } = renderHook(() => useSubtitleAppearance());
    act(() => result.current[1]({ size: 'sm' }));
    expect(result.current[0].size).toBe('sm');
  });
});
