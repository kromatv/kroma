import type { WatchableSubtitle } from '@kromatv/client/watchable';
import { describe, expect, it } from 'vitest';
import type { Cue } from './subtitles';
import { heldCues, seekLanded, watchSubtitleTracks } from './watchable-subtitles';

const track = (over: Partial<WatchableSubtitle>): WatchableSubtitle => ({
  index: 0,
  codec: 'subrip',
  language: 'fra',
  title: null,
  forced: false,
  text: true,
  ...over,
});

const cue = (start: number, text: string): Cue => ({ start, end: start + 2, text });

describe('the tracks a watch player offers', () => {
  it('keeps the text tracks in the order the probe lists them', () => {
    const probe = {
      subtitles: [track({ index: 0, language: 'fra' }), track({ index: 2, language: 'eng' })],
    };

    expect(watchSubtitleTracks(probe).map((t) => t.index)).toEqual([0, 2]);
  });

  it('leaves out a picture track, as the catalogue does', () => {
    const probe = {
      subtitles: [
        track({ index: 0, codec: 'hdmv_pgs_subtitle', text: false }),
        track({ index: 1, codec: 'subrip' }),
      ],
    };

    expect(watchSubtitleTracks(probe).map((t) => t.index)).toEqual([1]);
  });
});

describe('the cues held once a fetch answers', () => {
  it('keeps a cue already drawn that a later partial answer no longer carries', () => {
    const held = [cue(10, 'Bonjour')];

    const kept = heldCues(held, [cue(600, 'Plus loin')], true);

    expect(kept).toEqual([cue(10, 'Bonjour'), cue(600, 'Plus loin')]);
  });

  it('keeps a cue found by two partial answers once', () => {
    const held = [cue(10, 'Bonjour'), cue(20, 'Salut')];

    const kept = heldCues(held, [cue(20, 'Salut'), cue(30, 'Au revoir')], true);

    expect(kept.map((c) => c.text)).toEqual(['Bonjour', 'Salut', 'Au revoir']);
  });

  it('orders the cues by time whichever answer found them first', () => {
    const held = [cue(600, 'Plus loin')];

    const kept = heldCues(held, [cue(10, 'Bonjour')], true);

    expect(kept.map((c) => c.start)).toEqual([10, 600]);
  });

  it('takes a complete answer as the whole track, dropping a cue it no longer carries', () => {
    const held = [cue(5, 'Brouillon')];

    const kept = heldCues(held, [cue(10, 'Bonjour'), cue(20, 'Salut')], false);

    expect(kept).toEqual([cue(10, 'Bonjour'), cue(20, 'Salut')]);
  });
});

describe('a seek landing', () => {
  it('is not a seek on the first reading of the clock', () => {
    const { landed } = seekLanded(null, { atSec: 600, waiting: false });

    expect(landed).toBe(false);
  });

  it('is not a seek while the film plays on', () => {
    const last = { atSec: 100, seeking: false };

    const { landed } = seekLanded(last, { atSec: 100.5, waiting: false });

    expect(landed).toBe(false);
  });

  it('lands at once on a jump the player did not wait on', () => {
    const last = { atSec: 100, seeking: false };

    const { landed } = seekLanded(last, { atSec: 400, waiting: false });

    expect(landed).toBe(true);
  });

  it('lands on the first reading after the wait a jump caused', () => {
    const sought = seekLanded({ atSec: 100, seeking: false }, { atSec: 400, waiting: true });

    const arrived = seekLanded(sought.state, { atSec: 400.2, waiting: false });

    expect([sought.landed, arrived.landed]).toEqual([false, true]);
  });

  it('lands once, not on every reading after it', () => {
    const arrived = seekLanded({ atSec: 400, seeking: true }, { atSec: 400.2, waiting: false });

    const next = seekLanded(arrived.state, { atSec: 400.7, waiting: false });

    expect(next.landed).toBe(false);
  });

  it('does not take a stall for a seek', () => {
    const last = { atSec: 100, seeking: false };

    const stalled = seekLanded(last, { atSec: 100.2, waiting: true });
    const resumed = seekLanded(stalled.state, { atSec: 100.4, waiting: false });

    expect(resumed.landed).toBe(false);
  });

  it('counts a skip back as a seek', () => {
    const last = { atSec: 400, seeking: false };

    const { landed } = seekLanded(last, { atSec: 390, waiting: false });

    expect(landed).toBe(true);
  });
});
