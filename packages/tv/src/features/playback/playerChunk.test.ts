// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#tv/features/playback/TvPlayer', () => ({
  TvPlayer: () => createElement('div', null, 'the player'),
}));

const { TvPlayer } = await import('#tv/features/playback/playerChunk');

describe('the browser player chunk', () => {
  it('renders its fallback first, then the player the chunk resolves to', async () => {
    const view = render(
      createElement(
        Suspense,
        { fallback: createElement('div', null, 'loading') },
        createElement(TvPlayer),
      ),
    );
    expect(view.container.textContent).toBe('loading');
    await vi.waitFor(() => expect(view.container.textContent).toBe('the player'));
  });
});
