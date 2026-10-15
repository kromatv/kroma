// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeVideo,
  H,
  installHarness,
  kromaClientStub,
  movie,
  settle,
} from '#web/features/playback/use-video-playback.fixture';

vi.mock('@kromatv/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/core')>()),
  audioTracksOf: () => H.tracks,
  capabilities: () => ({}),
  MSE_CAPS: H.mseCaps,
  SAFARI_CAPS: H.safariCaps,
  masterNeedsAac: H.masterNeedsAac,
  selectEngine: () => H.decision,
}));

vi.mock('#web/features/playback/media-events', () => ({
  bindMediaEvents: vi.fn(() => () => {}),
}));

vi.mock('#web/features/playback/video-engine', () => ({
  attachMediaSource: vi.fn(() => () => {}),
}));

vi.mock('#web/shared/lib/api', () => ({ kromaClient: kromaClientStub }));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: H.client, user: H.user }),
}));

const { useVideoPlayback } = await import('#web/features/playback/use-video-playback');
const { catalogueSource } = await import('#web/features/playback/playback-source');

installHarness();

function answersMode(named: string | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      status: 200,
      headers: { get: (name: string) => (name === 'X-Hls-Mode' ? named : '0') },
    })),
  );
}

async function playing() {
  const source = catalogueSource(movie());
  const view = renderHook(() => useVideoPlayback(source));
  view.result.current.videoRef.current = fakeVideo() as unknown as HTMLVideoElement;
  await settle();
  return view;
}

describe('the mode the player reports', () => {
  it('is the one the playlist came back in, not the one that was asked for', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    answersMode('h264-aac');

    const { result } = await playing();

    expect(result.current.mode).toBe('transcode');
    expect(result.current.aac).toBe(true);
  });

  it('is a repackaging where the server copied both axes', async () => {
    H.decision = { kind: 'web-mse', aacMaster: true };
    answersMode('copy');

    const { result } = await playing();

    expect(result.current.mode).toBe('remux');
    expect(result.current.aac).toBe(false);
  });

  it('falls back to what was asked for where no playlist named a mode', async () => {
    H.decision = { kind: 'web-mse', aacMaster: true };
    answersMode(null);

    const { result } = await playing();

    expect(result.current.mode).toBe('transcode');
    expect(result.current.aac).toBe(true);
  });

  it('is direct play for a file the browser decodes as it is', async () => {
    H.decision = { kind: 'direct' };
    answersMode('aac');

    const { result } = await playing();

    expect(result.current.mode).toBe('direct');
    expect(result.current.aac).toBe(false);
  });
});
