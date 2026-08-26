import {
  audioTrackLabel,
  declaredAspect,
  qualityBadgeForVideo,
  refineTrackLang,
} from '@kroma/core';
import {
  type PlayerController,
  type PlayerStats,
  type SubtitleGenBundle,
  useAudioFilter,
  useLocale,
  useT,
} from '@kroma/ui';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isWebEnginePref } from '#web/features/playback/engine-pref';
import { makeFpsSampler, readEngineStats } from '#web/features/playback/engine-stats';
import { useVideoPlayback } from '#web/features/playback/use-video-playback';
import { useWebSubtitles } from '#web/features/playback/use-web-subtitles';
import { buildWebStats } from '#web/features/playback/web-stats';
import type { MovieView } from '#web/shared/lib/api';
import { useLangPrefs } from '#web/shared/lib/lang-pref';

export interface WebController {
  controller: PlayerController;
  videoRef: RefObject<HTMLVideoElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  pb: ReturnType<typeof useVideoPlayback>;
  subtitleGen: SubtitleGenBundle;
  subtitleLabel: string;
  audioLabel: string | undefined;
  playbackMode: 'direct' | 'remux' | 'transcode';
}

/**
 * Adapts the web engine (`useVideoPlayback`) + subtitle / audio-filter /
 * scrub / stats state into the shared {@link PlayerController} the unified
 * `<Player>` consumes. Everything web-specific (HLS remux, PiP-as-shell, the
 * one-shot bitrate probe) is hidden behind the contract.
 */
