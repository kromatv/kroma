import type { CapabilitySource } from '@kromatv/client/capabilities';
import type { WatchableApi, WatchableProgress } from '@kromatv/client/watchable';
import {
  arrivalOf,
  downloadedSpans,
  type WatchNext,
  type WatchReady,
  watchChapters,
  watchRelease,
  watchResumeId,
} from '@kromatv/core';
import {
  useArrivalRecovery,
  useHeldSeek,
  useWatchStoryboard,
  useWatchSubtitles,
} from '@kromatv/core/react';
import {
  ResumePrompt,
  StatsPanel,
  useCast,
  useRememberWatchPosition,
  useResumeNotice,
  watchResumeAt,
} from '@kromatv/ui';
import { Box, styles } from '@kromatv/ui/kit';
import type { VideoView as VideoViewRef } from 'expo-video';
import { VideoView } from 'expo-video';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CastPanel } from '#mobile/components/cast/CastPanel';
import { ErrorView } from '#mobile/components/ui';
import { useI18n } from '#mobile/lib/i18n';
import { useLangPrefs } from '#mobile/lib/langPrefs';
import { useClient } from '#mobile/lib/session';
import { ControlsLayer } from '#mobile/player/chrome/ControlsLayer';
import { CueLine, UP_NEXT_THUMB_W, UpNextTile } from '#mobile/player/chrome/overlays';
import { type SheetView, TrackSheet } from '#mobile/player/TrackSheet';
import { useChromeReveal } from '#mobile/player/useChromeReveal';
import { useSheetTiles } from '#mobile/player/useSheetTiles';
import { useSubAppearance } from '#mobile/player/useSubAppearance';
import { useWatchNext } from '#mobile/player/useWatchNext';
import { useWatchSession } from '#mobile/player/useWatchSession';
import { useWatchEngine } from '#mobile/player/watchEngine';
import {
  watchAudioOptions,
  watchMaster,
  watchQuality,
  watchSheetSubtitles,
  watchStats,
} from '#mobile/player/watchSource';

const STATS_GUTTER = 32;
const STATS_WIDTH = 460;

