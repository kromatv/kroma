// @vitest-environment jsdom

import { MediaItem } from '@kromatv/client/media';
import { fakeClient } from '@kromatv/client/test';
import { type FakeVideo, fakeVideo } from '@kromatv/core/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeListeners } from './engine.fixture';
import { HtmlEngine } from './html-engine';

const H = vi.hoisted(() => {
  const players: Array<{ fail: (detail: unknown) => void }> = [];
  const hlsErrors: Array<(event: string, data: unknown) => void> = [];
  return { players, hlsErrors, hlsSupported: false, startLoad: vi.fn() };
});

vi.mock('shaka-player/dist/shaka-player.compiled.js', () => ({
  default: {
    polyfill: { installAll: () => undefined },
    Player: class {
      static isBrowserSupported() {
        return true;
      }
      private readonly errors: Array<(event: { detail: unknown }) => void> = [];
      attach = () => Promise.resolve();
      load = () => Promise.resolve();
      configure = () => true;
      destroy = () => Promise.resolve();
      retryStreaming = () => true;
      addEventListener = (_type: string, listener: (event: { detail: unknown }) => void) => {
        this.errors.push(listener);
      };
      fail = (detail: unknown) => {
        for (const listener of this.errors) {
          listener({ detail });
        }
      };
      constructor() {
        H.players.push(this);
      }
    },
  },
}));

vi.mock('hls.js', () => ({
  default: class {
    static Events = { ERROR: 'hlsError' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
    static isSupported() {
      return H.hlsSupported;
    }
    on = (_event: string, listener: (event: string, data: unknown) => void) => {
      H.hlsErrors.push(listener);
    };
    startLoad = H.startLoad;
    recoverMediaError = () => undefined;
    loadSource = () => undefined;
    attachMedia = () => undefined;
    destroy = () => undefined;
  },
}));

const item = MediaItem.parse({
  id: 'vid1',
  kind: 'movie',
  title: 'Short Pause',
  year: null,
  library: 'lib',
  video: null,
  addedAt: '2026-01-01T00:00:00Z',
  metadata: null,
  showId: null,
  showTitle: null,
  season: null,
  episode: null,
  episodeEnd: null,
  episodeTitle: null,
  container: 'mkv',
  durationMs: null,
  relPath: null,
  audio: null,
  audioTracks: [],
  subtitles: [],
  files: [],
});
const GONE = { code: 1001, severity: 2, data: ['seg_00023.m4s', 404] };
const EXPIRED = { code: 1001, severity: 2, data: ['seg_00023.m4s', 401] };

function engineOn(fv: FakeVideo, opts: { shaka?: boolean; renewed?: string } = {}) {
  const hlsMasterUrl = vi.fn((_id: string, _aac = false, startSec = 0) => `master@${startSec}`);
  const client = fakeClient({ media: { hlsMasterUrl, streamUrl: () => 'stream' } });
  const refreshSession = vi.fn(() => Promise.resolve(opts.renewed));
  Object.assign(client, { refreshSession });
  const listeners = fakeListeners();
  const engine = new HtmlEngine({
    video: fv.el,
    client,
    item,
    direct: false,
    masterAac: false,
    masterShaka: opts.shaka ?? true,
    forceNativeHls: false,
    initialRendition: 0,
    durationSec: 300,
    startSec: 0,
    listeners,
  });
  return { engine, hlsMasterUrl, refreshSession, listeners };
}

async function nthPlayer(count: number) {
  await vi.waitFor(() => expect(H.players).toHaveLength(count));
  return H.players[count - 1];
}

function playingAt(fv: FakeVideo, sec: number) {
  fv.set('paused', false);
  fv.set('currentTime', sec);
}

beforeEach(() => {
  H.players.length = 0;
  H.hlsErrors.length = 0;
  H.hlsSupported = false;
  H.startLoad.mockClear();
  vi.stubGlobal('fetch', () => Promise.resolve({ headers: { get: () => null } }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HtmlEngine when the server has let the stream go', () => {
  it('picks up where the picture was when Shaka finds its session gone', async () => {
    const fv = fakeVideo();
    const { hlsMasterUrl } = engineOn(fv);
    const player = await nthPlayer(1);
    playingAt(fv, 137);

    player?.fail(GONE);

    expect(hlsMasterUrl).toHaveBeenLastCalledWith('vid1', false, 137, 0, expect.anything());
  });

  it('calls the stream broken once two restarts have not got it playing', async () => {
    const fv = fakeVideo();
    const { hlsMasterUrl, listeners } = engineOn(fv);
    playingAt(fv, 20);

    (await nthPlayer(1))?.fail(GONE);
    (await nthPlayer(2))?.fail(GONE);
    (await nthPlayer(3))?.fail(GONE);

    expect(hlsMasterUrl).toHaveBeenCalledTimes(3);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
  });

  it('owes its two restarts again once the picture plays', async () => {
    const fv = fakeVideo();
    const { hlsMasterUrl, listeners } = engineOn(fv);
    playingAt(fv, 20);
    (await nthPlayer(1))?.fail(GONE);
    (await nthPlayer(2))?.fail(GONE);

    fv.fire('playing');
    (await nthPlayer(3))?.fail(GONE);

    expect(hlsMasterUrl).toHaveBeenCalledTimes(4);
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it('ignores what a player it has already replaced reports', async () => {
    const fv = fakeVideo();
    const { hlsMasterUrl } = engineOn(fv);
    playingAt(fv, 20);
    const first = await nthPlayer(1);
    first?.fail(GONE);
    await nthPlayer(2);

    first?.fail(GONE);

    expect(hlsMasterUrl).toHaveBeenCalledTimes(2);
  });

  it('renews the session on a refused credential and picks up there', async () => {
    const fv = fakeVideo();
    const { hlsMasterUrl, refreshSession } = engineOn(fv, { renewed: 'fresh' });
    const player = await nthPlayer(1);
    playingAt(fv, 64);

    player?.fail(EXPIRED);

    await vi.waitFor(() =>
      expect(hlsMasterUrl).toHaveBeenLastCalledWith('vid1', false, 64, 0, expect.anything()),
    );
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('calls the stream broken when the session cannot be renewed', async () => {
    const fv = fakeVideo();
    const { hlsMasterUrl, listeners } = engineOn(fv);
    const player = await nthPlayer(1);

    player?.fail(EXPIRED);

    await vi.waitFor(() => expect(listeners.onError).toHaveBeenCalledTimes(1));
    expect(hlsMasterUrl).toHaveBeenCalledTimes(1);
  });

  it('picks up where the picture was when hls.js finds its session gone', async () => {
    H.hlsSupported = true;
    const fv = fakeVideo();
    const { hlsMasterUrl } = engineOn(fv, { shaka: false });
    await vi.waitFor(() => expect(H.hlsErrors).toHaveLength(1));
    playingAt(fv, 90);

    H.hlsErrors[0]?.('hlsError', { type: 'networkError', fatal: true, response: { code: 404 } });

    expect(hlsMasterUrl).toHaveBeenLastCalledWith('vid1', false, 90, 0, expect.anything());
    expect(H.startLoad).not.toHaveBeenCalled();
  });
});
