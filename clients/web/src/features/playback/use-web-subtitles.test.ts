// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MovieView } from '#web/shared/lib/api';

const H = vi.hoisted(() => ({
  user: null as { subtitleLanguage?: string | null } | null,
  downloadedSubtitles: vi.fn(),
  subtitleCapabilities: vi.fn(),
  deleteSubtitle: vi.fn(),
  generateSubtitle: vi.fn(),
  resolveArt: vi.fn((u: string) => u),
  cancel: vi.fn(),
  refresh: vi.fn(),
  lastGenOpts: null as { onComplete: (subId: string) => void } | null,
  updateUser: vi.fn(),
  updateAccount: vi.fn(async () => ({})),
}));

// The language matcher is the real one (it IS what this test exercises); the
// catalog-facing bits stay stubbed.
vi.mock('@kroma/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kroma/core')>()),
  GEN_LANGS: [
    { code: 'fr', label: 'Français' },
    { code: 'en', label: 'English' },
  ],
  langName: (_t: unknown, code: string | null | undefined) => (code ? code.toUpperCase() : null),
}));

vi.mock('@kroma/ui', () => ({
  useSubtitleGenerations: (
    _client: unknown,
    _itemId: string,
    opts: { onComplete: (subId: string) => void },
  ) => {
    H.lastGenOpts = opts;
    return { generations: [], cancel: H.cancel, refresh: H.refresh };
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

// The picker now WRITES the preference as well as reading it (see
// `useLangPrefs` in shared/lib/lang-pref), so the stub owes it the two things
// that hook binds to: the optimistic local update and the account PATCH.
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
  H.resolveArt.mockImplementation((u: string) => u);
  H.downloadedSubtitles.mockResolvedValue([]);
  H.subtitleCapabilities.mockResolvedValue(null);
  H.deleteSubtitle.mockResolvedValue(undefined);
  H.generateSubtitle.mockResolvedValue(undefined);
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
    // Downloaded/AI track takes an index in the 1000+ band and is selectable.
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
    // Deleting d1 (index 1000) shifts d2 down to 1000.
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
});