export function WatchBody({
  watchable,
  stage,
  progress,
  source,
  title,
  poster,
  onPlayNext,
  onLeave,
}: Readonly<{
  watchable: WatchableApi;
  stage: WatchReady;
  progress: WatchableProgress | null;
  source: CapabilitySource;
  title: string;
  poster: string | null;
  onPlayNext: (next: WatchNext) => void;
  onLeave: () => void;
}>) {
  const { t, locale } = useI18n();
  const client = useClient();
  const cast = useCast();
  const [castOpen, setCastOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const resumeId = watchResumeId(stage.target.entry.id, stage.target.file.index);
  const [audioIndex, setAudioIndex] = useState(0);
  const [resumedAt] = useState(() => watchResumeAt(resumeId));
  const [anchorSec, setAnchor] = useState(resumedAt);
  const master = useMemo(
    () => watchMaster(watchable, stage, audioIndex, anchorSec),
    [watchable, stage, audioIndex, anchorSec],
  );
  const played = useWatchEngine({
    master,
    durationSec: durationOf(stage),
    title,
    poster,
    onReanchor: setAnchor,
  });
  const arrival = useMemo(
    () => arrivalOf({ source, progress, t, locale }),
    [source, progress, t, locale],
  );
  const downloaded = useMemo(
    () => (arrival.slices.length > 0 ? downloadedSpans(arrival.slices, played.dur) : undefined),
    [arrival, played.dur],
  );
  const { recovering } = useArrivalRecovery({
    played,
    arrived: downloaded ?? null,
    arriving: arrival.progress < 1,
    onReopen: (step, atSec) => {
      const moves = watchMaster(watchable, stage, audioIndex, atSec).uri !== master.uri;
      if (step === 'reanchor' && moves) setAnchor(atSec);
      else played.reload(atSec);
    },
  });
  const engine = useHeldSeek(played);
  const chrome = useChromeReveal();
  const resume = useResumeNotice({
    at: resumedAt || undefined,
    cur: engine.cur,
    playing: engine.playing,
    waiting: engine.waiting,
  });
  const [sheet, setSheet] = useState<SheetView | null>(null);
  const [statsOn, setStatsOn] = useState(false);
  const viewRef = useRef<VideoViewRef>(null);
  useRememberWatchPosition(resumeId, engine.cur, engine.dur);
  const prefs = useLangPrefs();
  const subs = useWatchSubtitles({
    watchable,
    ready: stage,
    positionSec: engine.cur,
    waiting: engine.waiting,
    preferredLanguage: prefs.subtitle,
  });
  const subtitles = watchSheetSubtitles(subs);
  const [appearance, setAppearance] = useSubAppearance();
  const storyboard = useWatchStoryboard({ watchable, target: stage.target });
  const tileFor = useSheetTiles(storyboard);
  const chapterStarts = useMemo(
    () => watchChapters(stage.probe).map((chapter) => chapter.startMs / 1000),
    [stage.probe],
  );

  const audio = watchAudioOptions(stage.probe, t);
  const leave = () => {
    engine.shutdown();
    onLeave();
  };
  const audioLabel = audio.find((track) => track.index === audioIndex)?.label;
  const { item, stopped } = useWatchSession({ client, source, stage, engine, audioLabel, subs, t });
  const offer = useWatchNext({ client, target: stage.target, engine, onPlay: onPlayNext });
  const { next: upNext, playNext } = offer;
  const getStats = () =>
    watchStats({
      ready: stage,
      arrival,
      audioIndex,
      cur: engine.cur,
      dur: engine.dur,
      buffered: engine.buffered,
      rate: engine.rate,
      t,
    });

  if (stopped !== null) {
    return (
      <ErrorView
        message={stopped || t('player.stoppedDefault')}
        retryLabel={t('player.back')}
        onRetry={leave}
      />
    );
  }

  if (engine.failed && !recovering) {
    return (
      <ErrorView message={t('player.cantPlay')} retryLabel={t('player.back')} onRetry={leave} />
    );
  }

  return (
    <Box style={s.stage}>
      <Pressable style={StyleSheet.absoluteFill} onPress={chrome.toggle}>
        <VideoView
          ref={viewRef}
          player={engine.player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture
          startsPictureInPictureAutomatically
        />
      </Pressable>
      <CueLine
        cue={subtitles.cueAt(engine.cur)}
        bottom={(chrome.shown ? 110 : 40) + insets.bottom}
        appearance={appearance}
      />
      {chrome.shown ? (
        <ControlsLayer
          playback={{ ...engine, waiting: engine.waiting || recovering, downloaded }}
          title={title}
          subtitle={watchRelease(stage, title) ?? undefined}
          arrival={arrival}
          insets={insets}
          poke={chrome.poke}
          hold={chrome.hold}
          onBack={leave}
          markers={chapterStarts}
          tileFor={tileFor}
          actions={{
            onAudio: audio.length > 1 ? () => setSheet('audio') : undefined,
            onSubtitles: subtitles.tracks.length > 0 ? () => setSheet('subtitles') : undefined,
            onSpeed: () => setSheet('speed'),
            onSettings: () => setSheet('menu'),
            onPip: () => viewRef.current?.startPictureInPicture(),
            onPlayNext: upNext ? () => playNext(upNext) : undefined,
            onCast: cast.available ? () => setCastOpen(true) : undefined,
          }}
        />
      ) : null}
      {offer.due && upNext ? (
        <UpNextTile
          title={upNext.title ?? t('content.episodeN', { n: upNext.episode })}
          thumb={client.media.artwork.resolve(upNext.stillUrl, UP_NEXT_THUMB_W)}
          seed={`${upNext.season}:${upNext.episode}`}
          onPlayNext={() => playNext(upNext)}
          bottom={(chrome.shown ? 110 : 40) + insets.bottom}
        />
      ) : null}
      {resumedAt ? (
        <ResumePrompt
          at={resumedAt}
          shown={resume.shown}
          secondsLeft={resume.secondsLeft}
          total={resume.total}
          lift={(chrome.shown ? 110 : 40) + insets.bottom}
          onStartOver={() => {
            resume.dismiss();
            engine.seekTo(0);
          }}
        />
      ) : null}
      {statsOn ? (
        <StatsPanel
          controller={{ getStats }}
          onClose={() => setStatsOn(false)}
          top={(chrome.shown ? 64 : 12) + insets.top}
          left={insets.left + 16}
          width={Math.min(STATS_WIDTH, screenWidth - insets.left - insets.right - STATS_GUTTER)}
          maxHeight={screenHeight - insets.top - insets.bottom - STATS_GUTTER}
        />
      ) : null}
      <CastPanel
        visible={castOpen}
        onClose={() => setCastOpen(false)}
        onPick={async (id) => {
          setCastOpen(false);
          if (!id) return;
          if (await cast.watchOn(id, item, Math.round(engine.cur * 1000))) leave();
        }}
      />
      <TrackSheet
        visible={sheet !== null}
        initialView={sheet ?? 'menu'}
        onClose={() => setSheet(null)}
        audio={audio}
        audioIndex={audioIndex}
        onAudio={(track) => setAudioIndex(track.index)}
        rate={engine.rate}
        onRate={engine.setRate}
        statsOn={statsOn}
        onToggleStats={() => setStatsOn((on) => !on)}
        extras={{
          quality: watchQuality(stage.probe, t),
          subtitles:
            subtitles.tracks.length > 0
              ? { of: subtitles, onPick: (index) => subs.pick(index) }
              : undefined,
          appearance: { value: appearance, onChange: setAppearance },
        }}
      />
    </Box>
  );
}

function durationOf({ probe }: WatchReady): number {
  return probe.durationMs === null ? 0 : probe.durationMs / 1000;
}

const s = styles({
  stage: { flex: true, bg: 'black' },
});
