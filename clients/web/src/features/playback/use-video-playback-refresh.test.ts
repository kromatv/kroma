// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  H,
  installHarness,
  kromaClientStub,
  movie,
  settle,
} from '#web/features/playback/use-video-playback.fixture';
import { ItemId } from '@kromatv/client/media';
import type { MovieView } from '#web/shared/lib/api';

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
vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const { QueryClient } =
    await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  const cache = new QueryClient();
  const runtime = createWebTestRuntime(kromaClientStub(), () => cache);
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: H.client, user: H.user }),
}));

const { useVideoPlayback } = await import('#web/features/playback/use-video-playback.hook');
const { attachMediaSource } = await import('#web/features/playback/video-engine');

installHarness();

async function streaming(item = movie()) {
  H.decision = { kind: 'web-mse', aacMaster: false };
  H.user = { id: 'u1' };
  H.itemProgress.mockResolvedValue({ positionMs: 40_000, durationMs: 100_000 });
  const view = renderHook((props: { item: MovieView }) => useVideoPlayback(props.item), {
    initialProps: { item },
  });
  view.result.current.videoRef.current = document.createElement('video');
  await settle();
  vi.mocked(attachMediaSource).mockClear();
  vi.mocked(fetch).mockClear();
  H.itemProgress.mockClear();
  return { view, item };
}

describe('useVideoPlayback across a session refresh', () => {
  it('keeps the stream it attached when the refresh hands the same account back', async () => {
    const { view, item } = await streaming();

    H.user = { id: 'u1' };
    view.rerender({ item });
    await settle();

    expect(H.itemProgress).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(attachMediaSource).not.toHaveBeenCalled();
    expect(view.result.current.anchor).toBe(40);
  });

  it('keeps the stream it attached when the same title comes back with fresh URLs', async () => {
    const { view } = await streaming(movie({ stream: 'stream://m1?t=old' }));

    view.rerender({ item: movie({ stream: 'stream://m1?t=new' }) });
    await settle();

    expect(fetch).not.toHaveBeenCalled();
    expect(attachMediaSource).not.toHaveBeenCalled();
  });

  it('resolves the resume point again for another account', async () => {
    const { view, item } = await streaming();
    H.itemProgress.mockResolvedValue({ positionMs: 70_000, durationMs: 100_000 });

    H.user = { id: 'u2' };
    view.rerender({ item });
    await settle();

    expect(H.itemProgress).toHaveBeenCalledTimes(1);
    expect(view.result.current.anchor).toBe(70);
    expect(attachMediaSource).toHaveBeenCalled();
  });

  it('opens the stream of a different title', async () => {
    const { view } = await streaming();

    view.rerender({ item: movie({ id: ItemId.parse('m2') }) });
    await settle();

    expect(H.itemProgress).toHaveBeenCalledWith('m2');
    expect(attachMediaSource).toHaveBeenCalled();
  });
});
