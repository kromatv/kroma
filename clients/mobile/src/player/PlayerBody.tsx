import type { MediaItem } from '@kromatv/client/media';
import { audioTracksOf, langCode, preferredAudioIndex } from '@kromatv/core';
import { useHeldSeek } from '@kromatv/core/react';
import { useCast } from '@kromatv/ui';
import { useQuery } from '@tanstack/react-query';
import { usePreventRemove, useRouter } from 'expo-router';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { CastPanel } from '#mobile/components/cast/CastPanel';
import type { DownloadEntry } from '#mobile/lib/downloads';
import { useT } from '#mobile/lib/i18n';
import { useLangPrefs } from '#mobile/lib/langPrefs';
import { goBack } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { useKromaEngine } from '#mobile/player/engine';
import { useHeartbeat } from '#mobile/player/heartbeat';
import { PlayerLayout } from '#mobile/player/player-layout';
import { PlayerVideo, type PlayerVideoHandle } from '#mobile/player/player-video';
import { PlayerDetails } from '#mobile/player/player-details';
import { usePlayerPresentation } from '#mobile/player/use-player-presentation';
import { PlayerStatusScreen } from '#mobile/player/player-status-screen';
import { type SheetView, TrackSheet } from '#mobile/player/TrackSheet';
import { useStoryboard } from '#mobile/player/useStoryboard';
import { useSubAppearance } from '#mobile/player/useSubAppearance';
import { useSubtitles } from '#mobile/player/useSubtitles';
import { PortraitHeader } from './portrait-header';
import { PortraitPlaybackStrip } from './portrait-playback-strip';
import { audioOptions, subtitleLabel } from './trackOptions';
import { playbackFailureCopy } from './playback-failure';

