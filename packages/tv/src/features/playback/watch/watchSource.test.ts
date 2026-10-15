import type { WatchableApi, WatchableProbe } from '@kromatv/client/watchable';
import type { WatchReady } from '@kromatv/core';
import { PROBE, TARGET, TICKET } from '@kromatv/core/test';
import { describe, expect, it, vi } from 'vitest';
import { watchAudioTracks, watchMedia } from '#tv/features/playback/watch/watchSource';

const SURROUND: WatchableProbe = {
  ...PROBE,
  audio: [
    { index: 0, codec: 'ac3', channels: 6, language: 'eng' },
    { index: 1, codec: 'aac', channels: 2, language: 'fra' },
  ],
};

const READY: WatchReady = {
  stage: 'ready',
  release: null,
  downloadId: TARGET.entry.id,
  target: TARGET,
  probe: SURROUND,
  ticket: TICKET,
};

function source() {
  const hlsMasterUrl = vi.fn(() => '/playlist.m3u8');
  return { hlsMasterUrl, watchable: { hlsMasterUrl } as unknown as WatchableApi };
}

describe('the playlist a television is handed', () => {
  it('names the download, the file and the credential the module minted', () => {
    const { hlsMasterUrl, watchable } = source();

    watchMedia(watchable, READY, 1).playlist('native', 0);

    expect(hlsMasterUrl).toHaveBeenCalledWith(
      expect.objectContaining({ id: TARGET.entry.id, file: 5, token: 'tok_1', audio: 1 }),
    );
  });

  it('anchors the master at the second an engine asks for', () => {
    const { hlsMasterUrl, watchable } = source();

    watchMedia(watchable, READY, 0).playlist('native', 2400);

    expect(hlsMasterUrl).toHaveBeenCalledWith(expect.objectContaining({ startSec: 2400 }));
  });

  it('asks for no transcode where the engine opens the file as it is', () => {
    const { hlsMasterUrl, watchable } = source();

    watchMedia(watchable, READY, 0).playlist('native', 0);

    expect(hlsMasterUrl).toHaveBeenCalledWith(
      expect.objectContaining({ aac: false, declaration: {} }),
    );
  });

  it('asks a browser engine to re-encode a soundtrack MSE cannot decode', () => {
    const { hlsMasterUrl, watchable } = source();

    watchMedia(watchable, READY, 0).playlist('mse', 0);

    expect(hlsMasterUrl).toHaveBeenCalledWith(expect.objectContaining({ aac: true }));
  });

  it('sizes the buffer from the file the probe measured', () => {
    const { watchable } = source();

    const media = watchMedia(watchable, READY, 0);

    expect(media.durationSec).toBeCloseTo(888.064, 3);
    expect(media.plan.forwardSec).toBeGreaterThan(0);
  });

  it('opens on the first soundtrack where the file marks none, keeping the master indexes', () => {
    expect(watchAudioTracks(SURROUND)).toEqual([
      { index: 0, codec: 'ac3', channels: 6, language: 'eng', title: null, default: true },
      { index: 1, codec: 'aac', channels: 2, language: 'fra', title: null, default: false },
    ]);
  });

  it('opens on the soundtrack the file marks, not the one that happens to be first', () => {
    const marked: WatchableProbe = {
      ...SURROUND,
      audio: [
        { index: 0, codec: 'ac3', channels: 6, language: 'eng', default: false },
        { index: 1, codec: 'aac', channels: 2, language: 'fra', default: true },
      ],
    };

    expect(watchAudioTracks(marked).map((track) => track.default)).toEqual([false, true]);
  });
});
