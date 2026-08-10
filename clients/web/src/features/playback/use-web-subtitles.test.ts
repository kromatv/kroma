// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MovieView } from '#web/shared/lib/api';

const H = vi.hoisted(() => ({
  genLangs: [] as { code: string; label: string }[],
  generations: [] as { id: string; status: string }[],
  user: null as { subtitleLanguage?: string | null } | null,
  downloadedSubtitles: vi.fn(),
  subtitleCapabilities: vi.fn(),
  deleteSubtitle: vi.fn(),
  generateSubtitle: vi.fn(),
  resolveArt: vi.fn((u: string): string | null => u),
  cancel: vi.fn(),
  refresh: vi.fn(),
  lastGenOpts: null as { onComplete: (subId: string) => void } | null,
  updateUser: vi.fn(),
  updateAccount: vi.fn(async () => ({})),
}));

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

function movie(subs: MovieView['subs']): MovieView {
  return { id: 'movie-1', subs } as MovieView;
}

async function settle() {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  H.user = null;
  H.genLangs = [
    { code: 'fr', label: 'Français' },
    { code: 'en', label: 'English' },
  ];
  H.generations = [];
  H.resolveArt.mockImplementation((u: string) => u);
  H.downloadedSubtitles.mockResolvedValue([]);
  H.subtitleCapabilities.mockResolvedValue(null);
  H.deleteSubtitle.mockResolvedValue(undefined);
  H.generateSubtitle.mockResolvedValue(undefined);
  H.updateAccount.mockResolvedValue({});
});
afterEach(() => cleanup());

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

