import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestDeepLink = vi.hoisted(() => vi.fn());
vi.mock('@kroma/tv', () => ({ requestDeepLink }));

const linking = vi.hoisted(() => ({
  initial: null as string | null,
  initialFails: false,
  handler: null as ((event: { url: string }) => void) | null,
  removed: 0,
}));

vi.mock('react-native', () => ({
  Linking: {
    getInitialURL: async () => {
      if (linking.initialFails) throw new Error('no activity attached');
      return linking.initial;
    },
    addEventListener: (_event: string, handler: (e: { url: string }) => void) => {
      linking.handler = handler;
      return {
        remove: () => {
          linking.removed += 1;
          linking.handler = null;
        },
      };
    },
  },
}));

import { linkInUrl, startLauncherLinks } from './launcher-links';

beforeEach(() => {
  linking.initial = null;
  linking.initialFails = false;
  linking.handler = null;
  linking.removed = 0;
  vi.clearAllMocks();
});

describe('reading a launcher URL', () => {
  it('resolves an item link in the movie catalogue', () => {
    expect(linkInUrl('kroma://item/abc123')).toEqual({ type: 'movie', id: 'abc123' });
  });

  it('resolves a show link in the SHOWS catalogue', () => {
    // A launcher publishes an episode with its show's id; read as a movie it
    // resolves nothing and the press does nothing.
    expect(linkInUrl('kroma://show/abc123')).toEqual({ type: 'show', id: 'abc123' });
  });

  it('accepts the scheme in any case', () => {
    // Android's intent handling round-trips the URL and does not preserve case.
    expect(linkInUrl('KROMA://ITEM/abc123')).toEqual({ type: 'movie', id: 'abc123' });
    expect(linkInUrl('Kroma://Show/abc123')).toEqual({ type: 'show', id: 'abc123' });
  });

  it('stops the id at a query or a fragment', () => {
    expect(linkInUrl('kroma://item/abc123?from=watchnext')).toMatchObject({ id: 'abc123' });
    expect(linkInUrl('kroma://item/abc123#top')).toMatchObject({ id: 'abc123' });
    expect(linkInUrl('kroma://item/abc123/extra')).toMatchObject({ id: 'abc123' });
  });

  it('decodes a percent-encoded id', () => {
    expect(linkInUrl('kroma://item/abc%2F123')).toMatchObject({ id: 'abc/123' });
  });

  it('keeps the raw id when the encoding is broken', () => {
    // A malformed escape throws in decodeURIComponent; the raw id may still
    // resolve, and a throw here would take down the launch.
    expect(linkInUrl('kroma://item/abc%ZZ')).toEqual({ type: 'movie', id: 'abc%ZZ' });
  });

  it('ignores a URL that is not one of ours', () => {
    for (const url of [
      'https://kroma.test/item/abc',
      'kroma://search/dune',
      'kroma://item/',
      'kroma://',
      'not a url',
      '',
    ]) {
      expect(linkInUrl(url)).toBeNull();
    }
  });

  it('ignores no URL at all', () => {
    // `getInitialURL` answers null on a normal launch, which is most launches.
    expect(linkInUrl(null)).toBeNull();
  });
});

describe('forwarding a selection', () => {
  it('handles a tile that COLD-STARTED the app', async () => {
    linking.initial = 'kroma://item/abc123';
    startLauncherLinks();
    await vi.waitFor(() =>
      expect(requestDeepLink).toHaveBeenCalledWith({ type: 'movie', id: 'abc123' }),
    );
  });

  it('handles a tile selected while the app was open', () => {
    startLauncherLinks();
    linking.handler?.({ url: 'kroma://show/xyz' });
    // Re-targeting a running app is the other half; handling only one is a
    // launcher row that works exactly half the time.
    expect(requestDeepLink).toHaveBeenCalledWith({ type: 'show', id: 'xyz' });
  });

  it('pushes nothing for an ordinary launch', async () => {
    linking.initial = null;
    startLauncherLinks();
    await Promise.resolve();
    expect(requestDeepLink).not.toHaveBeenCalled();
  });

  it('survives a platform that cannot say what launched the app', async () => {
    linking.initialFails = true;

    expect(() => startLauncherLinks()).not.toThrow();

    await vi.waitFor(() => expect(linking.handler).not.toBeNull());
    expect(requestDeepLink).not.toHaveBeenCalled();
  });

  it('pushes nothing for a URL it does not recognise', () => {
    startLauncherLinks();
    linking.handler?.({ url: 'https://example.test/' });
    expect(requestDeepLink).not.toHaveBeenCalled();
  });

  it('keeps listening for a second selection', () => {
    startLauncherLinks();
    linking.handler?.({ url: 'kroma://item/one' });
    linking.handler?.({ url: 'kroma://item/two' });
    // A user browsing the home screen selects more than one tile.
    expect(requestDeepLink).toHaveBeenCalledTimes(2);
  });

  it('stops listening when told to', () => {
    const stop = startLauncherLinks();
    stop();
    expect(linking.removed).toBe(1);
    linking.handler?.({ url: 'kroma://item/abc' });
    expect(requestDeepLink).not.toHaveBeenCalled();
  });
});
