// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { H, installHarness, movie, settle } from '#web/features/playback/use-web-subtitles.fixture';

// The language matcher stays real; only the catalog-facing bits are stubbed.
vi.mock('@kroma/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kroma/core')>()),
  get GEN_LANGS() {
    return H.genLangs;
  },
  langName: (_t: unknown, code: string | null | undefined) => (code ? code.toUpperCase() : null),
}));

vi.mock('@kroma/ui', () => ({
  useSubtitleGenerations: (
    _client: unknown,
    _itemId: string,
    opts: { onComplete: (subId: string) => void },
  ) => {
    H.lastGenOpts = opts;
    return { generations: H.generations, cancel: H.cancel, refresh: H.refresh };
  },
}));

vi.mock('#web/shared/lib/api', () => ({
  kromaClient: () => ({
    downloadedSubtitles: H.downloadedSubtitles,
    subtitleCapabilities: H.subtitleCapabilities,
    deleteSubtitle: H.deleteSubtitle,
    generateSubtitle: H.generateSubtitle,
    resolveArt: H.resolveArt,
  }),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    user: H.user,
    updateUser: H.updateUser,
    client: { updateAccount: H.updateAccount },
  }),
}));

const { useWebSubtitles } = await import('#web/features/playback/use-web-subtitles');

const t = ((k: string) => k) as unknown as Parameters<typeof useWebSubtitles>[1];

installHarness();

describe('useWebSubtitles track merge', () => {
  it('merges embedded + downloaded tracks and flags selectability', async () => {
    H.downloadedSubtitles.mockResolvedValue([
      { id: 'd1', language: 'fr', label: 'IA FR', url: '/dl.vtt', provider: 'whisper' },
    ]);
    const item = movie([
      { index: 0, language: 'eng', codec: 'subrip', url: '/0.vtt' },
      { index: 1, language: 'fra', codec: 'PGS', url: null }, // image sub → not selectable
    ]);
    const { result } = renderHook(() => useWebSubtitles(item, t));
    await settle();

    const subs = result.current.subtitles;
    expect(subs).toHaveLength(3);
    expect(subs[0]).toMatchObject({ index: 0, selectable: true, ai: false });
    expect(subs[1]).toMatchObject({ index: 1, selectable: false });
    expect(subs[2]).toMatchObject({ index: 1000, ai: true, selectable: true, subId: 'd1' });
  });
});

describe('useWebSubtitles active selection + label', () => {
  it('defaults to off and follows setActive', async () => {
    const item = movie([{ index: 0, language: 'eng', codec: 'subrip', url: '/0.vtt' }]);
    const { result } = renderHook(() => useWebSubtitles(item, t));
    await settle();

    expect(result.current.activeIndex).toBeNull();
    expect(result.current.label).toBe('player.subtitlesOff');
    act(() => result.current.setActive(0));
    expect(result.current.activeIndex).toBe(0);
    expect(result.current.label).toBe('ENG'); // langName fallback
  });

  it('auto-applies the account preferred subtitle language once', async () => {
    H.user = { subtitleLanguage: 'fr' };
    const item = movie([
      { index: 0, language: 'eng', codec: 'subrip', url: '/0.vtt' },
      { index: 1, language: 'fra', codec: 'PGS', url: null }, // image → skipped
      { index: 2, language: 'fra', codec: 'subrip', url: '/2.vtt' }, // this one wins
    ]);
    const { result } = renderHook(() => useWebSubtitles(item, t));
    await settle();
    expect(result.current.activeIndex).toBe(2);
  });
});

describe('useWebSubtitles deletion', () => {
  const twoDownloaded = [
    { id: 'd1', language: 'fr', url: '/1.vtt' },
    { id: 'd2', language: 'de', url: '/2.vtt' },
  ];

  async function withTracks() {
    H.downloadedSubtitles.mockResolvedValue(twoDownloaded);
    const view = renderHook(() =>
      useWebSubtitles(movie([{ index: 0, language: 'eng', codec: 'subrip', url: '/0.vtt' }]), t),
    );
    await settle();
    return view;
  }

  it('clears the selection when the deleted track was the active one', async () => {
    const { result } = await withTracks();
    act(() => result.current.setActive(1000));
    act(() => result.current.subtitleGen.onDelete('d1'));
    expect(result.current.activeIndex).toBeNull();
  });

  it('leaves an embedded selection alone', async () => {
    const { result } = await withTracks();
    act(() => result.current.setActive(0));
    act(() => result.current.subtitleGen.onDelete('d2'));
    expect(result.current.activeIndex).toBe(0);
  });

  it('leaves a selection above the deleted track where it was', async () => {
    const { result } = await withTracks();
    act(() => result.current.setActive(1000));
    act(() => result.current.subtitleGen.onDelete('d2'));
    expect(result.current.activeIndex).toBe(1000);
  });

  it('deletes an unknown id without touching the selection', async () => {
    const { result } = await withTracks();
    act(() => result.current.setActive(1001));
    act(() => result.current.subtitleGen.onDelete('ghost'));
    expect(result.current.activeIndex).toBe(1001);
    expect(H.deleteSubtitle).toHaveBeenCalledWith('movie-1', 'ghost');
  });

  it('survives a delete the server refuses', async () => {
    H.deleteSubtitle.mockRejectedValue(new Error('locked'));
    const { result } = await withTracks();
    await act(async () => {
      result.current.subtitleGen.onDelete('d1');
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(result.current.subtitles.map((s) => s.subId)).not.toContain('d1');
  });
});

describe('useWebSubtitles preference writes', () => {
  it('remembers turning subtitles off as a real choice', async () => {
    const item = movie([{ index: 0, language: 'eng', codec: 'subrip', url: '/0.vtt' }]);
    const { result } = renderHook(() => useWebSubtitles(item, t));
    await settle();
    act(() => result.current.setActive(0));
    expect(H.updateUser).toHaveBeenLastCalledWith({ subtitleLanguage: 'en' });

    act(() => result.current.setActive(null));
    expect(result.current.activeIndex).toBeNull();
    expect(result.current.label).toBe('player.subtitlesOff');
    expect(H.updateUser).toHaveBeenLastCalledWith({ subtitleLanguage: 'off' });
  });

  it('leaves the preference alone for a track that declares no language', async () => {
    H.downloadedSubtitles.mockResolvedValue([{ id: 'd1', language: null, url: '/1.vtt' }]);
    const { result } = renderHook(() => useWebSubtitles(movie([]), t));
    await settle();
    act(() => result.current.setActive(1000));
    expect(H.updateUser).not.toHaveBeenCalled();
    expect(result.current.label).toBe('player.langUnknown');
  });
});
