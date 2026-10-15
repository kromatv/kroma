// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#tv/features/playback/TvPlayer', () => ({
  TvPlayer: () => createElement('div', null, 'the player'),
}));
vi.mock('#tv/features/playback/watch/TvWatch', () => ({
  TvWatch: () => createElement('div', null, 'the download'),
}));

const { TvPlayer, TvWatch } = await import('#tv/features/playback/playerChunk');

const lazily = (screen: Parameters<typeof createElement>[0]) =>
  render(
    createElement(
      Suspense,
      { fallback: createElement('div', null, 'loading') },
      createElement(screen),
    ),
  );

describe('the browser player chunk', () => {
  it('renders its fallback first, then the player the chunk resolves to', async () => {
    const view = lazily(TvPlayer);

    expect(view.container.textContent).toBe('loading');
    await vi.waitFor(() => expect(view.container.textContent).toBe('the player'));
  });

  it('keeps the screen for a title the library does not hold out of the first bundle too', async () => {
    const view = lazily(TvWatch);

    expect(view.container.textContent).toBe('loading');
    await vi.waitFor(() => expect(view.container.textContent).toBe('the download'));
  });
});
