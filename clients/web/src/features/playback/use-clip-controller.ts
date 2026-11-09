import { reachableBufferEnd } from '@kromatv/core';
import { type PlayerController, type PlayerStats, useT } from '@kromatv/ui';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useFullscreenFrame } from '#web/features/playback/fullscreen-frame';

export interface ClipController {
  controller: PlayerController;
  videoRef: RefObject<HTMLVideoElement | null>;
}

interface ClipState {
  cur: number;
  dur: number;
  bufEnd: number;
  playing: boolean;
  waiting: boolean;
  ready: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  aspect: number | undefined;
  failed: boolean;
}

const START: ClipState = {
  cur: 0,
  dur: 0,
  bufEnd: 0,
  playing: false,
  waiting: true,
  ready: false,
  volume: 1,
  muted: false,
  rate: 1,
  aspect: undefined,
  failed: false,
};

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

function useClipState(videoRef: RefObject<HTMLVideoElement | null>, src: string | null) {
  const [state, setState] = useState<ClipState>(START);
  const [endedNonce, setEndedNonce] = useState(0);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    const patch = (next: Partial<ClipState>) => setState((s) => ({ ...s, ...next }));
    let started = false;
    const handlers: [string, () => void][] = [
      ['timeupdate', () => patch({ cur: v.currentTime })],
      ['durationchange', () => patch({ dur: Number.isFinite(v.duration) ? v.duration : 0 })],
      ['progress', () => patch({ bufEnd: reachableBufferEnd(v.buffered, v.currentTime) })],
      ['playing', () => patch({ playing: true, waiting: false })],
      ['pause', () => patch({ playing: false })],
      ['waiting', () => patch({ waiting: true })],
      ['seeked', () => patch({ waiting: false, cur: v.currentTime })],
      ['volumechange', () => patch({ volume: v.volume, muted: v.muted })],
      ['ratechange', () => patch({ rate: v.playbackRate })],
      ['error', () => patch({ failed: true, waiting: false })],
      ['ended', () => setEndedNonce((n) => n + 1)],
      [
        'loadedmetadata',
        () => patch({ aspect: v.videoHeight > 0 ? v.videoWidth / v.videoHeight : undefined }),
      ],
      [
        'canplay',
        () => {
          patch({ ready: true, waiting: false });
          if (started) return;
          started = true;
          v.play()?.catch(() => patch({ playing: false }));
        },
      ],
    ];
    for (const [name, handler] of handlers) v.addEventListener(name, handler);
    return () => {
      for (const [name, handler] of handlers) v.removeEventListener(name, handler);
    };
  }, [videoRef, src]);
  return { state, endedNonce };
}

function useFullscreen() {
  const frame = useFullscreenFrame();
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const read = () => setFullscreen(document.fullscreenElement != null);
    document.addEventListener('fullscreenchange', read);
    return () => document.removeEventListener('fullscreenchange', read);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void frame?.current?.requestFullscreen().catch(() => undefined);
  };
  return { fullscreen, toggle };
}

function usePip(videoRef: RefObject<HTMLVideoElement | null>, src: string | null) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    const enter = () => setActive(true);
    const leave = () => setActive(false);
    v.addEventListener('enterpictureinpicture', enter);
    v.addEventListener('leavepictureinpicture', leave);
    return () => {
      v.removeEventListener('enterpictureinpicture', enter);
      v.removeEventListener('leavepictureinpicture', leave);
    };
  }, [videoRef, src]);
  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!document.pictureInPictureEnabled || !v) return;
    if (document.pictureInPictureElement)
      void document.exitPictureInPicture().catch(() => undefined);
    else void v.requestPictureInPicture().catch(() => undefined);
  }, [videoRef]);
  return { active, toggle };
}

/** The shared player's controller over one plain `<video>` playing `src`, a
 * short clip such as a trailer: one picture, one sound, nothing to resume and no
 * session to report. `src` null holds the chrome in its loading state. */
export function useClipController(src: string | null): ClipController {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { state, endedNonce } = useClipState(videoRef, src);
  const fs = useFullscreen();
  const pip = usePip(videoRef, src);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const previewRef = useRef<number | null>(null);

  const seekTo = useCallback(
    (abs: number) => {
      const v = videoRef.current;
      if (v) v.currentTime = clamp(abs, Number.isFinite(v.duration) ? v.duration : abs);
    },
    [videoRef],
  );

  const controller: PlayerController = {
    cur: state.cur,
    dur: state.dur,
    bufEnd: state.bufEnd,
    seekPreview,
    playing: state.playing,
    waiting: src == null || state.waiting,
    waitReason: state.ready ? 'buffering' : 'loading',
    ready: state.ready,
    error: state.failed ? t('player.cantPlay') : null,
    errorHint: state.failed ? t('player.cantPlayHint') : null,
    endedNonce,
    surface: 'video',
    aspect: state.aspect,
    togglePlay: () => {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) v.play()?.catch(() => undefined);
      else v.pause();
    },
    seekTo,
    skip: (delta) => seekTo((videoRef.current?.currentTime ?? 0) + delta),
    scrubPreview: (abs) => {
      previewRef.current = abs;
      setSeekPreview(abs);
    },
    scrubCommit: () => {
      const target = previewRef.current;
      previewRef.current = null;
      setSeekPreview(null);
      if (target != null) seekTo(target);
    },
    volume: state.volume,
    muted: state.muted,
    setVolume: (value) => {
      const v = videoRef.current;
      if (!v) return;
      v.volume = clamp(value, 1);
      if (value > 0) v.muted = false;
    },
    toggleMute: () => {
      const v = videoRef.current;
      if (v) v.muted = !v.muted;
    },
    rate: state.rate,
    setRate: (rate) => {
      const v = videoRef.current;
      if (v) v.playbackRate = rate;
    },
    audioTracks: [],
    audioIndex: 0,
    setAudio: () => undefined,
    subtitles: [],
    subtitleIndex: null,
    setSubtitle: () => undefined,
    qualities: [{ id: 'auto', label: t('player.qualityAuto') }],
    qualityId: 'auto',
    setQuality: () => undefined,
    audioFilter: 'off',
    setAudioFilter: () => undefined,
    audioFilterSupported: false,
    pipActive: pip.active,
    togglePip: pip.toggle,
    fullscreen: fs.fullscreen,
    toggleFullscreen: fs.toggle,
    getStats: (): PlayerStats => {
      const v = videoRef.current;
      return v && v.videoWidth > 0 ? { resolution: `${v.videoWidth}×${v.videoHeight}` } : {};
    },
  };

  return { controller, videoRef };
}
