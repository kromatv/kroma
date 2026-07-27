import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUB_APPEARANCE,
  SUB_COLORS,
  type SubtitleAppearance,
  subtitleStyle,
} from './subtitle-appearance';

const base = (over: Partial<SubtitleAppearance> = {}): SubtitleAppearance => ({
  ...DEFAULT_SUB_APPEARANCE,
  ...over,
});

describe('subtitle appearance constants', () => {
  it('defaults to a readable white shadowed 100% md style', () => {
    expect(DEFAULT_SUB_APPEARANCE).toEqual({
      size: 'md',
      color: '#FFFFFF',
      edge: 'shadow',
      font: 'sans',
      opacity: 100,
      bgOpacity: 75,
    });
  });

  it('exposes the five-swatch palette', () => {
    expect(SUB_COLORS).toHaveLength(5);
    expect(SUB_COLORS[0]).toBe('#FFFFFF');
  });
});

describe('subtitleStyle', () => {
  it('maps each size to its pixel value', () => {
    expect(subtitleStyle(base({ size: 'sm' })).fontSize).toBe(26);
    expect(subtitleStyle(base({ size: 'md' })).fontSize).toBe(36);
    expect(subtitleStyle(base({ size: 'lg' })).fontSize).toBe(48);
    expect(subtitleStyle(base({ size: 'xl' })).fontSize).toBe(62);
  });

  it('maps each font to a stack, and passes the color through', () => {
    expect(String(subtitleStyle(base({ font: 'sans' })).fontFamily)).toContain('Hanken Grotesk');
    expect(String(subtitleStyle(base({ font: 'serif' })).fontFamily)).toContain('Georgia');
    expect(String(subtitleStyle(base({ font: 'mono' })).fontFamily)).toContain('SF Mono');
    expect(subtitleStyle(base({ color: '#F5E050' })).color).toBe('#F5E050');
  });

  it('clamps opacity into [0.2, 1]', () => {
    expect(subtitleStyle(base({ opacity: 100 })).opacity).toBe(1);
    expect(subtitleStyle(base({ opacity: 50 })).opacity).toBe(0.5);
    expect(subtitleStyle(base({ opacity: 0 })).opacity).toBe(0.2); // floor
    expect(subtitleStyle(base({ opacity: 500 })).opacity).toBe(1); // ceiling
  });

  // The edge treatment is the one piece that differs per platform: the web can
  // spell a four-way outline out as four text shadows, React Native supports a
  // single shadow. These assertions run against the WEB implementation, which is
  // what the test runner resolves (see vitest's resolve.extensions).
  it('shadow edge sets a text shadow and no padding or background', () => {
    const css = subtitleStyle(base({ edge: 'shadow' })) as Record<string, unknown>;
    expect(String(css.textShadow)).toContain('rgba(0,0,0,.92)');
    expect(css.paddingHorizontal).toBeUndefined();
    expect(css.backgroundColor).toBeUndefined();
  });

  it('outline edge renders a four-corner stroke', () => {
    const css = subtitleStyle(base({ edge: 'outline' })) as Record<string, unknown>;
    expect(String(css.textShadow)).toContain('-1.5px -1.5px 0 #000');
  });

  it('box edge applies padding and a bgOpacity-scaled background, no shadow', () => {
    const css = subtitleStyle(base({ edge: 'box', bgOpacity: 50 })) as Record<string, unknown>;
    expect(css.paddingVertical).toBe(4);
    expect(css.paddingHorizontal).toBe(16);
    expect(css.backgroundColor).toBe('rgba(0, 0, 0, 0.5)');
    expect(css.textShadow).toBeUndefined();
  });

  it('clamps the box background opacity into [0, 1]', () => {
    const at = (bgOpacity: number) =>
      (subtitleStyle(base({ edge: 'box', bgOpacity })) as Record<string, unknown>).backgroundColor;
    expect(at(250)).toBe('rgba(0, 0, 0, 1)');
    expect(at(-10)).toBe('rgba(0, 0, 0, 0)');
  });

  it('none edge has neither shadow nor background', () => {
    const css = subtitleStyle(base({ edge: 'none' })) as Record<string, unknown>;
    expect(css.textShadow).toBeUndefined();
    expect(css.backgroundColor).toBeUndefined();
  });
});
