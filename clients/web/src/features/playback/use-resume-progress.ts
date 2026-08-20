import { useCallback, useEffect, useState } from 'react';
import type { MovieView } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { useWatched } from '#web/shared/lib/watched';

export interface ResumeProgress {
  resumeAt: number | null;
  showResume: boolean;
  setShowResume: (v: boolean) => void;
}

/**
 * Per-user resume + progress persistence for the player. Fetches the saved
 * position, seeks to it once the media is ready (flashing a toast), and writes
 * progress every 10 s / on pause / on close clearing it once ~finished.
 */
export function useResumeProgress(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  item: MovieView,
  // Offset-aware position from useVideoPlayback; falls back to the raw <video>
  // timeline when omitted (single-stream direct-play).
  position?: { seekTo: (absSec: number) => void; getPosition: () => number },
): ResumeProgress {
  const { client, user } = useAuth();
  const { setWatched } = useWatched();
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [showResume, setShowResume] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    client
      .itemProgress(item.id)
      .then((p) => {
        if (cancelled || !p) return;
        const durMs = p.durationMs ?? item.durationMs ?? 0;
        const posSec = p.positionMs / 1000;
        if (posSec > 15 && (!durMs || p.positionMs < durMs * 0.95)) setResumeAt(posSec);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, user, item.id, item.durationMs]);

  // Flash the "resumed at …" toast. The actual resume is NOT a seek here: the
  // player attaches the source already anchored at the saved position (a fresh
  // attach), so there is no re-anchor that could leave the clock at 0:00.
  useEffect(() => {
    if (resumeAt == null) return;
    setShowResume(true);
    const hide = setTimeout(() => setShowResume(false), 6000);
    return () => clearTimeout(hide);
  }, [resumeAt]);

  const saveProgress = useCallback(() => {
    const v = videoRef.current;
    if (!v || !user) return;
    // ABSOLUTE position + catalogue runtime the seamless stream's own
    // currentTime/duration is relative to the -ss offset, so never use them here.
    const pos = position ? position.getPosition() : v.currentTime;
    const durSec = item.durationMs ? item.durationMs / 1000 : v.duration;
    if (!Number.isFinite(durSec) || durSec <= 0 || pos < 5) return;
    // ~Finished → mark watched (clears server-side resume too). Reaching the
    // credits marker counts as finished too: a binge auto-advance unmounts the
    // player there (below 97%), which would otherwise strand it as in-progress.
    const creditsMs = (item.markers ?? []).find((m) => m.kind === 'credits')?.startMs;
    const finished = pos > durSec * 0.97 || (creditsMs != null && pos >= creditsMs / 1000);
    if (finished) setWatched(item.id, true);
    else void client.saveProgress(item.id, pos * 1000, durSec * 1000).catch(() => undefined);
  }, [videoRef, client, user, item.id, item.durationMs, item.markers, position, setWatched]);

  useEffect(() => {
    if (!user) return;
    const v = videoRef.current;
    const interval = setInterval(saveProgress, 10000);
    const onUnload = () => saveProgress();
    const onEnded = () => setWatched(item.id, true);
    window.addEventListener('beforeunload', onUnload);
    v?.addEventListener('pause', saveProgress);
    v?.addEventListener('ended', onEnded);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', onUnload);
      v?.removeEventListener('pause', saveProgress);
      v?.removeEventListener('ended', onEnded);
      saveProgress(); // final save when leaving the player
    };
  }, [videoRef, user, saveProgress, setWatched, item.id]);

  return { resumeAt, showResume, setShowResume };
}
