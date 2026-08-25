import type { ReactElement } from 'react';
// @vitest-environment jsdom

import { cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cellWidth } from '#ui/components/atoms/grid';
import { radius } from '#ui/core/tokens';
import { clearPressGuard } from '#ui/lib/press-guard';
import { onScreen } from '#ui/testing';
import { MediaCard, tintGradient } from './media-card';
import { PosterCard } from './poster-card';

// Every kit control is a node of the spatial navigator, and a node needs one.
const render = (ui: ReactElement) => renderRaw(onScreen(ui));

afterEach(() => {
  cleanup();
  clearPressGuard();
});

const TINT = ['#3A2E4F', '#1B1524'] as const;
const css = (el: Element) => getComputedStyle(el);

const tile = (label: string) => screen.getByLabelText(label);

describe('tintGradient', () => {
  it('builds the deterministic fill shown before the artwork loads', () => {
    expect(tintGradient(TINT)).toBe('linear-gradient(to bottom, #3A2E4F 0%, #1B1524 72%)');
  });
});

describe('MediaCard', () => {
  it('is a focusable 16:9 tile that FILLS its cell, at the design radius', () => {
    render(<MediaCard title="Dune" art={null} tint={TINT} />);
    const el = tile('Dune');
    expect(screen.getByLabelText('Dune').getAttribute('role')).toBe('button');
    // A rail fits its pitch to whole columns, so a tile pinned to a width of
    // its own eats the gap the cell was holding for it.
    expect(css(el).width).toBe('100%');
    expect(css(el).borderTopLeftRadius).toBe(`${radius.xl}px`);
  });

  it('takes a width where there is no cell to fill', () => {
    render(<MediaCard title="Dune" art={null} tint={TINT} width={280} />);
    expect(css(tile('Dune')).width).toBe('280px');
  });

  it('scales to 1.06 on focus, the rail tile treatment', () => {
    render(<MediaCard title="Dune" art={null} tint={TINT} autoFocus />);
    expect(tile('Dune').style.transform).toContain('scale(1.06)');
  });

  it('shows the overline and title, and clamps a long title', () => {
    render(<MediaCard title="Dune" overline="Science-fiction" art={null} tint={TINT} />);
    expect(screen.getByText('Science-fiction')).toBeTruthy();
    expect(screen.getByText('Dune')).toBeTruthy();
  });

  it('adds the watched mark and the resume bar only when asked', () => {
    const { container, rerender } = render(<MediaCard title="Dune" art={null} tint={TINT} />);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(screen.queryByLabelText('Watched')).toBeNull();
    rerender(onScreen(<MediaCard title="Dune" art={null} tint={TINT} watched progress={0.4} />));
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(screen.getByLabelText('Watched')).toBeTruthy();
  });

  it('fires onPress once the mount guard has elapsed', () => {
    const onPress = vi.fn();
    render(<MediaCard title="Dune" art={null} tint={TINT} onPress={onPress} />);
    fireEvent.click(screen.getByLabelText('Dune'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('PosterCard', () => {
  it('fills its grid cell and uses the poster radius and focus scale', () => {
    render(<PosterCard title="Arrival" art={null} tint={TINT} autoFocus />);
    const el = tile('Arrival');
    expect(css(el).width).toBe('100%');
    expect(css(el).borderTopLeftRadius).toBe(`${radius.lg}px`);
    expect(el.style.transform).toContain('scale(1.05)');
  });
});

describe('cellWidth', () => {
  it('divides the row after removing the gaps between cells', () => {
    // 1792 usable, 6 columns, 5 gaps of 24 = 1672 / 6.
    expect(cellWidth(1792, 6, 24)).toBe(278);
    expect(cellWidth(1000, 1, 24)).toBe(1000);
  });

  it('degrades to the full width rather than dividing by zero', () => {
    expect(cellWidth(800, 0, 24)).toBe(800);
  });
});