export function PlayerBody({
  item,
  startSec,
  localUri,
  offline,
  onRetry,
  onPosition,
}: Readonly<{
  item: MediaItem;
  startSec: number;
  localUri?: string;
  offline?: DownloadEntry;
  onRetry(positionSec: number): void;
  onPosition(positionSec: number): void;
}>) {
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const prefs = useLangPrefs();
  // The preferred audio language decides the OPENING track when the file carries
  // it (same as TV). Offline keeps the file's default: local ordinals are the
  // native player's business.
  const startAudio = localUri ? 0 : (preferredAudioIndex(audioTracksOf(item), prefs.audio) ?? 0);
  const subs = useSubtitles(client, item, offline, prefs.subtitle);
  const subtitle = subs.tracks.find((track) => track.index === subs.active)?.nativeSource ?? null;
  const engine = useHeldSeek(
    useKromaEngine(client, item, startSec, localUri, startAudio, subtitle),
  );
  const presentation = usePlayerPresentation();
  const rememberPosition = useEffectEvent(() => onPosition(engine.cur));
  useEffect(() => () => rememberPosition(), []);
  const video = useRef<PlayerVideoHandle>(null);
  const tileFor = useStoryboard(client, item, !localUri, offline);
  // Which sheet view is open, or null: the gear opens the menu, the CC capsule
  // jumps straight to subtitles.
  const [sheet, setSheet] = useState<SheetView | null>(null);
  const [appearance, setAppearance] = useSubAppearance();
  const [statsOn, setStatsOn] = useState(false);
  // Pinch-to-zoom, the YouTube gesture: pinch out fills the screen (cover),
  // pinch in returns to letterboxed fit (contain).
  const [fill, setFill] = useState(false);

  // Subtitle status for the chrome's top pill. The sheet closes on pick, so
  // the wait (a first request can sit through the server extracting the whole
  // file) and the give-up both have to be said on the VIDEO, not in the sheet.
  const [subFailedNote, setSubFailedNote] = useState<string | null>(null);
  const prevFailedCount = useRef(0);
  useEffect(() => {
    if (subs.failed.size > prevFailedCount.current) {
      setSubFailedNote(t('error.subtitleUnavailable'));
      const id = setTimeout(() => setSubFailedNote(null), 2500);
      prevFailedCount.current = subs.failed.size;
      return () => clearTimeout(id);
    }
    prevFailedCount.current = subs.failed.size;
  }, [subs.failed, t]);
  const subNotice = subs.loading ? t('player.subPreparing') : subFailedNote;
  const navigatedRef = useRef(false);
  const next = useQuery({
    ...client.query.playback.nextEpisode(item.id),
    enabled: !localUri && item.kind === 'episode',
    staleTime: 5 * 60_000,
  });
  const similar = useQuery({
    ...client.query.media.similar(item.id),
    enabled: !localUri && item.kind === 'movie',
    staleTime: 10 * 60_000,
  });

  // Handing this film to a TV: the position travels with it, so the set picks
  // up exactly where the phone was rather than at the last saved beat.
  const cast = useCast();
  // Not the app's bottom sheet: this screen is a native fullScreenModal, which
  // @gorhom's host sits behind. <CastPanel> is the player's own shell.
  const [castOpen, setCastOpen] = useState(false);

  const [terminated, setTerminated] = useState<string | null>(null);
  useHeartbeat(
    client,
    item,
    () => ({
      positionSec: engine.cur,
      durationSec: engine.dur,
      playing: engine.playing,
      waiting: engine.waiting,
      mode: engine.mode,
      aac: engine.mode === 'master' && engine.filter !== 'off',
      audioLang: engine.offline
        ? engine.localAudio[engine.audioIndex]?.language || undefined
        : (audioTracksOf(item).find((a) => a.index === engine.audioIndex)?.language ?? undefined),
      subtitleLang:
        subs.active !== null
          ? langCode(subs.tracks.find((s) => s.index === subs.active)?.language)
          : undefined,
    }),
    (message) => {
      engine.shutdown();
      setTerminated(message.trim() || '');
    },
  );

  // The screen leaving the stack for ANY reason (pop, replace, gesture) must
  // kill audio before the native dismissal even starts.
  const [guarded, setGuarded] = useState(true);
  usePreventRemove(guarded, ({ repeat }) => {
    engine.shutdown();
    setGuarded(false);
    repeat();
  });

  useEffect(() => {
    if (engine.endedNonce === 0 || navigatedRef.current) return;
    navigatedRef.current = true;
    engine.shutdown();
    void client.playback
      .nextEpisode(item.id)
      .then((next) => {
        if (next) router.replace(`/player/${next.id}` as never);
        else goBack(router);
      })
      .catch(() => goBack(router));
  }, [engine.endedNonce, engine, client, item.id, router]);

  const exit = () => {
    engine.shutdown();
    goBack(router);
  };
  const playRelated = (related: MediaItem) => {
    navigatedRef.current = true;
    engine.shutdown();
    router.replace(`/player/${related.id}` as never);
  };

  if (terminated != null) {
    return <PlayerStatusScreen message={terminated || t('player.stoppedDefault')} onBack={exit} />;
  }

  if (engine.failed) {
    return (
      <PlayerStatusScreen
        {...playbackFailureCopy(engine.failure, t)}
        detail={engine.failure?.detail}
        onBack={exit}
        onRetry={() => onRetry(engine.cur)}
      />
    );
  }

  return (
    <PlayerLayout
      fullscreen={presentation.fullscreen}
      header={
        <PortraitHeader
          onBack={exit}
          onCast={() => setCastOpen(true)}
          onSettings={() => setSheet('menu')}
        />
      }
      transport={
        <PortraitPlaybackStrip
          engine={engine}
          item={item}
          tileFor={tileFor}
          onFullscreen={presentation.toggle}
        />
      }
      details={
        <PlayerDetails
          item={item}
          audio={
            audioOptions(engine, item, t).find((track) => track.index === engine.audioIndex)
              ?.label ?? t('player.noAudioTracks')
          }
          subtitle={subtitleLabel(subs, t)}
          rate={engine.rate}
          next={next.data}
          similar={similar.data ?? []}
          onOpenSheet={setSheet}
          onPip={() => video.current?.startPip()}
          onPlay={playRelated}
        />
      }
      video={
        <PlayerVideo
          ref={video}
          engine={engine}
          item={item}
          cue={subs.cueAt(engine.cur)}
          appearance={appearance}
          statsOn={statsOn}
          onToggleStats={() => setStatsOn((v) => !v)}
          fill={fill}
          onZoom={setFill}
          notice={subNotice}
          resumedAt={startSec}
          onBack={presentation.fullscreen ? presentation.collapse : exit}
          onOpenSheet={(view) => setSheet(view ?? 'menu')}
          onCast={() => setCastOpen(true)}
          nativeSubtitles={!!subtitle}
          fullscreen={presentation.fullscreen}
          onFullscreen={presentation.toggle}
          tileFor={tileFor}
          next={next.data ?? null}
          onPlayNext={() => {
            navigatedRef.current = true;
            engine.shutdown();
            if (next.data) router.replace(`/player/${next.data.id}` as never);
          }}
        />
      }
    >
      <CastPanel
        visible={castOpen}
        onClose={() => setCastOpen(false)}
        onPick={async (id) => {
          setCastOpen(false);
          if (!id) return;
          const failure = await cast.playOn(id, item.id, Math.round(engine.cur * 1000));
          // Stop local playback once the TV picks up the same title, to avoid
          // two screens playing it at once.
          if (!failure) {
            engine.shutdown();
            goBack(router);
          }
        }}
      />
      <TrackSheet
        visible={sheet !== null}
        initialView={sheet ?? 'menu'}
        onClose={() => setSheet(null)}
        engine={engine}
        subs={subs}
        item={item}
        appearance={appearance}
        onAppearance={setAppearance}
        statsOn={statsOn}
        onToggleStats={() => setStatsOn((v) => !v)}
      />
    </PlayerLayout>
  );
}
