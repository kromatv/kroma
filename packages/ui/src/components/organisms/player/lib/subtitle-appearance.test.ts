import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUB_APPEARANCE,
  migrateAppearance,
  SUB_COLORS,
  type SubtitleAppearance,
  subtitleStyle,
  subtitleWindowStyle,
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

  // Not a design choice: CEA-708 names these eight, and an "App UI" caption
  // declaration is graded against offering all of them.
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
    // The colour carries the text opacity (see below), so it comes back rgba().
    expect(subtitleStyle(base({ color: '#FFFF00' })).color).toBe('rgba(255, 255, 0, 1)');
  });

  it('renders small capitals as a variant rather than a family', () => {
    expect(subtitleStyle(base({ font: 'smallCaps' })).fontVariant).toEqual(['small-caps']);
  });

  // Text opacity rides in the COLOUR, not as node opacity: the same node carries
  // the background box, so dimming the node would dim a background the viewer set
  // to 100% - and would leave the window, a separate View, undimmed. Each of
  // CEA-708's three layers owns its own opacity.
  it('folds text opacity into the colour, clamped into [0.2, 1]', () => {
    const at = (opacity: number) => subtitleStyle(base({ color: '#FFFFFF', opacity })).color;
    expect(at(100)).toBe('rgba(255, 255, 255, 1)');
    expect(at(50)).toBe('rgba(255, 255, 255, 0.5)');
    expect(at(0)).toBe('rgba(255, 255, 255, 0.2)'); // floor
    expect(at(500)).toBe('rgba(255, 255, 255, 1)'); // ceiling
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

  // The edge treatment is the one piece that differs per platform: the web can
  // spell a four-way stroke out as four text shadows, React Native supports a
  // single shadow. These assertions run against the WEB implementation, which is
  // what the test runner resolves (see vitest's resolve.extensions).
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

  // Raised and depressed are the same stroke pointing opposite ways - that is
  // the whole difference between them, so assert the sign.
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
    // The edge still applies - background and edge are separate layers now.
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
// stored value naming options that no longer exist. Losing their choice - or
// worse, their background - on upgrade is what this guards.
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
