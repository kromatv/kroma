// The mobile playback engine: the TV clients' base-engine model (see
// packages/tv/src/features/playback/player/baseEngine.ts) ported onto
// expo-video (AVPlayer on iOS, ExoPlayer on Android).
//
// Two modes over one absolute clock:
//   direct: the ORIGINAL file, fully seekable, absolute timeline.
//   master: the server's continuous HLS remux anchored at `baseSec`; its clock
//           restarts at 0 so the absolute position is `baseSec + currentTime`.
// Far/backward seeks and audio switches on the master re-anchor (reload at a
// new anchor); a direct file the decoder rejects falls back to the master ONCE
// at the same position, and a failing copy-audio master retries ONCE as AAC.

import type { KromaClient, MediaItem } from '@kroma/core';
import { type AudioTrack, useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decideSource } from '#mobile/player/caps';
import { useEngineControls } from './controls';
import {
  type AudioFilterMode,
  type Engine,
  type EngineCore,
  nativeTrackKey,
  resolveMasterStart,
} from './types';

export type { AudioFilterMode, Engine, EngineState } from './types';

export function useKromaEngine(
  client: KromaClient,
  item: MediaItem,
  startSec: number,
  /** Local file to play instead of the server (offline download). */
  localUri?: string,
): Engine {
  const decision = useMemo(() => decideSource(item), [item]);
  const core = useRef<EngineCore>({
    mode: localUri || decision.direct ? 'direct' : 'master',
    baseSec: 0,
    elSec: 0,
    bufSec: 0,
    fellBack: false,
    forceAac: decision.aacMaster,
    resumeOnLoad: true,
    pendingSeek: decision.direct && startSec > 0 ? startSec : null,
    audioIndex: 0,
    filter: 'off',
    loadId: 0,
    started: false,
  }).current;

  const [cur, setCur] = useState(startSec);
  const [buffered, setBuffered] = useState(startSec);
  const [dur, setDur] = useState((item.durationMs ?? 0) / 1000);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [endedNonce, setEndedNonce] = useState(0);
  const [mode, setMode] = useState(core.mode);
  const [audioIndex, setAudioIndex] = useState(0);
  const [localAudio, setLocalAudio] = useState<AudioTrack[]>([]);
  const [filter, setFilter] = useState<AudioFilterMode>('off');
  const [rate, setRate] = useState(1);

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
  });

  const sourceUrl = useCallback((): string => {
    if (localUri) return localUri;
    if (core.mode === 'direct') return client.streamUrl(item.id);
    const f = core.filter === 'off' ? undefined : core.filter;
    return client.hlsMasterUrl(item.id, core.forceAac, core.baseSec, core.audioIndex, f);
  }, [client, item.id, core, localUri]);

  /** (Re)load the current mode's source. Master anchors resolve their REAL
   * keyframe start first so the absolute clock stays honest. */
  const load = useCallback(
    async (absSec: number) => {
      const id = ++core.loadId;
      setWaiting(true);
      setReady(false);
      let uri: string;
      if (core.mode === 'direct') {
        core.baseSec = 0;
        core.pendingSeek = absSec > 0 ? absSec : null;
        uri = sourceUrl();
      } else {
        core.baseSec = absSec;
        core.pendingSeek = null;
        uri = sourceUrl();
        core.baseSec = await resolveMasterStart(uri, absSec);
        uri = sourceUrl();
      }
      if (id !== core.loadId) return;
      core.elSec = 0;
      core.started = false;
      core.resumeOnLoad = true;
      setMode(core.mode);
      setCur(core.baseSec + (core.pendingSeek ?? 0));
      const meta = item.metadata;
      await player
        .replaceAsync({
          uri,
          metadata: {
            title: meta?.title ?? item.title,
            artist: item.showTitle ?? undefined,
            artwork: client.resolveArt(meta?.posterUrl) ?? undefined,
          },
        })
        .catch(() => id === core.loadId && setFailed(true));
    },
    [core, player, sourceUrl, client, item],
  );

  /** Prepare/playback failure ladder: direct falls back to the master once;
   * a copy-audio master retries once as AAC; anything else surfaces. */
  const fail = useCallback(() => {
    if (localUri) {
      // Offline: there is no server to fall back to.
      setFailed(true);
      setWaiting(false);
      return;
    }
    const pos = core.baseSec + core.elSec;
    if (core.mode === 'direct' && !core.fellBack) {
      core.fellBack = true;
      core.mode = 'master';
      void load(pos);
      return;
    }
    if (core.mode === 'master' && !core.forceAac) {
      core.forceAac = true;
      void load(pos);
      return;
    }
    setFailed(true);
    setWaiting(false);
  }, [core, load, localUri]);

  useEffect(() => {
    const subs = [
      player.addListener('statusChange', ({ status }) => {
        if (status === 'error') {
          fail();
          return;
        }
        if (status === 'loading') setWaiting(true);
        if (status === 'readyToPlay') {
          setReady(true);
          setWaiting(false);
          setFailed(false);
          // Local files: surface the tracks actually in the file (iOS often
          // has them ready here without ever firing the change event).
          if (localUri) setLocalAudio(player.availableAudioTracks);
          if (core.pendingSeek != null) {
            player.currentTime = core.pendingSeek;
            core.elSec = core.pendingSeek;
            core.pendingSeek = null;
          }
          if (core.mode === 'direct' && player.duration > 0) setDur(player.duration);
          if (core.resumeOnLoad) {
            core.resumeOnLoad = false;
            player.play();
          }
        }
      }),
      player.addListener('timeUpdate', ({ currentTime, bufferedPosition }) => {
        if (currentTime > 0.5) core.started = true;
        core.elSec = currentTime;
        core.bufSec = Math.max(0, bufferedPosition);
        setCur(core.baseSec + currentTime);
        setBuffered(core.baseSec + Math.max(currentTime, core.bufSec));
      }),
      player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying)),
      // ExoPlayer reports ENDED for the empty initial source and again on every
      // source swap, so a bare event is NOT proof playback reached the end: on
      // Android it fired ~10ms after each load and cascaded the up-next chain
      // (or popped the screen for a movie). Only trust it once this source has
      // actually produced playback time and the clock sits near the end.
      player.addListener('playToEnd', () => {
        if (!core.started) return;
        const end = Math.max(player.duration, 0);
        if (end > 0 && player.currentTime < end - 5) return;
        setEndedNonce((n) => n + 1);
      }),
      player.addListener('availableAudioTracksChange', ({ availableAudioTracks }) => {
        if (localUri) setLocalAudio(availableAudioTracks);
      }),
      // Keep the selected ordinal honest whichever side initiated the switch
      // (our setter, the system Now Playing UI, or the platform's default pick).
      player.addListener('audioTrackChange', ({ audioTrack }) => {
        if (!localUri || !audioTrack) return;
        const i = player.availableAudioTracks.findIndex(
          (t) => nativeTrackKey(t) === nativeTrackKey(audioTrack),
        );
        if (i >= 0) {
          core.audioIndex = i;
          setAudioIndex(i);
        }
      }),
    ];
    return () => {
      for (const s of subs) s.remove();
    };
  }, [player, core, fail, localUri]);

  // Initial open (and re-open if the item itself changes).
  // biome-ignore lint/correctness/useExhaustiveDependencies: open once per item; startSec/load must not re-trigger a reload mid-playback
  useEffect(() => {
    void load(startSec);
  }, [item.id]);

  const controls = useEngineControls({
    player,
    core,
    load,
    dur,
    localUri,
    directPlayable: decision.direct,
    setCur,
    setAudioIndex,
    setFilterState: setFilter,
    setRateState: setRate,
  });

  return {
    player,
    offline: !!localUri,
    localAudio,
    cur,
    dur,
    buffered,
    playing,
    waiting,
    ready,
    failed,
    endedNonce,
    mode,
    audioIndex,
    filter,
    rate,
    ...controls,
  };
}
