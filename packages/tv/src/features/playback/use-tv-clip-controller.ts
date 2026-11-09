import { type PlayerAudioTrack, type PlayerController, type PlayerSub, useT } from '@kromatv/ui';
import { useCallback, useMemo, useState } from 'react';
import type { ClipEngine } from '#tv/features/playback/player/clipBackend';
import type { ClipPlayback } from '#tv/features/playback/player/useClipPlayback';
import { useSeekGesture } from '#tv/features/playback/player/useSeekGesture';

const NOOP = (): undefined => undefined;

const NO_STATS = () => ({});

const NO_AUDIO: PlayerAudioTrack[] = [];

const NO_SUBTITLES: PlayerSub[] = [];

/** The shared player's controller over a clip such as a trailer: one picture,
 * one sound, nothing to resume and no session to report. Volume, fullscreen and
 * picture-in-picture belong to the television, so the TV flags hide them. */
export function useTvClipController<E extends ClipEngine>(clip: ClipPlayback<E>): PlayerController {
  const t = useT();
  const { engineRef, seekTo } = clip;
  const [rate, setRate] = useState(1);

  const duration = useCallback(() => engineRef.current?.duration() ?? 0, [engineRef]);
  const gesture = useSeekGesture({ duration, seekTo });

  const scrubPreview = useCallback(
    (abs: number | null) => {
      if (abs != null) gesture.scrub(abs);
    },
    [gesture],
  );

  const changeRate = useCallback(
    (next: number) => {
      setRate(next);
      engineRef.current?.setRate(next);
    },
    [engineRef],
  );

  const qualities = useMemo(() => [{ id: 'auto', label: t('player.qualityAuto') }], [t]);

  return {
    cur: clip.cur,
    dur: clip.dur,
    bufEnd: clip.bufEnd,
    seekPreview: gesture.preview,
    playing: clip.playing,
    waiting: clip.waiting,
    waitReason: clip.ready ? 'buffering' : 'loading',
    ready: clip.ready,
    error: clip.failed ? t('player.cantPlay') : null,
    errorHint: clip.failed ? t('player.cantPlayHint') : null,
    endedNonce: clip.endedNonce,
    surface: 'video',
    aspect: clip.aspect,
    togglePlay: clip.togglePlay,
    seekTo,
    skip: (delta) => seekTo((engineRef.current?.position() ?? clip.cur) + delta),
    scrubPreview,
    scrubCommit: gesture.commit,
    volume: 1,
    muted: false,
    setVolume: NOOP,
    toggleMute: NOOP,
    rate,
    setRate: changeRate,
    audioTracks: NO_AUDIO,
    audioIndex: 0,
    setAudio: NOOP,
    subtitles: NO_SUBTITLES,
    subtitleIndex: null,
    setSubtitle: NOOP,
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
    getStats: NO_STATS,
  };
}
