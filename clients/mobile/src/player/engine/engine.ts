// expo-video over one absolute clock: direct files use their own timeline;
// master remuxes restart at 0 and add the resolved baseSec anchor.

import type { KromaClient } from '@kromatv/client';
import type { MediaItem } from '@kromatv/client/media';
import { resolveMasterStart } from '@kromatv/core';
import { type AudioTrack, useVideoPlayer, type VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { decideSource, downloadCopyCodecs, mobileVideoCodecs } from '#mobile/player/caps';
import { usePlaybackOwner } from '#mobile/player/playback-owner';
import { useEngineControls } from './controls';
import { useEngineFailure } from './failure';
import { stopNativePlayer } from './shutdown';
import {
  type AudioFilterMode,
  type Engine,
  type EngineCore,
  nativeTrackKey,
  nextLoadId,
  patchCore,
} from './types';

export type { AudioFilterMode, Engine, EngineState } from './types';

// Must be read before `started` is cleared for the new source.
function resumeOnLoad(core: EngineCore, player: VideoPlayer): boolean {
  return !core.started || player.playing;
}

export function useKromaEngine(
  client: KromaClient,
  item: MediaItem,
  startSec: number,
  /** Local file to play instead of the server (offline download). */
  localUri?: string,
  /** The audio track the title OPENS on - the account's preferred language,
   *  resolved by the caller (see @kromatv/core preferredAudioIndex). */
  startAudioIndex = 0,
  subtitle: string | null = null,
): Engine {
  const decision = useMemo(() => decideSource(item), [item]);
  const [core] = useState<EngineCore>(() => ({
    active: true,
    terminal: false,
    sourceUri: null,
    // A non-default OPENING track forces the master, same as a manual switch:
    // direct play always carries the container's default audio.
    mode: localUri || (decision.direct && startAudioIndex === 0 && !subtitle) ? 'direct' : 'master',
    baseSec: 0,
    elSec: 0,
    bufSec: 0,
    fellBack: false,
    forceAac: decision.aacMaster,
    resumeOnLoad: true,
    pendingSeek: decision.direct && startSec > 0 ? startSec : null,
    audioIndex: startAudioIndex,
    filter: 'off',
    loadId: 0,
    subtitle,
    started: false,
  }));

  const [cur, setCur] = useState(startSec);
  const [buffered, setBuffered] = useState(startSec);
  const [dur, setDur] = useState((item.durationMs ?? 0) / 1000);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [ready, setReady] = useState(false);
  const [endedNonce, setEndedNonce] = useState(0);
  const [mode, setMode] = useState(core.mode);
  const [audioIndex, setAudioIndex] = useState(startAudioIndex);
  const [localAudio, setLocalAudio] = useState<AudioTrack[]>([]);
  const [filter, setFilter] = useState<AudioFilterMode>('off');
  const [rate, setRate] = useState(1);

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
  });
  const { failed, failure, clearFailure, failTerminal } = useEngineFailure({
    core,
    player,
    localUri,
    setReady,
    setWaiting,
    setPlaying,
  });

  const sourceUrl = useCallback(
    (anchor: number): string => {
      if (localUri) return localUri;
      if (core.mode === 'direct') return client.media.streamUrl(item.id);
      const f = core.filter === 'off' ? undefined : core.filter;
      return client.media.hlsMasterUrl(item.id, core.forceAac, anchor, core.audioIndex, {
        filter: f,
        videoCodecs: mobileVideoCodecs(),
        copyCodecs: downloadCopyCodecs(),
        subtitle: core.subtitle ?? undefined,
      });
    },
    [client, item.id, core, localUri],
  );

  // Master anchors resolve their REAL keyframe start first so the absolute
  // clock stays honest.
  const load = useCallback(
    async (absSec: number) => {
      if (!core.active || core.terminal) return;
      const id = nextLoadId(core);
      const resume = resumeOnLoad(core, player);
      setWaiting(true);
      setReady(false);
      clearFailure();
      const loadingMode = core.mode;
      const uri = sourceUrl(absSec);
      patchCore(core, { sourceUri: uri });
      const baseSec = loadingMode === 'direct' ? 0 : await resolveMasterStart(uri, absSec);
      if (!core.active || core.terminal || id !== core.loadId) return;
      const pendingSeek = loadingMode === 'direct' && absSec > 0 ? absSec : null;
      patchCore(core, {
        baseSec,
        pendingSeek,
        elSec: 0,
        bufSec: 0,
        started: false,
        resumeOnLoad: resume,
      });
      setMode(loadingMode);
      setCur(baseSec + (pendingSeek ?? 0));
      setBuffered(baseSec + (pendingSeek ?? 0));
      const meta = item.metadata;
      await player
        .replaceAsync({
          uri,
          metadata: {
            title: meta?.title ?? item.title,
            artist: item.showTitle ?? undefined,
            artwork: client.media.artwork.resolve(meta?.posterUrl) ?? undefined,
          },
        })
        .catch((error: unknown) => {
          failTerminal(error, uri, id);
        })
        .finally(() => {
          if (!core.active || core.terminal) stopNativePlayer(player);
        });
    },
    [core, player, sourceUrl, client, item, clearFailure, failTerminal],
  );

  // Failure ladder: direct falls back to the master once; a copy-audio master
  // retries once as AAC; anything else surfaces.
  const fail = useCallback(
    (error?: unknown) => {
      if (!core.active || core.terminal) return;
      if (localUri) {
        // Offline: there is no server to fall back to.
        failTerminal(error, localUri, core.loadId);
        return;
      }
      const pos = core.baseSec + core.elSec;
      if (core.mode === 'direct' && !core.fellBack) {
        patchCore(core, { fellBack: true, mode: 'master' });
        void load(pos);
        return;
      }
      if (core.mode === 'master' && !core.forceAac) {
        patchCore(core, { forceAac: true });
        void load(pos);
        return;
      }
      failTerminal(error, core.sourceUri ?? sourceUrl(pos), core.loadId);
    },
    [core, load, localUri, failTerminal, sourceUrl],
  );

  useEffect(() => {
    const subs = [
      player.addListener('statusChange', ({ status, error }) => {
        if (!core.active || core.terminal) return;
        if (status === 'error') {
          fail(error);
          return;
        }
        if (status === 'loading') setWaiting(true);
        if (status === 'readyToPlay') {
          setReady(true);
          setWaiting(false);
          clearFailure();
          // Local files: surface the tracks actually in the file (iOS often
          // has them ready here without ever firing the change event).
          if (localUri) setLocalAudio(player.availableAudioTracks);
          if (core.pendingSeek != null) {
            player.currentTime = core.pendingSeek;
            patchCore(core, { elSec: core.pendingSeek, pendingSeek: null });
          }
          if (core.mode === 'direct' && player.duration > 0) setDur(player.duration);
          if (core.resumeOnLoad) {
            patchCore(core, { resumeOnLoad: false });
            player.play();
          }
        }
      }),
      player.addListener('timeUpdate', ({ currentTime, bufferedPosition }) => {
        if (!core.active || core.terminal) return;
        const advanced = currentTime - core.elSec;
        if (player.playing && advanced > 0 && advanced < 2) setWaiting(false);
        if (currentTime > 0.5) patchCore(core, { started: true });
        patchCore(core, { elSec: currentTime, bufSec: Math.max(0, bufferedPosition) });
        setCur(core.baseSec + currentTime);
        setBuffered(core.baseSec + Math.max(currentTime, core.bufSec));
      }),
      player.addListener('playingChange', ({ isPlaying }) => {
        if (!core.active || core.terminal) return;
        setPlaying(isPlaying);
      }),
      // ExoPlayer reports ENDED for the empty initial source and again on
      // every source swap: a bare event is not proof playback reached the
      // end. Only trust it once this source has produced playback time and
      // the clock sits near the actual end.
      player.addListener('playToEnd', () => {
        if (!core.active || core.terminal) return;
        if (!core.started) return;
        const end = Math.max(player.duration, 0);
        if (end > 0 && player.currentTime < end - 5) return;
        setEndedNonce((n) => n + 1);
      }),
      player.addListener('availableAudioTracksChange', ({ availableAudioTracks }) => {
        if (!core.active || core.terminal) return;
        if (localUri) setLocalAudio(availableAudioTracks);
      }),
      // Keep the selected ordinal honest whichever side initiated the switch
      // (our setter, the system Now Playing UI, or the platform's default pick).
      player.addListener('audioTrackChange', ({ audioTrack }) => {
        if (!core.active || core.terminal) return;
        if (!localUri || !audioTrack) return;
        const i = player.availableAudioTracks.findIndex(
          (t) => nativeTrackKey(t) === nativeTrackKey(audioTrack),
        );
        if (i >= 0) {
          patchCore(core, { audioIndex: i });
          setAudioIndex(i);
        }
      }),
    ];
    return () => {
      for (const s of subs) s.remove();
    };
  }, [player, core, fail, localUri, clearFailure]);

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- open once per item; startSec/load must not re-trigger a reload mid-playback
  useEffect(() => {
    // oxlint-disable-next-line react-compiler/set-state-in-effect -- opening the native source is the effect; load's state writes report its progress
    void load(startSec);
  }, [item.id]);

  useEffect(() => {
    if (!core.active || core.terminal || localUri || subtitle === core.subtitle) return;
    patchCore(core, { subtitle, mode: 'master' });
    // oxlint-disable-next-line react-compiler/set-state-in-effect -- replacing the native source reports its loading state
    void load(core.baseSec + core.elSec);
  }, [subtitle, localUri, core, load]);

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
  usePlaybackOwner(controls.shutdown);

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
    failure,
    endedNonce,
    mode,
    audioIndex,
    filter,
    rate,
    ...controls,
  };
}
