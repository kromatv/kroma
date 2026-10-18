// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { KitProvider } from '#ui/configure';
import { pinDesignWidth } from '#ui/core';
import { breakpoint } from '#ui/core/tokens';
import {
  bySize,
  CONTROL,
  controlMetrics,
  controlRadius,
  edgeColor,
  fieldShell,
  NO_ZOOM_FONT_SIZE,
  useControlMetrics,
  useEntryDefaults,
  useEntryFontSize,
} from './field-shell';

afterEach(() => {
  pinDesignWidth();
});

describe('the shell defaults', () => {
  it('starts with handset density and the on-screen keyboard', () => {
    const { result } = renderHook(useEntryDefaults);
    expect(result.current).toEqual({ size: 'md', physicalKeyboard: false });
  });
  it('reads control metrics from its root and lets explicit size win', () => {
    const { result } = renderHook(() => [useControlMetrics(), useControlMetrics('sm')], {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(KitProvider, { config: { formFactor: 'tv' }, children }),
    });
    expect(result.current).toEqual([CONTROL.tv, CONTROL.sm]);
    expect(controlMetrics()).toBe(CONTROL.md);
  });
});

describe('the control table', () => {
  it('derives every height from its own border, padding and line', () => {
    for (const metrics of Object.values(CONTROL)) {
      expect(metrics.height).toBe(2 + metrics.py * 2 + metrics.line);
    }
  });

  it('builds one entry per size from the table rather than a transcription', () => {
    const built = bySize((metrics) => metrics.px);
    expect(built).toEqual({ sm: CONTROL.sm.px, md: CONTROL.md.px, tv: CONTROL.tv.px });
  });

  it('resolves a corner to the property a theme rewrites', () => {
    expect(controlRadius(CONTROL.sm)).toBe(`var(--radius-${CONTROL.sm.radius})`);
    expect(controlRadius(CONTROL.tv)).toBe(`var(--radius-${CONTROL.tv.radius})`);
  });
});

describe('fieldShell', () => {
  it('drops fill, corner and edge when the shell belongs to something else', () => {
    const flat = fieldShell(CONTROL.md, { flat: true, focused: true, invalid: true });
    expect(flat.box).toEqual({ radius: 0, bg: 'transparent', borderWidth: 0 });
    expect(flat.edge).toBeNull();
  });

  it('draws its own well when it owns the shell, and never a shadow', () => {
    const plain = fieldShell(CONTROL.md, { flat: false, focused: false, invalid: false });
    expect(plain.box).toMatchObject({ radius: CONTROL.md.radius, bg: CONTROL.md.bg });
    expect(plain.box).not.toHaveProperty('shadow');
  });

  it('adds the kit ring on focus, and only then', () => {
    const resting = fieldShell(CONTROL.md, { flat: false, focused: false, invalid: false });
    const focused = fieldShell(CONTROL.md, { flat: false, focused: true, invalid: false });
    expect(Object.keys(focused.edge ?? {}).length).toBeGreaterThan(
      Object.keys(resting.edge ?? {}).length,
    );
  });

  it('recolours the edge for invalid, which focus alone does not', () => {
    const invalid = fieldShell(CONTROL.md, { flat: false, focused: false, invalid: true });
    const focused = fieldShell(CONTROL.md, { flat: false, focused: true, invalid: false });
    expect(invalid.edge?.borderColor).toBe(edgeColor(false, true));
    expect(focused.edge?.borderColor).toBe(edgeColor(false, false));
    expect(invalid.edge?.borderColor).not.toBe(focused.edge?.borderColor);
  });
});

describe('the zoom floor', () => {
  const inkAt = (width: number, fontSize: number) => {
    pinDesignWidth(width);
    return renderHook(() => useEntryFontSize(fontSize)).result.current;
  };

  it('lifts a field under the floor to it on a handset, iOS Safari zooming below', () => {
    expect(inkAt(390, CONTROL.sm.fontSize)).toBe(NO_ZOOM_FONT_SIZE);
  });

  it('leaves a field already at or above the floor alone, at any width', () => {
    expect(inkAt(390, CONTROL.md.fontSize)).toBe(CONTROL.md.fontSize);
    expect(inkAt(390, CONTROL.tv.fontSize)).toBe(CONTROL.tv.fontSize);
  });

  it('stops guarding from the first step up, where no browser zooms', () => {
    expect(inkAt(breakpoint.md, CONTROL.sm.fontSize)).toBe(CONTROL.sm.fontSize);
    expect(inkAt(breakpoint.lg, CONTROL.sm.fontSize)).toBe(CONTROL.sm.fontSize);
  });
});
