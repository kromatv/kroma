import { useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Transport } from '#mobile/player/engine';
import { stopNativePlayer } from '#mobile/player/engine/shutdown';
import { patchPlayer } from '#mobile/player/engine/types';
import { usePlaybackOwner } from '#mobile/player/playback-owner';

const END_SLACK_SEC = 5;
const STARTED_AFTER_SEC = 0.5;
const STALL_JUMP_SEC = 2;

interface ClipEngine extends Transport {
  failed: boolean;
  endedNonce: number;
  shutdown(): void;
}

/** The phone player over one plain progressive file, such as a trailer: no
 * remux, no track to switch and nothing to resume or report. `uri` null holds it
 * waiting; the first one opens and plays. It takes the app's single playback
 * lease, so whatever else was playing stops. */
export function useClipEngine(uri: string | null, title: string): ClipEngine {
  const core = useRef({ active: true, started: false, autoplayed: false, at: 0 });
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [failed, setFailed] = useState(false);
  const [endedNonce, setEndedNonce] = useState(0);

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
  });

  const shutdown = useCallback(() => {
    if (!core.current.active) return;
    core.current.active = false;
    stopNativePlayer(player);
  }, [player]);
  usePlaybackOwner(shutdown);

  const fail = useCallback(() => {
    if (!core.current.active) return;
    shutdown();
    setFailed(true);
    setWaiting(false);
    setPlaying(false);
  }, [shutdown]);

  useEffect(() => {
    if (!uri || !core.current.active) return;
    void player
      .replaceAsync({ uri, metadata: { title } })
      .catch(fail)
      .finally(() => {
        if (!core.current.active) stopNativePlayer(player);
      });
  }, [uri, title, player, fail]);

  useEffect(() => {
    const live = () => core.current.active;
    const subs = [
      player.addListener('statusChange', ({ status }) => {
        if (!live()) return;
        if (status === 'error') {
          fail();
          return;
        }
        if (status === 'loading') setWaiting(true);
        if (status !== 'readyToPlay') return;
        setWaiting(false);
        if (player.duration > 0) setDur(player.duration);
        if (core.current.autoplayed) return;
        core.current.autoplayed = true;
        player.play();
      }),
      player.addListener('timeUpdate', ({ currentTime, bufferedPosition }) => {
        if (!live()) return;
        const advanced = currentTime - core.current.at;
        if (player.playing && advanced > 0 && advanced < STALL_JUMP_SEC) setWaiting(false);
        if (currentTime > STARTED_AFTER_SEC) core.current.started = true;
        core.current.at = currentTime;
        setCur(currentTime);
        setBuffered(Math.max(currentTime, bufferedPosition));
      }),
      player.addListener('playingChange', ({ isPlaying }) => {
        if (live()) setPlaying(isPlaying);
      }),
      player.addListener('playToEnd', () => {
        if (!live() || !core.current.started) return;
        const end = Math.max(player.duration, 0);
        if (end > 0 && player.currentTime < end - END_SLACK_SEC) return;
        setEndedNonce((n) => n + 1);
      }),
    ];
    return () => {
      for (const sub of subs) sub.remove();
    };
  }, [player, fail]);

  const seekTo = useCallback(
    (abs: number) => {
      if (!core.current.active) return;
      const end = player.duration;
      const clamped = Math.max(0, end > 0 ? Math.min(abs, end - 1) : abs);
      patchPlayer(player, { currentTime: clamped });
      core.current.at = clamped;
      setCur(clamped);
    },
    [player],
  );

  const skip = useCallback((delta: number) => seekTo(core.current.at + delta), [seekTo]);

  const togglePlay = useCallback(() => {
    if (!core.current.active) return;
    if (player.playing) player.pause();
    else player.play();
  }, [player]);

  return {
    player,
    cur,
    dur,
    buffered,
    playing,
    waiting,
    failed,
    endedNonce,
    togglePlay,
    seekTo,
    skip,
    shutdown,
  };
}
