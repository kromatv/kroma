import type { ReactElement } from 'react';
// @vitest-environment jsdom
//
// The first screen piece moved onto the universal kit. It renders through
// react-native-web here exactly as it does in the Tizen / webOS bundles, and
// compiles to native views on Apple TV / Android TV from the same source.

import { clearPressGuard } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type GridCard, PosterGrid } from '#tv/features/catalog/home/PosterGrid';

/** Every kit control is a node of the spatial navigator, and a node needs a
 * navigator - the router gives every screen one. A test renders inside the same
 * scope so the tree it mounts is the tree the app mounts. */
const render = (ui: ReactElement) => renderRaw(onScreen(ui));

afterEach(() => {
  cleanup();
  clearPressGuard();
});

function cards(n: number, over: Partial<GridCard> = {}): GridCard[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    title: `Film ${i}`,
    poster: `/art/${i}.jpg`,
    colors: ['#3A2E4F', '#1B1524'] as [string, string],
    onClick: () => {},
    ...over,
  }));
}

describe('PosterGrid', () => {
  it('renders one focusable poster per card', () => {
    const { container } = render(<PosterGrid cards={cards(8)} />);
    expect(container.querySelectorAll('[role="button"]')).toHaveLength(8);
    expect(screen.getByLabelText('Film 0')).toBeTruthy();
  });

  // The point of virtualising: what a 2000-title library costs is what a
  // screenful costs, and it does not grow as the viewer walks down. It used to
  // render in chunks of 120 that were never released, so the screen got heavier
  // the further in you went - and a library is the screen people walk to the end
  // of. The exact window size is the list's business (a screenful plus the
  // overscan rows); what this pins is that it is BOUNDED, and far below the data.
  it('renders a bounded window, not the whole library', () => {
    const { container } = render(<PosterGrid cards={cards(500)} />);
    const mounted = container.querySelectorAll('[role="button"]').length;
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(100);
  });

  it('mounts no more for a huge library than for a small one', () => {
    const { container: small } = render(<PosterGrid cards={cards(200)} />);
    const smallCount = small.querySelectorAll('[role="button"]').length;
    cleanup();
    const { container: huge } = render(<PosterGrid cards={cards(2000)} />);
    expect(huge.querySelectorAll('[role="button"]')).toHaveLength(smallCount);
  });

  it('activates a tile on press', () => {
    const onClick = vi.fn();
    render(<PosterGrid cards={cards(1, { onClick })} />);
    fireEvent.click(screen.getByLabelText('Film 0'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('converts the percentage progress the card carries into a 0..1 bar', () => {
    const { container } = render(<PosterGrid cards={cards(1, { progress: 40 })} />);
    const fill = container.querySelector('[role="progressbar"] > *') as HTMLElement;
    expect(getComputedStyle(fill).width).toBe('40%');
  });

  it('lays the tiles out at the design column width', () => {
    const { container } = render(<PosterGrid cards={cards(3)} />);
    // 1792px of content, 8 columns, 24px gaps -> 203px tiles. A virtualised grid
    // lays its rows out from the item size it was given rather than from a cell
    // that stretches, so the tile itself carries the width.
    const tile = container.querySelector('[role="button"]') as HTMLElement;
    expect(getComputedStyle(tile).width).toBe('203px');
  });
});
