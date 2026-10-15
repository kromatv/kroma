import { fileContainer, pictureBadge, type WatchReady } from '@kromatv/core';
import type { WatchSubtitles } from '@kromatv/core/react';
import {
  arrivalSubtitles,
  buildLeanStats,
  type PlayerController,
  type PlayerStats,
  useT,
} from '@kromatv/ui';
import { useCallback, useMemo, useRef } from 'react';
import type { WatchPlayback } from '#tv/features/playback/watch/useWatchPlayback';
import { watchAudioTracks } from '#tv/features/playback/watch/watchSource';

const NOOP = (): undefined => undefined;

interface WatchControllerOptions {
  pb: WatchPlayback;
  ready: WatchReady;
  title: string;
  audioIndex: number;
  setAudio: (index: number) => void;
  subs: WatchSubtitles;
  recovering: boolean;
}

export function useWatchController(opts: Readonly<WatchControllerOptions>): PlayerController {
  const { pb, ready, title, audioIndex, setAudio, subs, recovering } = opts;
  const failed = pb.failed && !recovering;
  const { probe } = ready;
  const t = useT();

  const qualities = useMemo(() => {
    const badge = pictureBadge(probe.video);
    return [
      {
        id: 'auto',
        label: badge ? `${t('player.qualityAuto')} · ${badge}` : t('player.qualityAuto'),
      },
    ];
  }, [probe.video, t]);

  const statsRef = useRef<() => PlayerStats>(() => ({}));
  statsRef.current = () =>
    buildLeanStats({
      item: { title, container: fileContainer(ready.target.file.name), video: probe.video },
      cur: pb.cur,
      dur: pb.dur,
      bufEnd: pb.bufEnd,
      audioTracks: watchAudioTracks(probe),
      audioIndex,
      video: pb.videoRef.current,
      mode: pb.surface,
      t,
      extra: pb.engineRef.current?.debugRows?.().map((row) => ({ ...row, group: 'Engine' })),
    });
  const getStats = useCallback(() => statsRef.current(), []);

  return {
    cur: pb.cur,
    dur: pb.dur,
    bufEnd: pb.bufEnd,
    seekPreview: pb.seekPreview,
    anchor: pb.anchor,
    playing: pb.playing,
    waiting: pb.waiting || recovering,
    ready: pb.ready,
    error: failed ? t('player.cantPlay') : null,
    errorHint: failed ? t('player.cantPlayHint') : null,
    endedNonce: pb.endedNonce,
    surface: pb.surface,
    aspect: pb.aspect,
    togglePlay: pb.togglePlay,
    seekTo: pb.seekTo,
    skip: pb.skip,
    scrubPreview: (abs) => {
      if (abs !== null) pb.scrub(abs);
    },
    scrubCommit: pb.scrubCommit,
    volume: 1,
    muted: false,
    setVolume: NOOP,
    toggleMute: NOOP,
    rate: pb.rate,
    setRate: pb.setRate,
    audioTracks: watchAudioTracks(probe),
    audioIndex,
    setAudio,
    ...arrivalSubtitles(subs),
    qualities,
    qualityId: 'auto',
    setQuality: NOOP,
    audioFilter: 'off',
    setAudioFilter: NOOP,
    audioFilterSupported: false,
    pipActive: false,
    togglePip: NOOP,
    fullscreen: false,
    toggleFullscreen: NOOP,
    getStats,
  };
}
