import { describe, expect, it } from 'vitest';
import { globePalette, mix } from './palette';

describe('mix', () => {
  it('moves a colour part of the way toward another', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#e6e2da', '#0a0a0c', 0)).toBe('#e6e2da');
    expect(mix('#e6e2da', '#0a0a0c', 1)).toBe('#0a0a0c');
  });
});

describe('globePalette', () => {
  it('draws dark ink on a light ball and light ink on a dark one', () => {
    const light = globePalette('light');
    const dark = globePalette('dark');

    expect(light.dots.toLowerCase()).toBe('#16151a');
    expect(dark.dots.toLowerCase()).toBe('#f4f3f0');
    expect(light.sphere).not.toBe(dark.sphere);
  });

  it('shades the light ball darker than the deepest paper surface', () => {
    expect(globePalette('light').sphere < '#e6e2da').toBe(true);
  });
});
