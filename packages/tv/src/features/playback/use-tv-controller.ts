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

// Shared, because a fresh `() => undefined` per render is a new prop on every
// ~4 Hz playback tick and the memoized `ControlCluster` exists to skip those.
const NOOP = (): undefined => undefined;

export interface TvController {
  controller: PlayerController;
  pb: Playback;
  subtitleGen: TvSubtitles['subtitleGen'];
}

/**
 * Adapts the TV engine + subtitle state into the shared {@link PlayerController}.
 * Volume, PiP, fullscreen and rate are no-ops on a TV, so the shared chrome hides
 * or disables them.
 */
export function useTvController(client: KromaClient, item: MediaItem): TvController {
  const t = useT();
  const langs = useLangPrefs();
  const pb = useDirectPlayback(client, item, langs.audio);
  const subs = useTvSubtitles(client, item, langs);

  // One persisted mode across every engine: Web Audio taps the in-page <video>,
  // the native planes implement the same modes in-engine.
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

  // An empty list hides the picker row: a single option is nothing to switch.
  const engines = useMemo(() => {
    const list = availableEngines();
    return list.length > 1 ? list.map((id) => ({ id, label: t(ENGINE_LABEL_KEY[id]) })) : [];
  }, [t]);

  // Picking a track also sets the account's language preference, refined by the
  // dub variant its title betrays ('fre' + "VFF …" → 'fr-FR') so the France dub
  // never auto-picks the Quebec one on the next title.
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
    // A native plane answers for its own DSP (ExoPlayer has none before API 28 or
    // on passthrough), so the row hides rather than showing a dead mode.
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
