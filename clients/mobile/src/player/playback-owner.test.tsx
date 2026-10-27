// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaybackOwnerProvider, usePlaybackOwner } from './playback-owner';

afterEach(cleanup);

function Owner({ stop }: Readonly<{ stop(): void }>) {
  usePlaybackOwner(stop);
  return null;
}

describe('single playback ownership', () => {
  it('immediately stops the previous mounted engine when a second engine claims playback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { unmount } = render(
      <PlaybackOwnerProvider>
        <Owner stop={first} />
        <Owner stop={second} />
      </PlaybackOwnerProvider>,
    );
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    unmount();
    expect(second).toHaveBeenCalledOnce();
  });

  it('does not let an older engine cleanup clear the newest playback lease', () => {
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();
    const { rerender } = render(
      <PlaybackOwnerProvider>
        <Owner key="first" stop={first} />
        <Owner key="second" stop={second} />
      </PlaybackOwnerProvider>,
    );
    rerender(
      <PlaybackOwnerProvider>
        <Owner key="second" stop={second} />
      </PlaybackOwnerProvider>,
    );
    expect(second).not.toHaveBeenCalled();
    rerender(
      <PlaybackOwnerProvider>
        <Owner key="second" stop={second} />
        <Owner key="third" stop={third} />
      </PlaybackOwnerProvider>,
    );
    expect(second).toHaveBeenCalledOnce();
    expect(third).not.toHaveBeenCalled();
  });

  it('stops the active engine on component unmount', () => {
    const stop = vi.fn();
    const { unmount } = render(
      <PlaybackOwnerProvider>
        <Owner stop={stop} />
      </PlaybackOwnerProvider>,
    );
    unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('requires the application-wide ownership provider', () => {
    expect(() => render(<Owner stop={vi.fn()} />)).toThrow('PlaybackOwnerProvider');
  });
});
