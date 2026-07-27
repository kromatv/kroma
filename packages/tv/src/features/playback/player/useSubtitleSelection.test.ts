// @vitest-environment jsdom
import type { KromaClient, MediaItem } from '@kroma/core';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

const active = (pref?: string | null) =>
  renderHook(() => useSubtitleSelection(client, item, pref)).result.current.active;

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