export function useWebController(item: MovieView): WebController {
  const t = useT();
  const locale = useLocale();
  const pb = useVideoPlayback(item);
  const subs = useWebSubtitles(item, t);
  const filter = useAudioFilter(pb.videoRef, `${pb.anchor}:${pb.audioIndex}`);

  // Switching audio track also stores the language as the preference, refined
  // by the dub variant its title betrays ('fre' + "VFF …" → 'fr-FR'). A track
  // with no declared language leaves the stored preference alone.
  const { setAudio: rememberAudio } = useLangPrefs();
  const { setAudio: pickAudio, audioTracks } = pb;
  const setAudio = useCallback(
    (index: number) => {
      pickAudio(index);
      const track = audioTracks.find((a) => a.index === index);
      const code = refineTrackLang(track?.language, track?.title);
      if (code) rememberAudio(code);
    },
    [pickAudio, rememberAudio, audioTracks],
  );

  const [scrubSec, setScrubSec] = useState<number | null>(null);
  const scrubRef = useRef<number | null>(null);
  const scrubPreview = useCallback((abs: number | null) => {
    scrubRef.current = abs;
    setScrubSec(abs);
  }, []);
  const scrubCommit = useCallback(() => {
    const s = scrubRef.current;
    scrubRef.current = null;
    setScrubSec(null);
    if (s != null) pb.seekTo(s);
  }, [pb]);

  // Native Picture-in-Picture (the browser's own floating window). The <video>
  // is keyed by anchor+audio, so the pip listeners rebind to each fresh element.
  const [pipActive, setPipActive] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: anchor/audioIndex are intentional remount triggers, not read values. The <video> is keyed by anchor+audio, so re-anchoring / switching audio mounts a fresh element the pip listeners must rebind to. Depending on `pb` itself would rerun on every render.
  useEffect(() => {
    const v = pb.videoRef.current;
    if (!v) return;
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    v.addEventListener('enterpictureinpicture', onEnter);
    v.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnter);
      v.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, [pb.anchor, pb.audioIndex, pb.videoRef]);
  const togglePip = useCallback(() => {
    const v = pb.videoRef.current;
    if (!document.pictureInPictureEnabled || !v) return;
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => undefined);
    } else {
      void v.requestPictureInPicture().catch(() => undefined);
    }
  }, [pb.videoRef]);

  // The picture's shape, so the chrome can hug it before a frame is decoded.
  // `videoWidth/videoHeight` is the DISPLAY size, anamorphic storage already
  // corrected, which the catalog's dimensions are not, so the element wins as
  // soon as it can answer. `resize` fires on every variant switch, not just the
  // first metadata.
  const [decodedAspect, setDecodedAspect] = useState<number | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: anchor/audioIndex are intentional remount triggers, not read values. The <video> is keyed by anchor+audio, so re-anchoring / switching audio mounts a fresh element the `resize` listener must rebind to. Depending on `pb` itself would rerun on every render.
  useEffect(() => {
    const v = pb.videoRef.current;
    if (!v) return;
    const read = () =>
      setDecodedAspect(v.videoHeight > 0 ? v.videoWidth / v.videoHeight : undefined);
    read();
    v.addEventListener('resize', read);
    v.addEventListener('loadedmetadata', read);
    return () => {
      v.removeEventListener('resize', read);
      v.removeEventListener('loadedmetadata', read);
    };
  }, [pb.anchor, pb.audioIndex, pb.videoRef]);

  // Natural-end nonce (autoplay trigger), rebinding on remount.
  const [endedNonce, setEndedNonce] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: anchor/audioIndex are intentional remount triggers, not read values. The <video> is keyed by anchor+audio, so re-anchoring / switching audio mounts a fresh element the `ended` listener must rebind to. Depending on `pb` itself would rerun on every render.
  useEffect(() => {
    const v = pb.videoRef.current;
    if (!v) return;
    const onEnded = () => setEndedNonce((n) => n + 1);
    v.addEventListener('ended', onEnded);
    return () => v.removeEventListener('ended', onEnded);
  }, [pb.anchor, pb.audioIndex, pb.videoRef]);

  const [bytes, setBytes] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch(item.stream, { headers: { Range: 'bytes=0-1' } })
      .then((r) => {
        const cr = r.headers.get('Content-Range');
        const total = cr ? Number(cr.split('/')[1]) : Number(r.headers.get('Content-Length') ?? 0);
        if (!cancelled && Number.isFinite(total) && total > 0) setBytes(total);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [item.stream]);

  const fpsSamplerRef = useRef(makeFpsSampler());
  const statsRef = useRef<() => PlayerStats>(() => ({}));
  statsRef.current = () =>
    buildWebStats({
      v: pb.videoRef.current,
      item,
      cur: pb.cur,
      dur: pb.dur,
      bufEnd: pb.bufEnd,
      useHls: pb.useHls,
      aac: pb.aac,
      anchor: pb.anchor,
      baseSec: pb.baseSec,
      audioTracks: pb.audioTracks,
      audioIndex: pb.audioIndex,
      fps: fpsSamplerRef.current(pb.videoRef.current),
      engine: readEngineStats(pb.hlsRef.current, pb.shakaRef.current),
      bytes,
      t,
      locale,
    });
  const getStats = useCallback(() => statsRef.current(), []);

  const qualities = useMemo(() => {
    const badge = qualityBadgeForVideo(item.video);
    const badgeSuffix = badge ? ` · ${badge}` : '';
    return [{ id: 'auto', label: `${t('player.qualityAuto')}${badgeSuffix}` }];
  }, [item.video, t]);

  const engines = useMemo(
    () => [
      { id: 'auto', label: t('playbackEngine.auto') },
      { id: 'direct', label: t('playbackEngine.webview') },
      { id: 'remux', label: t('playbackEngine.remux') },
      { id: 'shaka', label: t('playbackEngine.shaka') },
    ],
    [t],
  );

  const controller: PlayerController = {
    cur: pb.cur,
    dur: pb.dur,
    bufEnd: pb.bufEnd,
    seekPreview: scrubSec,
    playing: pb.playing,
    waiting: pb.waiting,
    ready: pb.ready,
    error: null,
    endedNonce,
    surface: 'video',
    aspect: decodedAspect ?? declaredAspect(item),
    togglePlay: pb.togglePlay,
    seekTo: pb.seekTo,
    skip: pb.skip,
    scrubPreview,
    scrubCommit,
    volume: pb.volume,
    muted: pb.muted,
    setVolume: pb.setVol,
    toggleMute: pb.toggleMute,
    rate: pb.rate,
    setRate: pb.applyRate,
    audioTracks: pb.audioTracks,
    audioIndex: pb.audioIndex,
    setAudio,
    subtitles: subs.subtitles,
    subtitleIndex: subs.activeIndex,
    setSubtitle: subs.setActive,
    qualities,
    qualityId: 'auto',
    setQuality: () => undefined,
    engines,
    engineId: pb.enginePref,
    setEngine: (id: string) => {
      if (isWebEnginePref(id)) pb.setEnginePref(id);
    },
    audioFilter: filter.mode,
    setAudioFilter: filter.setMode,
    audioFilterSupported: filter.supported,
    pipActive,
    togglePip,
    fullscreen: pb.fs,
    toggleFullscreen: pb.toggleFullscreen,
    getStats,
  };

  const audioLabel = audioTrackLabel(
    t,
    pb.audioTracks.find((a) => a.index === pb.audioIndex),
  );
  let playbackMode: 'direct' | 'remux' | 'transcode';
  if (!pb.useHls) playbackMode = 'direct';
  else if (pb.aac) playbackMode = 'transcode';
  else playbackMode = 'remux';

  return {
    controller,
    videoRef: pb.videoRef,
    containerRef: pb.containerRef,
    pb,
    subtitleGen: subs.subtitleGen,
    subtitleLabel: subs.label,
    audioLabel,
    playbackMode,
  };
}
