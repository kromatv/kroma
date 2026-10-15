import { describe, expect, it } from 'vitest';
import { PlaybackPing } from './schemas';

const WATCH = {
  mount: '/api/module/tv.example.swarm',
  id: 'f13348a88094f2e1',
  file: 0,
  title: 'Kaamelott',
};

describe('a playback heartbeat', () => {
  it('names a catalogue item', () => {
    expect(PlaybackPing.safeParse({ sessionId: 's1', itemId: 'it1', positionMs: 0 }).success).toBe(
      true,
    );
  });

  it('names a file of a watch download instead', () => {
    expect(PlaybackPing.safeParse({ sessionId: 's1', watch: WATCH, positionMs: 0 }).success).toBe(
      true,
    );
  });

  it('never names both', () => {
    const both = { sessionId: 's1', itemId: 'it1', watch: WATCH, positionMs: 0 };

    expect(PlaybackPing.safeParse(both).success).toBe(false);
  });

  it('never names neither', () => {
    expect(PlaybackPing.safeParse({ sessionId: 's1', positionMs: 0 }).success).toBe(false);
  });
});
