// @vitest-environment jsdom
import type { KromaClient, MediaItem } from '@kroma/core';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TvClientProvider } from '#tv/app/router';
import { AmbientBackdrop, type CatalogEntry } from '#tv/features/catalog/home/AmbientBackdrop';

const client = {
  backdropFor: (item: MediaItem) => `http://s/${item.id}-back.jpg`,
} as unknown as KromaClient;

const noBackdrop = {
  backdropFor: () => null,
  posterFor: (item: MediaItem, width: number) => `http://s/${item.id}-poster.jpg?w=${width}`,
} as unknown as KromaClient;

const entry = (id: string): CatalogEntry => ({
  kind: 'movie',
  item: { id, title: id } as unknown as MediaItem,
});

const art = (root: HTMLElement) => root.querySelector('img:not([aria-hidden])');
const outgoing = (root: HTMLElement) => root.querySelector('img[aria-hidden="true"]');

function mount(id: string, served: KromaClient = client) {
  const screen = (next: string) => (
    <TvClientProvider client={served}>
      <AmbientBackdrop entry={entry(next)} />
    </TvClientProvider>
  );
  const { container, rerender } = render(screen(id));
  return { container, focus: (next: string) => rerender(screen(next)) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AmbientBackdrop', () => {
  it('shows the first selection at once', () => {
    const { container } = mount('a');

    expect(art(container)?.getAttribute('src')).toBe('http://s/a-back.jpg');
  });

  it('loads nothing while the selection is still walking', () => {
    const { container, focus } = mount('a');

    for (const id of ['b', 'c', 'd']) {
      focus(id);
      act(() => vi.advanceTimersByTime(120));
    }

    expect(art(container)?.getAttribute('src')).toBe('http://s/a-back.jpg');
  });

  it('follows the selection once it has settled, and skips what the walk passed', () => {
    const { container, focus } = mount('a');

    for (const id of ['b', 'c', 'd']) {
      focus(id);
      act(() => vi.advanceTimersByTime(120));
    }
    act(() => vi.advanceTimersByTime(400));

    expect(art(container)?.getAttribute('src')).toBe('http://s/d-back.jpg');
  });

  it('falls back to the poster asked for at full-screen size, not at a tile width', () => {
    const { container } = mount('a', noBackdrop);

    expect(art(container)?.getAttribute('src')).toBe('http://s/a-poster.jpg?w=1920');
  });

  it('dissolves instead of cutting: the settled art holds under the incoming frame', () => {
    const { container, focus } = mount('a');
    const first = art(container);
    if (!first) throw new Error('no artwork rendered');
    fireEvent.load(first);

    focus('b');
    act(() => vi.advanceTimersByTime(400));

    expect(outgoing(container)?.getAttribute('src')).toBe('http://s/a-back.jpg');
    expect(art(container)?.getAttribute('src')).toBe('http://s/b-back.jpg');
  });
});
