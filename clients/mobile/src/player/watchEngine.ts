import { readyMasterStart } from '@kromatv/core';
import { useVideoPlayer, type VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NATIVE_SEEK_AHEAD } from '#mobile/player/engine/types';
import type { WatchMaster } from '#mobile/player/watchSource';

const LANDING_SLACK_SEC = 1;
const LANDING_TRIES = 3;

export interface WatchEngine {
  player: VideoPlayer;
  cur: number;
  dur: number;
  anchor: number;
  buffered: number;
  playing: boolean;
  waiting: boolean;
  wanted: boolean;
  started: boolean;
  failed: boolean;
  rate: number;
  togglePlay(): void;
  seekTo(abs: number): void;
  skip(delta: number): void;
  setRate(rate: number): void;
  reload(atSec?: number): void;
  bufferedEnd(): number;
  shutdown(): void;
}

export interface WatchEngineSource {
  master: WatchMaster;
  durationSec: number;
  title: string;
  poster: string | null;
  onReanchor(absSec: number): void;
}

export function useWatchEngine(source: Readonly<WatchEngineSource>): WatchEngine {
  const { master, durationSec, title, poster, onReanchor } = source;
  const { uri, anchorSec } = master;
  const [cur, setCur] = useState(anchorSec);
  const [dur, setDur] = useState(durationSec);
  const [buffered, setBuffered] = useState(anchorSec);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [wanted, setWanted] = useState(true);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rate, setRateState] = useState(1);
  const [openedAt, setOpenedAt] = useState(anchorSec);
  const offset = useRef(anchorSec);
  const rated = useRef(1);
  const opening = useRef(0);
  const landing = useRef<{ at: number; tries: number } | null>(null);
  const shown = useRef({ title, poster });
  shown.current = { title, poster };

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
  });

  const open = useCallback(
    (atSec: number | null) => {
      opening.current += 1;
      const mine = opening.current;
      setWaiting(true);
      setStarted(false);
      setFailed(false);
      void readyMasterStart(uri, anchorSec)
        .then((real) => {
          if (opening.current !== mine) return;
          offset.current = real;
          landing.current = { at: atSec === null ? 0 : Math.max(0, atSec - real), tries: 0 };
          setOpenedAt(real);
          const { title: named, poster: art } = shown.current;
          return player
            .replaceAsync({ uri, metadata: { title: named, artwork: art ?? undefined } })
            .then(() => {
              if (opening.current !== mine) return;
              if (rated.current !== 1) player.playbackRate = rated.current;
              player.play();
            });
        })
        .catch(() => undefined);
    },
    [player, uri, anchorSec],
  );

  useEffect(() => {
    open(null);
    return () => {
      opening.current += 1;
    };
  }, [open]);

  const reload = useCallback((atSec?: number) => open(atSec ?? null), [open]);

  useEffect(() => {
    const subs = [
      player.addListener('statusChange', ({ status }) => {
        if (status === 'error') {
          setFailed(true);
          setWaiting(false);
          return;
        }
        if (status === 'loading') setWaiting(true);
        if (status === 'readyToPlay') {
          setWaiting(false);
          setFailed(false);
          if (durationSec <= 0 && player.duration > 0) setDur(offset.current + player.duration);
        }
      }),
      player.addListener('timeUpdate', ({ currentTime, bufferedPosition }) => {
        const land = landing.current;
        if (land && Math.abs(currentTime - land.at) > LANDING_SLACK_SEC) {
          if (land.tries < LANDING_TRIES) {
            land.tries += 1;
            player.currentTime = land.at;
            return;
          }
          landing.current = null;
        } else if (land && player.playing) {
          landing.current = null;
        }
        setCur(offset.current + currentTime);
        setBuffered(offset.current + Math.max(currentTime, bufferedPosition));
      }),
      player.addListener('playingChange', ({ isPlaying }) => {
        setPlaying(isPlaying);
        if (!isPlaying) return;
        setWanted(true);
        setStarted(true);
      }),
    ];
    return () => {
      for (const sub of subs) sub.remove();
    };
  }, [player, durationSec]);

  const shutdown = useCallback(() => {
    opening.current += 1;
    void Promise.resolve()
      .then(() => {
        player.muted = true;
        player.pause();
        return player.replaceAsync(null);
      })
      .catch(() => undefined);
  }, [player]);

  useEffect(() => () => shutdown(), [shutdown]);

  const togglePlay = useCallback(() => {
    const pausing = player.playing;
    if (pausing) player.pause();
    else player.play();
    setWanted(!pausing);
  }, [player]);

  const seekTo = useCallback(
    (abs: number) => {
      const target = Math.max(0, Math.min(abs, dur > 0 ? dur - 1 : abs));
      const base = offset.current;
      landing.current = null;
      if (target < base || target > base + player.currentTime + NATIVE_SEEK_AHEAD) {
        onReanchor(target);
        return;
      }
      player.currentTime = target - base;
      setCur(target);
    },
    [player, dur, onReanchor],
  );

  const skip = useCallback(
    (delta: number) => seekTo(offset.current + player.currentTime + delta),
    [player, seekTo],
  );

  const setRate = useCallback(
    (next: number) => {
      rated.current = next;
      player.playbackRate = next;
      setRateState(next);
    },
    [player],
  );

  const bufferedEnd = useCallback(() => {
    const end = player.bufferedPosition;
    return end > 0 ? offset.current + end : Number.NaN;
  }, [player]);

  return {
    player,
    cur,
    dur,
    anchor: openedAt,
    buffered,
    playing,
    waiting,
    wanted,
    started,
    failed,
    rate,
    togglePlay,
    seekTo,
    skip,
    setRate,
    reload,
    bufferedEnd,
    shutdown,
  };
}
