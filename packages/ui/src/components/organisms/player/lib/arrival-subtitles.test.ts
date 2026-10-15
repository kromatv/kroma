import type { WatchSubtitleTrack } from '@kromatv/core/react';
import { describe, expect, it, vi } from 'vitest';
import { arrivalSubtitles } from './arrival-subtitles';

const track = (index: number, language: string): WatchSubtitleTrack => ({
  index,
  codec: 'subrip',
  language,
  title: null,
  forced: false,
  text: true,
  url: `http://kroma.test/subtitles/${index}.vtt?t=tok`,
});

const BONJOUR = [{ start: 10, end: 12, text: 'Bonjour' }];

describe('the subtitles of a file still arriving', () => {
  it('draws the playing track from the cues held so far', () => {
    const subs = {
      tracks: [track(0, 'fra'), track(1, 'eng')],
      active: 0,
      pick: vi.fn(),
      cues: BONJOUR,
    };

    const { subtitles } = arrivalSubtitles(subs);

    expect(subtitles.map((sub) => sub.cues)).toEqual([BONJOUR, []]);
  });

  it('never hands the renderer an address to fetch itself', () => {
    const subs = { tracks: [track(0, 'fra')], active: 0, pick: vi.fn(), cues: BONJOUR };

    const { subtitles } = arrivalSubtitles(subs);

    expect(subtitles[0]).toMatchObject({ selectable: true, codec: 'subrip', language: 'fra' });
    expect(subtitles[0]?.url).toBeUndefined();
  });

  it('picks through the host, off included', () => {
    const pick = vi.fn();
    const subs = { tracks: [track(0, 'fra')], active: null, pick, cues: [] };

    arrivalSubtitles(subs).setSubtitle(null);

    expect(pick).toHaveBeenCalledWith(null);
  });
});