describe('useWebSubtitles generation lifecycle', () => {
  it('onComplete selects the freshly produced track', async () => {
    const item = movie([{ index: 0, language: 'eng', codec: 'subrip', url: '/0.vtt' }]);
    const { result } = renderHook(() => useWebSubtitles(item, t));
    await settle();

    H.downloadedSubtitles.mockResolvedValue([
      { id: 'dA', language: 'fr', url: '/a.vtt' },
      { id: 'dB', language: 'de', url: '/b.vtt' },
    ]);
    await act(async () => {
      H.lastGenOpts?.onComplete('dB');
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(result.current.activeIndex).toBe(1001); // 1000 + index of 'dB'
  });

  it('onDelete removes the track, shifts the active index and calls the API', async () => {
    H.downloadedSubtitles.mockResolvedValue([
      { id: 'd1', language: 'fr', url: '/1.vtt' },
      { id: 'd2', language: 'de', url: '/2.vtt' },
    ]);
    const item = movie([]);
    const { result } = renderHook(() => useWebSubtitles(item, t));
    await settle();

    act(() => result.current.setActive(1001)); // the 'd2' track
    act(() => result.current.subtitleGen.onDelete('d1'));
    expect(result.current.activeIndex).toBe(1000);
    expect(H.deleteSubtitle).toHaveBeenCalledWith('movie-1', 'd1');
  });

  it('reports canCreate from caps and dispatches transcribe/translate requests', async () => {
    H.subtitleCapabilities.mockResolvedValue({ transcribe: true, translate: true });
    const item = movie([{ index: 0, language: 'eng', codec: 'subrip', url: '/0.vtt' }]);
    const { result } = renderHook(() => useWebSubtitles(item, t));
    await settle();

    expect(result.current.subtitleGen.canCreate).toBe(true);

    act(() => result.current.subtitleGen.onStart({ mode: 'transcribe', lang: 'fr' }));
    expect(H.generateSubtitle).toHaveBeenCalledWith('movie-1', {
      mode: 'transcribe',
      lang: 'Français',
      spokenLang: 'fr',
      quality: 'balanced',
    });

    act(() =>
      result.current.subtitleGen.onStart({ mode: 'translate', lang: 'en', sourceIndex: 0 }),
    );
    expect(H.generateSubtitle).toHaveBeenCalledWith('movie-1', {
      mode: 'translate',
      lang: 'English',
      sourceTrack: 0,
    });
  });

  it('refreshes the track list and the queue once a generation is accepted', async () => {
    const item = movie([{ index: 0, language: 'eng', codec: 'subrip', url: '/0.vtt' }]);
    const { result } = renderHook(() => useWebSubtitles(item, t));
    await settle();

    H.downloadedSubtitles.mockResolvedValue([{ id: 'dz', language: 'fr', url: '/z.vtt' }]);
    await act(async () => {
      result.current.subtitleGen.onStart({ mode: 'transcribe', lang: 'fr' });
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(H.refresh).toHaveBeenCalled();
    expect(result.current.subtitles.at(-1)).toMatchObject({ index: 1000, subId: 'dz' });
  });

  it('translates a downloaded track by its id rather than its stream index', async () => {
    H.downloadedSubtitles.mockResolvedValue([{ id: 'd1', language: 'fr', url: '/1.vtt' }]);
    const { result } = renderHook(() => useWebSubtitles(movie([]), t));
    await settle();

    act(() =>
      result.current.subtitleGen.onStart({ mode: 'translate', lang: 'en', sourceIndex: 1000 }),
    );
    expect(H.generateSubtitle).toHaveBeenCalledWith('movie-1', {
      mode: 'translate',
      lang: 'English',
      sourceSubId: 'd1',
    });
  });

  it('falls back to the first offered language for one it does not know', async () => {
    const { result } = renderHook(() => useWebSubtitles(movie([]), t));
    await settle();
    act(() => result.current.subtitleGen.onStart({ mode: 'transcribe', lang: 'zz' }));
    expect(H.generateSubtitle).toHaveBeenCalledWith(
      'movie-1',
      expect.objectContaining({ lang: 'Français', spokenLang: 'fr' }),
    );
  });

  it('dispatches nothing when there is no language to generate into', async () => {
    H.genLangs = [];
    const { result } = renderHook(() => useWebSubtitles(movie([]), t));
    await settle();
    act(() => result.current.subtitleGen.onStart({ mode: 'transcribe', lang: 'fr' }));
    expect(H.generateSubtitle).not.toHaveBeenCalled();
  });

  it('dispatches nothing for a translate whose source track has no url', async () => {
    const item = movie([{ index: 0, language: 'fra', codec: 'PGS', url: null }]);
    const { result } = renderHook(() => useWebSubtitles(item, t));
    await settle();
    act(() =>
      result.current.subtitleGen.onStart({ mode: 'translate', lang: 'en', sourceIndex: 0 }),
    );
    expect(H.generateSubtitle).not.toHaveBeenCalled();
  });

  it('survives a generation request the server rejects', async () => {
    H.generateSubtitle.mockRejectedValue(new Error('no whisper module'));
    const item = movie([{ index: 0, language: 'eng', codec: 'subrip', url: '/0.vtt' }]);
    const { result } = renderHook(() => useWebSubtitles(item, t));
    await settle();

    await act(async () => {
      result.current.subtitleGen.onStart({ mode: 'transcribe', lang: 'fr' });
      result.current.subtitleGen.onStart({ mode: 'translate', lang: 'en', sourceIndex: 0 });
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(H.generateSubtitle).toHaveBeenCalledTimes(2);
    expect(result.current.activeIndex).toBeNull();
  });

  it('survives a track list that cannot be re-read after a generation', async () => {
    const item = movie([{ index: 0, language: 'eng', codec: 'subrip', url: '/0.vtt' }]);
    const { result } = renderHook(() => useWebSubtitles(item, t));
    await settle();

    H.downloadedSubtitles.mockRejectedValue(new Error('offline'));
    await act(async () => {
      result.current.subtitleGen.onStart({ mode: 'transcribe', lang: 'fr' });
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(result.current.subtitles).toHaveLength(1);
  });

  it('offers only the unfinished generations as pending', async () => {
    H.generations = [
      { id: 'g1', status: 'running' },
      { id: 'g2', status: 'done' },
    ];
    const { result } = renderHook(() => useWebSubtitles(movie([]), t));
    await settle();
    expect(result.current.subtitleGen.pending).toEqual([{ id: 'g1', status: 'running' }]);
  });
});

describe('useWebSubtitles resilience', () => {
  it('keeps the embedded tracks when the catalogue cannot answer', async () => {
    H.downloadedSubtitles.mockRejectedValue(new Error('offline'));
    H.subtitleCapabilities.mockRejectedValue(new Error('offline'));
    const item = movie([{ index: 0, language: 'eng', codec: 'subrip', url: '/0.vtt' }]);
    const { result } = renderHook(() => useWebSubtitles(item, t));
    await settle();
    expect(result.current.subtitles).toHaveLength(1);
    expect(result.current.subtitleGen.canCreate).toBe(false);
  });

  it('keeps a downloaded track playable when the art resolver declines its url', async () => {
    H.resolveArt.mockReturnValue(null);
    H.downloadedSubtitles.mockResolvedValue([{ id: 'd1', language: 'fr', url: '/raw.vtt' }]);
    const { result } = renderHook(() => useWebSubtitles(movie([]), t));
    await settle();
    expect(result.current.subtitles[0]?.url).toBe('/raw.vtt');
  });

  it('leaves subtitles off when no track speaks the preferred language', async () => {
    H.user = { subtitleLanguage: 'de' };
    const item = movie([{ index: 0, language: 'eng', codec: 'subrip', url: '/0.vtt' }]);
    const { result } = renderHook(() => useWebSubtitles(item, t));
    await settle();
    expect(result.current.activeIndex).toBeNull();
  });

  it('leaves the selection alone when the finished generation is not in the list', async () => {
    const { result } = renderHook(() => useWebSubtitles(movie([]), t));
    await settle();
    H.downloadedSubtitles.mockResolvedValue([{ id: 'other', language: 'fr', url: '/o.vtt' }]);
    await act(async () => {
      H.lastGenOpts?.onComplete('missing');
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(result.current.activeIndex).toBeNull();
  });

  it('survives a completion whose refresh fails', async () => {
    const { result } = renderHook(() => useWebSubtitles(movie([]), t));
    await settle();
    H.downloadedSubtitles.mockRejectedValue(new Error('offline'));
    await act(async () => {
      H.lastGenOpts?.onComplete('d1');
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(result.current.activeIndex).toBeNull();
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
