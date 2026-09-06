import { StyleSheet } from 'react-native';
import { describe, expect, it } from 'vitest';
import { mergeStatic, staticStyle } from './register';
import { isStaticStyle } from './static-style';

type Renderer = ((styles: unknown) => [string, Record<string, unknown> | null]) & {
  getSheet(): { textContent: string };
};

const renderer = StyleSheet as unknown as Renderer;

describe('staticStyle', () => {
  it('resolves to the classes the runtime would mint, with nothing inline', () => {
    const style = staticStyle({ paddingTop: 8, opacity: 0.5 });
    const runtime = StyleSheet.create({ same: { paddingTop: 8, opacity: 0.5 } }).same;

    const [className, inline] = renderer([style]);

    expect(className).toBe(renderer([runtime])[0]);
    expect(inline).toBeNull();
    expect(Object.isFrozen(style)).toBe(true);
    expect(isStaticStyle(style)).toBe(true);
  });

  it('inserts none of its rules, the build having written them', () => {
    const before = renderer.getSheet().textContent;

    staticStyle({ marginTop: 7, opacity: 0.7 });

    expect(renderer.getSheet().textContent).toBe(before);
    StyleSheet.create({ probe: { marginTop: 7 } });
    expect(renderer.getSheet().textContent).not.toBe(before);
  });

  it('merges per property with a plain style beside it, the later one winning', () => {
    const style = staticStyle({ paddingTop: 8, opacity: 0.5 });

    const [className, inline] = renderer([style, { opacity: 1 }]);

    expect(className).toBe(renderer([StyleSheet.create({ p: { paddingTop: 8 } }).p])[0]);
    expect(inline).toEqual({ opacity: 1 });
  });

  it('reads back as the longhands it is', () => {
    const style = staticStyle({ paddingTop: 8, resizeMode: 'cover' });

    expect(StyleSheet.flatten([style, { width: 10 }])).toEqual({
      paddingTop: 8,
      resizeMode: 'cover',
      width: 10,
    });
  });
});

describe('mergeStatic', () => {
  it('layers the longhands, last wins per property, and stays static', () => {
    const base = staticStyle({ paddingTop: 8, opacity: 0.5 });
    const over = staticStyle({ opacity: 1 });

    const merged = mergeStatic([base, over]);

    expect({ ...merged }).toEqual({ paddingTop: 8, opacity: 1 });
    expect(isStaticStyle(merged)).toBe(true);
    expect(Object.isFrozen(merged)).toBe(true);
  });

  it('refuses a layer the build did not compile', () => {
    const base = staticStyle({ paddingTop: 8 });

    expect(() => mergeStatic([base, { paddingTop: 4 }])).toThrow(/did not compile/);
  });
});

describe('a property stated per breakpoint, compiled', () => {
  const cascade = () => staticStyle({ paddingLeft: 'var(--kaBcDeF,8px)' });

  it('is replaced whole by a later layer that states the property', () => {
    const flat = staticStyle({ paddingLeft: 20 });

    const [className] = renderer([cascade(), flat]);

    expect(className).toBe(renderer([flat])[0]);
    expect({ ...mergeStatic([cascade(), flat]) }).toEqual({ paddingLeft: 20 });
  });

  it('replaces an earlier flat layer whole', () => {
    const responsive = cascade();

    const [className] = renderer([staticStyle({ paddingLeft: 20 }), responsive]);

    expect(className).toBe(renderer([responsive])[0]);
    expect({ ...mergeStatic([staticStyle({ paddingLeft: 20 }), responsive]) }).toEqual({
      paddingLeft: 'var(--kaBcDeF,8px)',
    });
  });
});
