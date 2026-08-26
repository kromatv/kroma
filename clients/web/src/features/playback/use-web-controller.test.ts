// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { H, installHarness, item, makePb } from '#web/features/playback/use-web-controller.fixture';

vi.mock('#web/features/playback/use-video-playback', () => ({
  useVideoPlayback: () => H.pb,
}));
vi.mock('#web/features/playback/use-web-subtitles', () => ({
  useWebSubtitles: () => H.subs,
}));
vi.mock('#web/features/playback/web-stats', () => ({
  buildWebStats: (s: Record<string, unknown>) => {
    H.statsInput = s;
    return { mode: 'stub' };
  },
}));
vi.mock('@kroma/ui', () => ({
  useAudioFilter: () => H.filter,
  useLocale: () => 'en',
  useT: () => (k: string) => k,
}));
// `refineTrackLang` stays REAL: a stubbed matcher would only assert the stub.
vi.mock('@kroma/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kroma/core')>()),
  audioTrackLabel: () => 'English 5.1',
  qualityBadgeForVideo: () => H.badge,
}));
vi.mock('#web/shared/lib/lang-pref', () => ({
  useLangPrefs: () => ({ setAudio: H.rememberAudio }),
}));

const { useWebController } = await import('#web/features/playback/use-web-controller');

installHarness();

function render() {
  return renderHook(() => useWebController(item));
}

describe('useWebController controller mapping', () => {
  it('projects the engine state and transport onto the shared contract', () => {
    const { result } = render();
    const c = result.current.controller;
    expect(c.cur).toBe(12);
    expect(c.dur).toBe(100);
    expect(c.bufEnd).toBe(40);
    expect(c.playing).toBe(true);
    expect(c.surface).toBe('video');
    expect(c.togglePlay).toBe(H.pb?.togglePlay);
    expect(c.seekTo).toBe(H.pb?.seekTo);
    expect(c.audioFilter).toBe('off');
    expect(c.audioFilterSupported).toBe(true);
  });

  it('passes the subtitle bundle through and derives the audio label', () => {
    const { result } = render();
    const c = result.current.controller;
    expect(c.subtitles).toBe(H.subs?.subtitles);
    expect(c.subtitleIndex).toBeNull();
    expect(c.setSubtitle).toBe(H.subs?.setActive);
    expect(result.current.audioLabel).toBe('English 5.1');
    expect(result.current.subtitleLabel).toBe('Off');
  });

  it('offers a single source-honest quality with the codec badge', () => {
    const { result } = render();
    expect(result.current.controller.qualities).toEqual([
      { id: 'auto', label: 'player.qualityAuto · HDR' },
    ]);
    expect(result.current.controller.qualityId).toBe('auto');
  });
});

describe('useWebController audio preference', () => {
  it("remembers the picked track's language, refined by the dub variant", () => {
    H.pb = makePb({
      audioTracks: [
        { index: 0, language: 'eng' },
        { index: 1, language: 'fre', title: 'VFQ AC3 5.1' },
        { index: 2, language: 'fre', title: 'VFF AC3 5.1' },
      ],
    });
    const { result } = render();

    result.current.controller.setAudio(1);
    expect(H.pb?.setAudio).toHaveBeenCalledWith(1);
    // Not plain 'fr': VFQ and VFF are two different dubs.
    expect(H.rememberAudio).toHaveBeenCalledWith('fr-CA');

    result.current.controller.setAudio(2);
    expect(H.rememberAudio).toHaveBeenLastCalledWith('fr-FR');
  });

  it('leaves the preference alone for a track that declares no language', () => {
    H.pb = makePb({ audioTracks: [{ index: 0, language: null, title: 'Commentary' }] });
    const { result } = render();
    result.current.controller.setAudio(0);
    expect(H.pb?.setAudio).toHaveBeenCalledWith(0);
    expect(H.rememberAudio).not.toHaveBeenCalled();
  });
});

describe('useWebController playbackMode', () => {
  it('is "direct" for a bare <video src>', () => {
    H.pb = makePb({ useHls: false });
    expect(render().result.current.playbackMode).toBe('direct');
  });
  it('is "transcode" for an AAC-master HLS stream', () => {
    H.pb = makePb({ useHls: true, aac: true });
    expect(render().result.current.playbackMode).toBe('transcode');
  });
  it('is "remux" for a stream-copy HLS master', () => {
    H.pb = makePb({ useHls: true, aac: false });
    expect(render().result.current.playbackMode).toBe('remux');
  });
});

describe('useWebController scrub', () => {
  it('previews a scrub position and commits it as a single seek', () => {
    const { result } = render();
    act(() => result.current.controller.scrubPreview(55));
    expect(result.current.controller.seekPreview).toBe(55);
    act(() => result.current.controller.scrubCommit());
    expect(H.pb?.seekTo).toHaveBeenCalledWith(55);
    expect(result.current.controller.seekPreview).toBeNull();
  });
});

describe('useWebController ended nonce', () => {
  it('bumps endedNonce when the element fires "ended"', () => {
    const { result } = render();
    expect(result.current.controller.endedNonce).toBe(0);
    expect(H.endedHandler).toBeTypeOf('function');
    act(() => H.endedHandler?.());
    expect(result.current.controller.endedNonce).toBe(1);
  });

  it('binds nothing before the element mounts', () => {
    H.pb = makePb({ videoRef: { current: null } });
    const { result } = render();
    expect(result.current.controller.endedNonce).toBe(0);
    expect(result.current.controller.pipActive).toBe(false);
    expect(H.handlers.ended).toBeUndefined();
  });

  it('drops a scrub commit that was never previewed', () => {
    const { result } = render();
    act(() => result.current.controller.scrubCommit());
    expect(H.pb?.seekTo).not.toHaveBeenCalled();
  });

  it('offers a bare quality label for a file with no codec badge', () => {
    H.badge = null;
    const { result } = render();
    expect(result.current.controller.qualities).toEqual([
      { id: 'auto', label: 'player.qualityAuto' },
    ]);
  });

  it('honours the shared contract for quality and engine picks', () => {
    const { result } = render();
    expect(() => result.current.controller.setQuality?.('auto')).not.toThrow();
    result.current.controller.setEngine?.('shaka');
    expect(H.pb?.setEnginePref).toHaveBeenCalledWith('shaka');
    expect(result.current.controller.engineId).toBe('auto');
    expect(result.current.controller.engines?.map((e) => e.id)).toEqual([
      'auto',
      'direct',
      'remux',
      'shaka',
    ]);
  });
});
