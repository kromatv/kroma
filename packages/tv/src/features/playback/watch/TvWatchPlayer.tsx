import type { CapabilitySource } from '@kromatv/client/capabilities';
import type { WatchableApi, WatchableProgress } from '@kromatv/client/watchable';
import {
  arrivalOf,
  audioTrackLabel,
  downloadedSpans,
  type WatchNext,
  type WatchReady,
  watchChapters,
  watchItem,
  watchRelease,
  watchResumeId,
} from '@kromatv/core';
import { useArrivalRecovery, useWatchStoryboard, useWatchSubtitles } from '@kromatv/core/react';
import {
  ArrivalPlayer,
  Player,
  TV_FLAGS,
  UP_NEXT_ART_W,
  useLocale,
  useRememberWatchPosition,
  useStoryboardSheet,
  useT,
  useWatchUpNext,
  watchResumeAt,
} from '@kromatv/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLangPrefs } from '#tv/app/langPref';
import { useEnv } from '#tv/app/providers/env';
import { useClient } from '#tv/app/router';
import { useCastTarget } from '#tv/features/cast/castBridge';
import { revealNativeSurface } from '#tv/features/playback/player/nativeSurface';
import { PlayerSurface } from '#tv/features/playback/player/PlayerSurface';
import { StoppedNotice } from '#tv/features/playback/stopped-notice';
import { useWatchController } from '#tv/features/playback/watch/useWatchController';
import { useWatchPlayback } from '#tv/features/playback/watch/useWatchPlayback';
import { useWatchSession } from '#tv/features/playback/watch/useWatchSession';
import { watchAudioTracks, watchMedia } from '#tv/features/playback/watch/watchSource';

const PREVIEW_W = 256;

export function TvWatchPlayer({
  watchable,
  ready,
  progress,
  source,
  title,
  onPlayNext,
  onClose,
}: Readonly<{
  watchable: WatchableApi;
  ready: WatchReady;
  progress: WatchableProgress | null;
  source: CapabilitySource;
  title: string;
  onPlayNext: (next: WatchNext) => void;
  onClose: () => void;
}>) {
  const client = useClient();
  const t = useT();
  const locale = useLocale();
  const { mousePointer } = useEnv();
  const flags = useMemo(() => ({ ...TV_FLAGS, pointer: mousePointer }), [mousePointer]);
  const [audioIndex, setAudio] = useState(() => ready.probe.audio[0]?.index ?? 0);
  const resumeId = watchResumeId(ready.target.entry.id, ready.target.file.index);
  const [startSec] = useState(() => watchResumeAt(resumeId));
  const media = useMemo(
    () => watchMedia(watchable, ready, audioIndex),
    [watchable, ready, audioIndex],
  );
  const pb = useWatchPlayback(client, media, startSec);
  const arrival = useMemo(
    () => arrivalOf({ source, progress, t, locale }),
    [source, progress, t, locale],
  );
  const arrived = useMemo(
    () => (arrival.slices.length > 0 ? downloadedSpans(arrival.slices, pb.dur) : null),
    [arrival, pb.dur],
  );
  const { recovering } = useArrivalRecovery({
    played: pb,
    arrived,
    arriving: arrival.progress < 1,
    onReopen: pb.reopen,
  });
  const langs = useLangPrefs();
  const subs = useWatchSubtitles({
    watchable,
    ready,
    positionSec: pb.cur,
    waiting: pb.waiting,
    preferredLanguage: langs.subtitle,
  });
  const controller = useWatchController({
    pb,
    ready,
    title,
    audioIndex,
    setAudio,
    subs,
    recovering,
  });
  const sheet = useWatchStoryboard({ watchable, target: ready.target });
  const storyboard = useStoryboardSheet(sheet);
  const tileAt = useCallback((sec: number) => storyboard.tile(sec, PREVIEW_W), [storyboard]);
  const chapters = useMemo(() => watchChapters(ready.probe), [ready.probe]);
  useRememberWatchPosition(resumeId, pb.cur, pb.dur);

  const item = useMemo(
    () => watchItem({ mount: source.mount, target: ready.target }),
    [source.mount, ready.target],
  );
  const stopped = useWatchSession({
    client,
    item,
    probe: ready.probe,
    pb,
    audioLabel: audioTrackLabel(
      t,
      watchAudioTracks(ready.probe).find((track) => track.index === audioIndex),
    ),
  });
  const art = useCallback(
    (still: string | null) => client.media.artwork.resolve(still, UP_NEXT_ART_W),
    [client],
  );
  const upNext = useWatchUpNext({
    discovery: client.discovery,
    target: ready.target,
    art,
    onPlay: onPlayNext,
  });
  useCastTarget({ watch: item, next: upNext.playNext ?? null }, controller);

  useEffect(() => {
    if (pb.surface === 'video' || !pb.ready) return;
    return revealNativeSurface();
  }, [pb.surface, pb.ready]);

  return (
    <ArrivalPlayer
      controller={controller}
      flags={flags}
      title={title}
      release={watchRelease(ready, title)}
      progress={progress}
      source={source}
      onClose={onClose}
    >
      <Player.Media>
        <PlayerSurface pb={pb} title={title} />
      </Player.Media>
      <Player.Transport chapters={chapters} tileAt={tileAt} />
      <Player.UpNext data={upNext.data} onPlay={upNext.playCard} />
      <Player.Credits next={upNext.next} onPlay={upNext.playNext} />
      {startSec > 0 ? <Player.Resume at={startSec} /> : null}
      {stopped === null ? null : (
        <Player.Panel>
          <StoppedNotice message={stopped} onBack={onClose} />
        </Player.Panel>
      )}
    </ArrivalPlayer>
  );
}
