import { useCallback, useEffect, useState } from 'react';
import type { MovieView } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { useWatched } from '#web/shared/lib/watched';

/**
 * Per-user resume + progress persistence for the player. Answers the second the
 * film opened on, and writes progress every 10 s / on pause / on close. The server
 * decides when a position counts as watched and says so in its answer.
 */
export function useResumeProgress(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  item: MovieView,
  // Offset-aware position from useVideoPlayback; falls back to the raw <video>
  // timeline when omitted (single-stream direct-play).
  position?: { getPosition: () => number },
): number | null {
  const { client, user } = useAuth();
  const { setWatched, noteWatched } = useWatched();
  const [resumeAt, setResumeAt] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    client.playback
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

  const saveProgress = useCallback(() => {
    const v = videoRef.current;
    if (!v || !user) return;
    // ABSOLUTE position + catalogue runtime the seamless stream's own
    // currentTime/duration is relative to the -ss offset, so never use them here.
    const pos = position ? position.getPosition() : v.currentTime;
    const durSec = item.durationMs ? item.durationMs / 1000 : v.duration;
    if (!Number.isFinite(durSec) || durSec <= 0 || pos < 5) return;
    client.playback
      .save(item.id, pos * 1000, durSec * 1000)
      .then((receipt) => {
        if (receipt.watched) noteWatched(item.id);
      })
      .catch(() => undefined);
  }, [videoRef, client, user, item.id, item.durationMs, position, noteWatched]);

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

  return resumeAt;
}
