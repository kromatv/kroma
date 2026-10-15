import type { CapabilitySource } from '@kromatv/client/capabilities';
import type { WatchableApi, WatchableProgress } from '@kromatv/client/watchable';
import {
  langName,
  type WatchNext,
  type WatchReady,
  watchChapters,
  watchItem,
  watchRelease,
  watchResumeId,
} from '@kromatv/core';
import { useWatchStoryboard, useWatchSubtitles } from '@kromatv/core/react';
import {
  ArrivalPlayer,
  arrivalSubtitles,
  Player,
  useCast,
  useRememberWatchPosition,
  useStoryboardSheet,
  useT,
  useWatchUpNext,
  WEB_FLAGS,
  watchResumeAt,
} from '@kromatv/ui';
import { useCallback, useMemo, useState } from 'react';
import { StoppedNotice } from '#web/features/playback/stopped-notice';
import { useWatchSession } from '#web/features/playback/use-watch-session';
import { useWebController } from '#web/features/playback/use-web-controller';
import type { WebSubtitles } from '#web/features/playback/use-web-subtitles';
import { VideoSurface } from '#web/features/playback/video-surface';
import { watchableSource } from '#web/features/playback/watchable-source';
import { imageUrl } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { useLangPrefs } from '#web/shared/lib/lang-pref';
import { castPicker } from '#web/shared/ui/cast-picker';

const PREVIEW_W = 176;

const ignore = () => undefined;

function noSubtitles(label: string): WebSubtitles {
  return {
    subtitles: [],
    activeIndex: null,
    setActive: ignore,
    markFailed: ignore,
    subtitleGen: {
      canCreate: false,
      caps: null,
      pending: [],
      onCancel: ignore,
      onDelete: ignore,
      onStart: ignore,
    },
    label,
  };
}

export function WatchablePlayer({
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
  const t = useT();
  const langs = useLangPrefs();
  const cast = useCast();
  const { client } = useAuth();
  const { target, probe, ticket } = ready;
  const resumeId = watchResumeId(target.entry.id, target.file.index);
  const [resumedAt] = useState(() => watchResumeAt(resumeId));
  const [playback] = useState(() =>
    watchableSource({ watchable, target, probe, ticket, title, startSec: resumedAt }),
  );
  const subs = useMemo(() => noSubtitles(t('player.subtitlesOff')), [t]);
  const web = useWebController(playback, subs);
  const { controller: engine, pb } = web;
  const tracks = useWatchSubtitles({
    watchable,
    ready,
    positionSec: engine.cur,
    waiting: engine.waiting,
    preferredLanguage: langs.subtitle,
  });
  const controller = { ...engine, ...arrivalSubtitles(tracks) };
  const sheet = useWatchStoryboard({ watchable, target });
  const storyboard = useStoryboardSheet(sheet);
  const tileAt = useCallback((sec: number) => storyboard.tile(sec, PREVIEW_W), [storyboard]);
  const chapters = useMemo(() => watchChapters(probe), [probe]);
  useRememberWatchPosition(resumeId, controller.cur, controller.dur);

  const item = useMemo(() => watchItem({ mount: source.mount, target }), [source.mount, target]);
  const shown = tracks.tracks.find((track) => track.index === tracks.active);
  const stopped = useWatchSession({
    item,
    durationMs: probe.durationMs,
    web,
    subtitleLabel: shown
      ? (shown.title ?? langName(t, shown.language) ?? t('player.langUnknown'))
      : t('player.subtitlesOff'),
  });
  const upNext = useWatchUpNext({
    discovery: client.discovery,
    target,
    art: imageUrl,
    onPlay: onPlayNext,
  });
  const flags = useMemo(() => ({ ...WEB_FLAGS, cast: cast.available }), [cast.available]);
  const castIt = async () => {
    const picked = await castPicker();
    if (!picked) return;
    const ok = await cast.watchOn(picked, item, Math.round(pb.getPosition() * 1000));
    if (ok) onClose();
  };

  return (
    <ArrivalPlayer
      controller={controller}
      flags={flags}
      title={title}
      release={watchRelease(ready, title)}
      progress={progress}
      source={source}
      onCast={() => void castIt()}
      onClose={onClose}
    >
      <Player.Media>
        <VideoSurface pb={pb} />
      </Player.Media>
      <Player.Transport chapters={chapters} tileAt={tileAt} />
      <Player.UpNext data={upNext.data} onPlay={upNext.playCard} />
      <Player.Credits next={upNext.next} onPlay={upNext.playNext} />
      {resumedAt > 0 ? <Player.Resume at={resumedAt} /> : null}
      {stopped ? (
        <Player.Panel>
          <StoppedNotice message={stopped} onBack={onClose} />
        </Player.Panel>
      ) : null}
    </ArrivalPlayer>
  );
}
