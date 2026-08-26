import {
  type KromaClient,
  type MediaItem,
  qualityBadgeForVideo,
  refineTrackLang,
} from '@kroma/core';
import { buildLeanStats, type PlayerController, useAudioFilter, useT } from '@kroma/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  availableEngines,
  ENGINE_LABEL_KEY,
  ENGINE_NOTE_KEY,
  type EnginePref,
} from '#tv/app/enginePref';
import { useLangPrefs } from '#tv/app/langPref';
import { type Playback, useDirectPlayback } from '#tv/features/playback/player/useDirectPlayback';
import { type TvSubtitles, useTvSubtitles } from '#tv/features/playback/use-tv-subtitles';

// Shared, because a fresh `() => undefined` per render is a new prop on every
// ~4 Hz playback tick and the memoized `ControlCluster` exists to skip those.
const NOOP = (): undefined => undefined;

// What the stats meter reads a healthy forward buffer against, per surface.
// libVLC keeps a 1.5s cache window BY DESIGN (`--network-caching=1500`, chosen
// against a TV box's memory), so the shared ten-second default would paint a
// perfectly good stream critical for its whole length.
const BUFFER_TARGET_SEC: Partial<Record<Playback['surface'], number>> = { vlc: 1.5 };

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

  // Only what this build actually compiled in: an engine the shell has no native
  // module for is not a choice, and listing it as one is a dead row on a remote.
  // Each carries a line saying what it does, since the names cannot.
  const engines = useMemo(
    () =>
      availableEngines().map((id) => ({
        id,
        label: t(ENGINE_LABEL_KEY[id]),
        note: t(ENGINE_NOTE_KEY[id]),
      })),
    [t],
  );

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

  // Speed is engine state, so it lives here rather than in the playback hook: only
  // an engine that implements `setRate` gets the row, and the value has to survive
  // the engine being rebuilt under it (a filter change reopens the stream).
  const [rate, setRate] = useState(1);
  // `engineRef` is a ref, so a rebuilt engine (a filter change reopens the stream)
  // is invisible here otherwise, and the new player would start back at 1x.
  // biome-ignore lint/correctness/useExhaustiveDependencies: audited - the nonce IS the trigger
  useEffect(() => {
    pb.engineRef.current?.setRate?.(rate);
  }, [pb.engineRef, rate, pb.surfaceNonce]);

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
      bufferTarget: BUFFER_TARGET_SEC[pb.surface],
      t,
      // Whatever only the running engine can answer (which plane, what its
      // decoder is doing), so the panel can say why a picture is not moving.
      extra: pb.engineRef.current?.debugRows?.().map((row) => ({ ...row, group: 'Engine' })),
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
    aspect: pb.aspect,
    togglePlay: pb.togglePlay,
    seekTo: pb.seekTo,
    skip: pb.seek,
    scrubPreview,
    scrubCommit: pb.seekScrubCommit,
    volume: 1,
    muted: false,
    setVolume: NOOP,
    toggleMute: NOOP,
    rate,
    setRate,
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
