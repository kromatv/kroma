// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { Platform, StyleSheet } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import {
  boxStyle,
  createTheme,
  currentBreakpoint,
  declaredBreakpoints,
  KROMA,
  pinDesignWidth,
  setTheme,
  splitShorthand,
  styles,
  sv,
} from '#ui/core';
import { breakpoint, CANVAS, radius } from '#ui/core/tokens';

afterEach(() => {
  cleanup();
  pinDesignWidth();
  setTheme(KROMA);
});

const at = (width: number) => {
  pinDesignWidth(width);
  return width;
};

const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;

const css = (el: Element) => getComputedStyle(el);

const box = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe('the breakpoint a width lands on', () => {
  it('names one step per surface, ascending from a phone to the stage', () => {
    at(0);
    expect(currentBreakpoint()).toBe('base');
    at(599);
    expect(currentBreakpoint()).toBe('base');
    at(breakpoint.md);
    expect(currentBreakpoint()).toBe('md');
    at(breakpoint.lg);
    expect(currentBreakpoint()).toBe('lg');
    at(breakpoint.tv);
    expect(currentBreakpoint()).toBe('tv');
  });

  it('reads the stage canvas on a television, where the window is not the design', () => {
    Object.defineProperty(Platform, 'isTV', { value: true, configurable: true });
    try {
      pinDesignWidth();
      expect(currentBreakpoint()).toBe('tv');
      expect(breakpoint.tv).toBe(CANVAS.width);
    } finally {
      Reflect.deleteProperty(Platform, 'isTV');
      pinDesignWidth();
    }
  });
});

describe('the mobile-first cascade', () => {
  const px = { base: 16, md: 40, lg: 64 };

  it('holds `base` until the next breakpoint the value names', () => {
    expect(boxStyle({ px }, 0).paddingLeft).toBe(16);
    expect(boxStyle({ px }, 1).paddingLeft).toBe(40);
    expect(boxStyle({ px }, 2).paddingLeft).toBe(64);
  });

  it('inherits a missing middle step from below, never from above', () => {
    const gap = { base: 12, tv: 48 };
    expect(boxStyle({ gap }, 1).gap).toBe(12);
    expect(boxStyle({ gap }, 2).gap).toBe(12);
    expect(boxStyle({ gap }, 3).gap).toBe(48);
  });

  it('drops a value whose narrowest step is not reached yet', () => {
    expect(boxStyle({ mt: { md: 24 } as never }, 0).marginTop).toBeUndefined();
    expect(boxStyle({ mt: { md: 24 } as never }, 1).marginTop).toBe(24);
  });

  it('expands and flags per breakpoint, like any other value', () => {
    expect(boxStyle({ p: { base: 4, lg: 8 } }, 2).paddingTop).toBe(8);
    expect(boxStyle({ row: { base: false, md: true } }, 0).flexDirection).toBeUndefined();
    expect(boxStyle({ row: { base: false, md: true } }, 1).flexDirection).toBe('row');
  });

  it('leaves an object that names no breakpoint alone', () => {
    const opaque = { __brand: 'an Animated node' };
    expect(boxStyle({ w: opaque as never }, 3).width).toBe(opaque);
  });
});

describe('a token inside a breakpoint object', () => {
  it('resolves exactly as the flat form does', () => {
    const asked = boxStyle({ bg: 'surface2', radius: 'lg' });
    const fluid = boxStyle({ bg: { base: 'surface1', lg: 'surface2' }, radius: { base: 'lg' } }, 2);
    expect(fluid.backgroundColor).toBe(asked.backgroundColor);
    expect(fluid.borderRadius).toBe(asked.borderRadius);
  });

  it('follows a theme swap at every step', () => {
    const corner = { base: 'sm', lg: 'lg' } as const;
    expect(boxStyle({ radius: corner }, 2).borderRadius).toBe(radius.lg);
    setTheme(createTheme({ radius: { lg: 18 } }));
    expect(boxStyle({ radius: corner }, 2).borderRadius).toBe(18);
    expect(boxStyle({ radius: corner }, 0).borderRadius).toBe(radius.sm);
  });

  it('clamps a circle stated per breakpoint against the side stated with it', () => {
    const disc = boxStyle({ radius: 'circle', w: { base: 40, lg: 80 } }, 2);
    expect(disc.borderRadius).toBe(40);
  });
});

