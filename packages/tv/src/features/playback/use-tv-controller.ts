import {
  type KromaClient,
  type MediaItem,
  qualityBadgeForVideo,
  refineTrackLang,
} from '@kroma/core';
import { buildLeanStats, type PlayerController, useAudioFilter, useT } from '@kroma/ui';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { availableEngines, ENGINE_LABEL_KEY, type EnginePref } from '#tv/app/enginePref';
import { useLangPrefs } from '#tv/app/langPref';
import { type Playback, useDirectPlayback } from '#tv/features/playback/player/useDirectPlayback';
import { type TvSubtitles, useTvSubtitles } from '#tv/features/playback/use-tv-subtitles';

/** The controls a television does not own (the set has the volume, there is no
 * PiP and it is already fullscreen; the native engines expose no rate). One
 * shared no-op, because a fresh `() => undefined` per render is a NEW prop on
 * every ~4 Hz playback tick, and `ControlCluster` is memoized precisely so it can
 * skip those - a transport row of ten focusables was reconciling for the whole
 * film. */
const NOOP = (): undefined => undefined;

export interface TvController {
  controller: PlayerController;
  /** Underlying engine hook (surface refs, resume, warn live in the wrapper). */
  pb: Playback;
  subtitleGen: TvSubtitles['subtitleGen'];
}

/**
 * Adapts the TV engine (`useDirectPlayback`, driving AVPlay / mpv / ExoPlayer /
 * hls.js) + subtitle state into the shared {@link PlayerController}. Volume, PiP
 * and fullscreen are TV-off (handled by the set / already fullscreen) and
 * playback speed is not exposed by the native engines - surfaced
 * honestly as no-ops so the shared chrome hides or disables them. Audio filters
 * work on EVERY surface: Web Audio on the in-page <video>, in-engine DSP on the
 * native planes.
 */
export function useTvController(client: KromaClient, item: MediaItem): TvController {
  const t = useT();
  // Preferred audio / subtitle language, on the ACCOUNT. Read here so a title
  // opens on the right tracks, and written back by the pickers below so the
  // choice made once in the player is the choice every later title starts from.
  const langs = useLangPrefs();
  const pb = useDirectPlayback(client, item, langs.audio);
  const subs = useTvSubtitles(client, item, langs);

  // Audio normalizer (§7), one persisted mode across every engine. The Web Audio
  // compressor taps the in-page <video> (HTML engine: legacy webOS, the macOS
  // desktop webview, a desktop browser); the native planes implement the same
  // modes in-engine (mpv `af`, ExoPlayer DynamicsProcessing, AVPlay via the
  // server's filtered remux), driven through the engine port below.
  const filter = useAudioFilter(pb.videoRef, `${item.id}:${pb.surface}`);
  const { setAudioFilter: pushEngineFilter, surface } = pb;
  useEffect(() => {
    if (surface !== 'video') pushEngineFilter(filter.mode);
  }, [surface, pushEngineFilter, filter.mode]);

  const scrubPreview = useCallback(
    (abs: number | null) => {
      if (abs != null) pb.seekScrub(abs);
    },
    [pb],
  );

  const qualities = useMemo(() => {
    const badge = qualityBadgeForVideo(item.video);
    const badgeSuffix = badge ? ` · ${badge}` : '';
    return [{ id: 'auto', label: `${t('player.qualityAuto')}${badgeSuffix}` }];
  }, [item.video, t]);

  // Engine picker (Settings): the engines this platform actually offers (Tizen ->
  // AVPlay/remux, webOS -> direct/remux, desktop -> direct/remux/mpv, ...). A
  // single-option list hides the row (nothing to switch).
  const engines = useMemo(() => {
    const list = availableEngines();
    return list.length > 1 ? list.map((id) => ({ id, label: t(ENGINE_LABEL_KEY[id]) })) : [];
  }, [t]);

  // Switching audio track is also how a viewer says "I watch in French": store
  // the track's language as the preference - REFINED by the dub variant its
  // title betrays ('fre' + "VFF …" → 'fr-FR'), so choosing the France dub can
  // never auto-pick the Quebec one on the next title. A track with no declared
  // language leaves the stored preference alone - nothing to learn from it.
  const { setAudio: pickAudio, audioTracks: tracks } = pb;
  const { setAudio: rememberAudio } = langs;
  const setAudio = useCallback(
    (index: number) => {
      pickAudio(index);
      const track = tracks.find((a) => a.index === index);
      const code = refineTrackLang(track?.language, track?.title);
      if (code) rememberAudio(code);
    },
    [pickAudio, rememberAudio, tracks],
  );

  const statsRef = useRef<() => ReturnType<typeof buildLeanStats>>(() => ({}));
  statsRef.current = () =>
    buildLeanStats({
      item,
      cur: pb.cur,
      dur: pb.dur,
      bufEnd: pb.bufEnd,
      audioTracks: pb.audioTracks,
      audioIndex: pb.audioIndex,
      video: pb.videoRef.current,
      mode: pb.surface,
      t,
    });
  const getStats = useCallback(() => statsRef.current(), []);
  const setEngine = useCallback((id: string) => pb.setEngine(id as EnginePref), [pb.setEngine]);

  const controller: PlayerController = {
    cur: pb.cur,
    dur: pb.dur,
    bufEnd: pb.bufEnd,
    seekPreview: pb.seekPreview,
    playing: pb.playing,
    waiting: pb.waiting,
    ready: pb.ready,
    error: null,
    endedNonce: pb.endedNonce,
    surface: pb.surface,
    togglePlay: pb.togglePlay,
    seekTo: pb.seekTo,
    skip: pb.seek,
    scrubPreview,
    scrubCommit: pb.seekScrubCommit,
    volume: 1,
    muted: false,
    setVolume: NOOP,
    toggleMute: NOOP,
    rate: 1,
    setRate: NOOP,
    audioTracks: pb.audioTracks,
    audioIndex: pb.audioIndex,
    setAudio,
    subtitles: subs.subtitles,
    subtitleIndex: subs.activeIndex,
    setSubtitle: subs.setActive,
    qualities,
    qualityId: 'auto',
    setQuality: NOOP,
    engines,
    engineId: pb.enginePref,
    setEngine,
    audioFilter: filter.mode,
    setAudioFilter: filter.setMode,
    // In-page <video> needs Web Audio; a native plane answers for its own DSP
    // (ExoPlayer has none before API 28 or on passthrough, and AVPlay loses it
    // when the server's filtered remux fails), so the row hides instead of
    // showing a mode that is doing nothing.
    audioFilterSupported: pb.surface === 'video' ? filter.supported : pb.audioFilterSupported,
    pipActive: false,
    togglePip: NOOP,
    fullscreen: false,
    toggleFullscreen: NOOP,
    setPlaneRect: pb.setPlaneRect,
    getStats,
  };

  return { controller, pb, subtitleGen: subs.subtitleGen };
}
