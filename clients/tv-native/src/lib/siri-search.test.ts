import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestSearch = vi.hoisted(() => vi.fn());
vi.mock('@kroma/tv', () => ({ requestSearch }));

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
        },
      };
    },
  },
}));

const siri = vi.hoisted(() => ({
  present: true,
  pending: null as string | null,
  handler: null as ((event: { text: string }) => void) | null,
  removed: 0,
}));
vi.mock('../../modules/siri-search', () => ({
  get SiriSearch() {
    if (!siri.present) return null;
    return {
      takePendingQuery: () => siri.pending,
      addListener: (_event: string, handler: (e: { text: string }) => void) => {
        siri.handler = handler;
        return {
          remove: () => {
            siri.removed += 1;
          },
        };
      },
    };
  },
}));

import { parseSearchUrl, startSiriSearch } from './siri-search';

beforeEach(() => {
  linking.initial = null;
  linking.initialFails = false;
  linking.handler = null;
  linking.removed = 0;
  siri.present = true;
  siri.pending = null;
  siri.handler = null;
  siri.removed = 0;
  vi.clearAllMocks();
});

describe('reading a search link', () => {
  it('takes the query', () => {
    expect(parseSearchUrl('kroma://search?q=dune')).toBe('dune');
  });

  it('accepts the trailing slash form too', () => {
    expect(parseSearchUrl('kroma://search/?q=dune')).toBe('dune');
  });

  it('accepts the scheme in any case', () => {
    expect(parseSearchUrl('KROMA://SEARCH?q=dune')).toBe('dune');
  });

  it('decodes a spoken title', () => {
    // Spaces, accents and apostrophes are exactly what a voice query carries.
    expect(parseSearchUrl('kroma://search?q=blade%20runner')).toBe('blade runner');
    expect(parseSearchUrl('kroma://search?q=l%27%C3%A9t%C3%A9')).toBe("l'été");
  });

  it('reads `+` as a space', () => {
    // The other spelling of an encoded space; a title searched as "blade+runner"
    // matches nothing.
    expect(parseSearchUrl('kroma://search?q=blade+runner')).toBe('blade runner');
  });

  it('finds `q` among other parameters', () => {
    expect(parseSearchUrl('kroma://search?from=siri&q=dune&lang=fr')).toBe('dune');
  });

  it('keeps the raw value when the encoding is broken', () => {
    // A throw here would take down the launch that carried the link.
    expect(parseSearchUrl('kroma://search?q=%ZZ')).toBe('%ZZ');
  });

  it('reads a bare `q` as an empty query', () => {
    expect(parseSearchUrl('kroma://search?q')).toBe('');
  });

  it('ignores a link with no query to run', () => {
    for (const url of [
      'kroma://search',
      'kroma://search?from=siri',
      'kroma://item/abc',
      'https://kroma.test/search?q=dune',
      '',
    ]) {
      expect(parseSearchUrl(url)).toBeNull();
    }
  });

  it('ignores no URL at all', () => {
    expect(parseSearchUrl(null)).toBeNull();
  });
});

describe('a request that launched the app', () => {
  it('runs the query Siri was holding', () => {
    siri.pending = 'blade runner';
    startSiriSearch();
    // Siri launches the app to handle the intent, so the query exists before
    // any JavaScript does.
    expect(requestSearch).toHaveBeenCalledWith('blade runner');
  });

  it('runs the query a link was carrying', async () => {
    linking.initial = 'kroma://search?q=dune';
    startSiriSearch();
    await vi.waitFor(() => expect(requestSearch).toHaveBeenCalledWith('dune'));
  });

  it('runs nothing on an ordinary launch', async () => {
    startSiriSearch();
    await Promise.resolve();
    expect(requestSearch).not.toHaveBeenCalled();
  });
});

describe('a request made while the app was open', () => {
  it('runs what Siri heard', () => {
    startSiriSearch();
    siri.handler?.({ text: 'blade runner' });
    expect(requestSearch).toHaveBeenCalledWith('blade runner');
  });

  it('runs what a link asked for', () => {
    startSiriSearch();
    linking.handler?.({ url: 'kroma://search?q=dune' });
    expect(requestSearch).toHaveBeenCalledWith('dune');
  });

  it('ignores a link that is not a search', () => {
    startSiriSearch();
    linking.handler?.({ url: 'kroma://item/abc' });
    expect(requestSearch).not.toHaveBeenCalled();
  });

  it('keeps answering, request after request', () => {
    startSiriSearch();
    siri.handler?.({ text: 'one' });
    siri.handler?.({ text: 'two' });
    expect(requestSearch).toHaveBeenCalledTimes(2);
  });
});

describe('a platform that cannot say what launched the app', () => {
  it('still opens the link door', async () => {
    linking.initialFails = true;

    expect(() => startSiriSearch()).not.toThrow();

    await vi.waitFor(() => expect(linking.handler).not.toBeNull());
    linking.handler?.({ url: 'kroma://search?q=dune' });
    expect(requestSearch).toHaveBeenCalledWith('dune');
  });
});

describe('on a build with no Siri module', () => {
  it('still starts, and the link door still works', () => {
    // Android TV, and any future shell. `SiriSearch` is null there.
    siri.present = false;
    expect(() => startSiriSearch()).not.toThrow();

    linking.handler?.({ url: 'kroma://search?q=dune' });
    expect(requestSearch).toHaveBeenCalledWith('dune');
  });

  it('cleans up without a Siri subscription to remove', () => {
    siri.present = false;
    const stop = startSiriSearch();
    expect(() => stop()).not.toThrow();
    expect(linking.removed).toBe(1);
  });
});

describe('stopping', () => {
  it('lets go of BOTH doors', () => {
    const stop = startSiriSearch();
    stop();
    expect(siri.removed).toBe(1);
    expect(linking.removed).toBe(1);
  });
});
