import type { MediaItem } from '@kromatv/client/media';
import { audioTracksOf, langCode, preferredAudioIndex } from '@kromatv/core';
import { useHeldSeek } from '@kromatv/core/react';
import { useCast } from '@kromatv/ui';
import { Box, styles } from '@kromatv/ui/kit';
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
import { audioOptions, qualityBadge } from '#mobile/player/trackOptions';
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
  // Offline keeps the file's default: local ordinals are the native player's
  // business.
  const startAudio = localUri ? 0 : (preferredAudioIndex(audioTracksOf(item), prefs.audio) ?? 0);
  const engine = useHeldSeek(useKromaEngine(client, item, startSec, localUri, startAudio));
  const navigation = useNavigation();
  const subs = useSubtitles(client, item, offline, prefs.subtitle);
  const tileFor = useStoryboard(client, item, !localUri, offline);
  const [sheet, setSheet] = useState<SheetView | null>(null);
  const [appearance, setAppearance] = useSubAppearance();
  const [statsOn, setStatsOn] = useState(false);
  const [fill, setFill] = useState(false);

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
    ...client.query.playback.nextEpisode(item.id),
    enabled: !localUri && item.kind === 'episode',
    staleTime: 5 * 60_000,
  });

  const cast = useCast();
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
    void client.playback
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
        resumedAt={startSec}
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
        audio={audioOptions(engine, item, t)}
        audioIndex={engine.audioIndex}
        onAudio={(track) => {
          engine.setAudio(track.index);
          if (track.prefCode) prefs.setAudio(track.prefCode);
        }}
        rate={engine.rate}
        onRate={engine.setRate}
        statsOn={statsOn}
        onToggleStats={() => setStatsOn((v) => !v)}
        extras={{
          quality: `${t('player.qualityAuto')}${qualityBadge(item)}`,
          filter: engine.offline ? undefined : { mode: engine.filter, onPick: engine.setFilter },
          subtitles: {
            of: subs,
            onPick: (index, language) => {
              subs.pick(index);
              if (language) prefs.setSubtitle(language);
            },
          },
          appearance: { value: appearance, onChange: setAppearance },
          onReport: () => {
            setSheet(null);
            router.push(
              `/report/${item.id}?kind=${item.kind === 'episode' ? 'episode' : 'movie'}` as never,
            );
          },
        }}
      />
    </Box>
  );
}

const s = styles({
  stage: { flex: true, bg: 'bg' },
});