describe('the zero-cost path', () => {
  it('reports no breakpoints for a flat declaration', () => {
    expect(splitShorthand({ px: 16, row: true }).breakpoints).toBe(0);
    expect(declaredBreakpoints({ px: 16, gap: 8 })).toBe(0);
    expect(splitShorthand({ px: { base: 16, md: 40 } }).breakpoints).not.toBe(0);
  });

  it('keeps a flat recipe on one compiled form across every crossing', () => {
    const chip = sv({
      base: { row: true, px: 12 },
      variants: { tone: { plain: {}, loud: { bg: 'accent' } } },
      defaults: { tone: 'plain' },
    });
    at(0);
    const first = chip({ tone: 'loud' });
    at(breakpoint.tv);
    expect(chip({ tone: 'loud' })).toBe(first);
  });

  it('recompiles a responsive recipe once per step it names, and only there', () => {
    const rail = sv({ base: { px: { base: 16, lg: 64 } } });
    at(0);
    const narrow = rail().root;
    at(breakpoint.md);
    expect(rail().root).toBe(narrow);
    at(breakpoint.lg);
    const wide = rail().root;
    expect(wide).not.toBe(narrow);
    expect(flat(wide).paddingLeft).toBe(64);
    at(breakpoint.tv);
    expect(rail().root).toBe(wide);
  });

  it('keeps a flat `styles()` set on one resolution across every crossing', () => {
    const plain = styles({ row: { row: true, gap: 6 } });
    at(0);
    const first = plain.row;
    at(breakpoint.lg);
    expect(plain.row).toBe(first);
  });

  it('re-resolves a responsive `styles()` set at the step it names', () => {
    const fluid = styles({ page: { px: { base: 20, lg: 56 } } });
    at(0);
    expect(flat(fluid.page).paddingLeft).toBe(20);
    at(breakpoint.lg);
    expect(flat(fluid.page).paddingLeft).toBe(56);
  });
});

describe('<Box> and <Text> follow the width', () => {
  it('paints the step the surface is on', () => {
    at(0);
    const { container } = render(<Box px={{ base: 16, md: 40 }} />);
    expect(css(box(container)).paddingLeft).toBe('16px');
  });

  it('repaints when the surface crosses a breakpoint it names', () => {
    at(0);
    const { container } = render(<Box px={{ base: 16, md: 40 }} />);
    act(() => at(breakpoint.md));
    expect(css(box(container)).paddingLeft).toBe('40px');
  });

  it('leaves a flat box alone when the surface crosses', () => {
    at(0);
    const { container } = render(<Box px={16} />);
    act(() => at(breakpoint.tv));
    expect(css(box(container)).paddingLeft).toBe('16px');
  });

  it('keeps a flat box on one cached style however many steps it lived through', () => {
    at(0);
    const narrow = render(<Box px={16} />);
    const before = box(narrow.container).className;
    at(breakpoint.tv);
    const wide = render(<Box px={16} />);
    expect(box(wide.container).className).toBe(before);
  });

  it('lays a string out per breakpoint too', () => {
    at(breakpoint.lg);
    const { container } = render(<Text maxW={{ base: 320, lg: 640 }}>hello</Text>);
    expect(css(box(container)).maxWidth).toBe('640px');
  });
});

describe('the type surface', () => {
  it('rejects an unknown breakpoint and a nonsense value inside the object', () => {
    // @ts-expect-error `xl` is not a breakpoint
    expect(boxStyle({ px: { base: 16, xl: 40 } }, 0).paddingLeft).toBe(16);
    // @ts-expect-error a padding is not a boolean
    expect(boxStyle({ px: { base: true } }, 0).paddingLeft).toBe(true);
    // @ts-expect-error `base` is mandatory
    expect(boxStyle({ gap: { md: 8 } }, 1).gap).toBe(8);
  });
});
