// @vitest-environment jsdom
import type { KromaClient, MediaItem } from '@kroma/core';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useSubtitleSelection } from './useSubtitleSelection';

const client = {
  downloadedSubtitles: () => Promise.resolve([]),
  subtitleUrl: (id: string, index: number) => `/sub/${id}/${index}.vtt`,
  resolveArt: (url: string) => url,
} as unknown as KromaClient;

/** Index 1 is a PICTURE sub (PGS): French, but not renderable as text - the
 * preference must skip it and land on the text track at index 2. */
const item = {
  id: 'ep1',
  subtitles: [
    { language: 'eng', codec: 'subrip' },
    { language: 'fra', codec: 'hdmv_pgs_subtitle' },
    { language: 'fre', codec: 'subrip' },
  ],
} as unknown as MediaItem;

// The hook fetches generated subtitles in an effect, and the re-render that
// promise triggers is queued as a macrotask — after vitest tears jsdom down,
// react-dom reaches for `window`, finds nothing, and throws into an already-
// passed test (an uncaught exception, not a failure, but it still fails CI).
// Unmounting cancels the work; the tick lets anything already queued run
// while `window` still exists.
afterEach(() => new Promise((resolve) => setTimeout(resolve, 0)));

const active = (pref?: string | null) => {
  const { result, unmount } = renderHook(() => useSubtitleSelection(client, item, pref));
  const selected = result.current.active;
  unmount();
  return selected;
};

describe('useSubtitleSelection preferred language', () => {
  it('auto-enables the renderable track matching the preference', () => {
    // "fre" on the track, "fr" on the account: both normalize to fr.
    expect(active('fr')).toBe(2);
    expect(active('en')).toBe(0);
  });

  it('leaves subtitles off without a preference, for "off", or with no match', () => {
    expect(active(null)).toBeNull();
    expect(active(undefined)).toBeNull();
    expect(active('off')).toBeNull();
    expect(active('de')).toBeNull();
  });
});
