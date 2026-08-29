// @vitest-environment jsdom

import { I18nProvider } from '@kroma/ui';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Animated } from 'react-native';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { GenreTile } from './genre-tile';

// Two react-native-web facts this file is built on: it picks a mock Animated
// that never touches the driver when NODE_ENV is `test`, and it warns about the
// missing driver ONCE per module registry. So the env is put back to what a
// browser bundle sees before anything imports it, and nothing else in this file
// renders first.
vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'development');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const GENRE = { slug: 'science-fiction', name: 'Science fiction', count: 12 };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Wall() {
  return (
    <I18nProvider locale="en">
      <GenreTile genre={GENRE} count="12 titles" backdrop={null} />
    </I18nProvider>
  );
}

async function wall() {
  const root = createRootRoute();
  const home = createRoute({ getParentRoute: () => root, path: '/', component: Wall });
  const genre = createRoute({ getParentRoute: () => root, path: '/genres/$id', component: Wall });
  const router = createRouter({
    routeTree: root.addChildren([home, genre]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
}

const art = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[style*="transition-property: transform"]');

describe('the genre tile zooming under the pointer', () => {
  it('never asks a browser for the native driver it does not have', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await wall();
    fireEvent.pointerOver(screen.getByLabelText('Science Fiction'));

    const said = [...warn.mock.calls, ...error.mock.calls].map((args) => String(args[0]));
    expect(said.filter((line) => line.includes('useNativeDriver'))).toEqual([]);
  });

  it('zooms the art on a CSS transition rather than a per-frame JS timing', async () => {
    const timing = vi.spyOn(Animated, 'timing');

    const { container } = await wall();

    expect(timing).not.toHaveBeenCalled();
    expect(art(container)?.style.transform).toBe('scale(1)');
  });

  it('grows the art while the pointer is over the tile and lets it back down after', async () => {
    const { container } = await wall();
    const tile = screen.getByLabelText('Science Fiction');

    fireEvent.pointerOver(tile);
    expect(art(container)?.style.transform).toBe('scale(1.05)');

    fireEvent.pointerOut(tile);
    expect(art(container)?.style.transform).toBe('scale(1)');
  });
});
