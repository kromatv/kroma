// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { movie } from '#web/features/playback/use-video-playback.fixture';

const itemProgress = vi.fn();
const save = vi.fn(() => Promise.resolve({ watched: false }));
interface StubAuth {
  client: { playback: { itemProgress: typeof itemProgress; save: typeof save } };
  user: { id: string } | null;
}
const auth: StubAuth = { client: { playback: { itemProgress, save } }, user: null };

vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => auth }));
vi.mock('#web/shared/lib/watched', () => ({
  useWatched: () => ({ setWatched: vi.fn(), noteWatched: vi.fn() }),
}));

const { useResumeProgress } = await import('#web/features/playback/use-resume-progress.hook');

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

function render() {
  const item = movie();
  const videoRef = { current: null };
  return renderHook(() => useResumeProgress(videoRef, item));
}

afterEach(() => {
  cleanup();
  itemProgress.mockReset();
});

describe('useResumeProgress across a session refresh', () => {
  it('offers the resume once when the refresh hands the same account back', async () => {
    auth.user = { id: 'u1' };
    itemProgress.mockResolvedValue({ positionMs: 40_000, durationMs: 100_000 });
    const view = render();
    await settle();
    itemProgress.mockResolvedValue({ positionMs: 52_000, durationMs: 100_000 });

    auth.user = { id: 'u1' };
    view.rerender();
    await settle();

    expect(itemProgress).toHaveBeenCalledTimes(1);
    expect(view.result.current).toBe(40);
  });

  it('asks again for another account', async () => {
    auth.user = { id: 'u1' };
    itemProgress.mockResolvedValue({ positionMs: 40_000, durationMs: 100_000 });
    const view = render();
    await settle();
    itemProgress.mockResolvedValue({ positionMs: 52_000, durationMs: 100_000 });

    auth.user = { id: 'u2' };
    view.rerender();
    await settle();

    expect(itemProgress).toHaveBeenCalledTimes(2);
    expect(view.result.current).toBe(52);
  });
});
