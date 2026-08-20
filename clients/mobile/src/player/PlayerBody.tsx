import { audioTracksOf, langCode, type MediaItem, preferredAudioIndex } from '@kroma/core';
import { useCast } from '@kroma/ui';
import { Box, styles } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import type { VideoView as VideoViewRef } from 'expo-video';
import { VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { CastPanel } from '#mobile/components/cast/CastPanel';
import { ErrorView } from '#mobile/components/ui';
import type { DownloadEntry } from '#mobile/lib/downloads';
import { useT } from '#mobile/lib/i18n';
import { useLangPrefs } from '#mobile/lib/langPrefs';
import { goBack } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { useKromaEngine } from '#mobile/player/engine';
import { useHeartbeat } from '#mobile/player/heartbeat';
import { PlayerChrome } from '#mobile/player/PlayerChrome';
import { type SheetView, TrackSheet } from '#mobile/player/TrackSheet';
import { useStoryboard } from '#mobile/player/useStoryboard';
import { useSubAppearance } from '#mobile/player/useSubAppearance';
import { useSubtitles } from '#mobile/player/useSubtitles';

export function PlayerBody({
  item,
  startSec,
  localUri,
  offline,
}: Readonly<{
  item: MediaItem;
  startSec: number;
  localUri?: string;
  offline?: DownloadEntry;
}>) {
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const prefs = useLangPrefs();
  // The preferred audio language decides the OPENING track when the file carries
  // it (same as TV). Offline keeps the file's default: local ordinals are the
  // native player's business.
  const startAudio = localUri ? 0 : (preferredAudioIndex(audioTracksOf(item), prefs.audio) ?? 0);
  const engine = useKromaEngine(client, item, startSec, localUri, startAudio);
  const navigation = useNavigation();
  const subs = useSubtitles(client, item, offline, prefs.subtitle);
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
  const viewRef = useRef<VideoViewRef>(null);
  const next = useQuery({
    queryKey: ['next', item.id],
    queryFn: () => client.nextEpisode(item.id),
    enabled: !localUri && item.kind === 'episode',
    staleTime: 5 * 60_000,
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
  useEffect(() => {
    return navigation.addListener('beforeRemove', () => engine.shutdown());
  }, [navigation, engine]);

  useEffect(() => {
    if (engine.endedNonce === 0 || navigatedRef.current) return;
    navigatedRef.current = true;
    engine.shutdown();
    void client
      .nextEpisode(item.id)
      .then((next) => {
        if (next) router.replace(`/player/${next.id}` as never);
        else goBack(router);
      })
      .catch(() => goBack(router));
  }, [engine.endedNonce, engine, client, item.id, router]);

  if (terminated != null) {
    return (
      <ErrorView
        message={terminated || t('player.stoppedDefault')}
        retryLabel={t('player.back')}
        onRetry={() => goBack(router)}
      />
    );
  }

  if (engine.failed) {
    return (
      <ErrorView
        message={t('error.serverTitle')}
        retryLabel={t('player.back')}
        onRetry={() => goBack(router)}
      />
    );
  }

  return (
    <Box style={s.stage}>
      <VideoView
        ref={viewRef}
        player={engine.player}
        style={StyleSheet.absoluteFill}
        contentFit={fill ? 'cover' : 'contain'}
        nativeControls={false}
        allowsPictureInPicture
        startsPictureInPictureAutomatically
      />
      <PlayerChrome
        engine={engine}
        item={item}
        cue={subs.cueAt(engine.cur)}
        appearance={appearance}
        statsOn={statsOn}
        onToggleStats={() => setStatsOn((v) => !v)}
        fill={fill}
        onZoom={setFill}
        notice={subNotice}
        onBack={() => {
          engine.shutdown();
          goBack(router);
        }}
        onOpenSheet={(view) => setSheet(view ?? 'menu')}
        onPip={() => viewRef.current?.startPictureInPicture()}
        onCast={() => setCastOpen(true)}
        tileFor={tileFor}
        next={next.data ?? null}
        onPlayNext={() => {
          navigatedRef.current = true;
          engine.shutdown();
          if (next.data) router.replace(`/player/${next.data.id}` as never);
        }}
      />
      <CastPanel
        visible={castOpen}
        onClose={() => setCastOpen(false)}
        onPick={async (id) => {
          setCastOpen(false);
          if (!id) return;
          const ok = await cast.playOn(id, item.id, Math.round(engine.cur * 1000));
          // Stop local playback once the TV picks up the same title, to avoid
          // two screens playing it at once.
          if (ok) {
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
    </Box>
  );
}

const s = styles({
  stage: { flex: true, bg: 'bg' },
});
