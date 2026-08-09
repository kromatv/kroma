// Offline downloads screen: active downloads show a progress ring, finished
// ones are swipe-to-delete rows.

import { episodeTag, formatRuntime, type MediaItem } from '@kroma/core';
import { Box, Icon, styles, Txt } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Alert, FlatList, Pressable } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { FadeImage } from '#mobile/components/FadeImage';
import { PageHeader } from '#mobile/components/PageHeader';
import { ProgressRing } from '#mobile/components/ProgressRing';
import { EmptyState, Screen } from '#mobile/components/ui';
import { type DownloadEntry, formatBytes, useDownloads } from '#mobile/lib/downloads';
import { useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { useClient } from '#mobile/lib/session';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

function RowArt({ uri, seed }: Readonly<{ uri: string | null; seed: string }>) {
  return (
    <Box>
      <FadeImage uri={uri} seed={seed} radius={radius.sm} style={s.thumb} />
      <Box style={s.playBadge}>
        <Box style={s.playCircle}>
          <Icon name="player-play-filled" size={15} />
        </Box>
      </Box>
    </Box>
  );
}

function DownloadRow({ entry }: Readonly<{ entry: DownloadEntry }>) {
  const t = useT();
  const router = useRouter();
  const downloads = useDownloads();
  const swipeRef = useRef<SwipeableMethods>(null);
  const { item } = entry;
  const sub = [episodeTag(item), formatRuntime(item.durationMs), formatBytes(entry.sizeBytes)]
    .filter(Boolean)
    .join(' · ');

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      overshootRight={false}
      friction={1.6}
      rightThreshold={36}
      renderRightActions={() => (
        <Pressable
          onPress={() => {
            swipeRef.current?.close();
            void downloads.remove(item.id);
          }}
          style={s.deleteAction}
        >
          <Icon name="trash" size={22} stroke={2} />
          <Txt style={s.deleteLabel}>{t('common.delete')}</Txt>
        </Pressable>
      )}
    >
      <Pressable
        onPress={() => router.push(`/player/${item.id}` as never)}
        style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surface }]}
      >
        <RowArt uri={entry.backdropUrl ?? entry.posterUrl} seed={item.id} />
        <Box style={s.text}>
          <Txt lines={2} style={s.rowTitle}>
            {item.showTitle ?? item.metadata?.title ?? item.title}
          </Txt>
          <Txt lines={1} style={s.rowSub}>
            {sub}
          </Txt>
        </Box>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

function activeLabel(
  t: ReturnType<typeof useT>,
  progress: number,
  mode: 'downloading' | 'paused' | 'queued',
): string {
  if (mode === 'queued') return t('offline.queued');
  if (mode === 'paused') {
    return progress >= 0
      ? `${t('offline.paused')} · ${Math.round(progress * 100)}%`
      : t('offline.paused');
  }
  if (progress >= 0) return t('offline.downloading', { percent: Math.round(progress * 100) });
  return t('offline.downloading', { percent: '' }).replace('%', '').trim();
}

function ActiveRow({
  item,
  progress,
  mode,
}: Readonly<{
  item: MediaItem;
  progress: number;
  mode: 'downloading' | 'paused' | 'queued';
}>) {
  const t = useT();
  const client = useClient();
  const downloads = useDownloads();
  const showOptions = () => {
    if (mode === 'queued') {
      Alert.alert(t('offline.cancelDownload'), undefined, [
        { text: t('common.back'), style: 'cancel' },
        {
          text: t('offline.cancelDownload'),
          style: 'destructive',
          onPress: () => downloads.cancel(item.id),
        },
      ]);
      return;
    }
    const paused = mode === 'paused';
    Alert.alert(item.showTitle ?? item.metadata?.title ?? item.title, undefined, [
      {
        text: t(paused ? 'offline.resume' : 'offline.pause'),
        onPress: () => (paused ? downloads.resume(item.id) : downloads.pause(item.id)),
      },
      {
        text: t('offline.cancelDownload'),
        style: 'destructive',
        onPress: () => downloads.cancel(item.id),
      },
      { text: t('common.back'), style: 'cancel' },
    ]);
  };
  return (
    <Pressable onPress={showOptions} style={s.row}>
      <RowArt uri={client.backdropFor(item) ?? client.posterFor(item)} seed={item.id} />
      <Box style={s.text}>
        <Txt lines={2} style={s.rowTitle}>
          {item.showTitle ?? item.metadata?.title ?? item.title}
        </Txt>
        <Txt lines={1} style={s.rowSub}>
          {activeLabel(t, progress, mode)}
        </Txt>
      </Box>
      <Box style={s.ringBox}>
        {mode === 'paused' ? (
          <Box style={s.pausedRing}>
            <ProgressRing progress={Math.max(0.02, progress)} size={36} />
            <Box pointerEvents="none" style={s.pausedRingGlyph}>
              <Icon name="player-pause-filled" size={12} color={colors.textDim} />
            </Box>
          </Box>
        ) : (
          <ProgressRing progress={progress} size={36} />
        )}
      </Box>
    </Pressable>
  );
}

function LegendItem({
  color,
  outlined,
  label,
}: Readonly<{ color?: string; outlined?: boolean; label: string }>) {
  return (
    <Box style={s.legendItem}>
      <Box
        style={[
          s.legendDot,
          outlined
            ? { borderWidth: 1.5, borderColor: colors.borderStrong }
            : { backgroundColor: color },
        ]}
      />
      <Txt style={s.legendText}>{label}</Txt>
    </Box>
  );
}

function StorageMeter() {
  const t = useT();
  const downloads = useDownloads();
  const storage = useQuery({
    queryKey: ['deviceStorage'],
    queryFn: async () => ({
      free: await FileSystem.getFreeDiskStorageAsync(),
      total: await FileSystem.getTotalDiskCapacityAsync(),
    }),
    refetchInterval: 30_000,
  });
  if (!storage.data || storage.data.total <= 0) return null;
  const { free, total } = storage.data;
  const app = downloads.totalBytes;
  const other = Math.max(0, total - free - app);
  return (
    <Box style={s.meter}>
      <Box style={s.meterTrack}>
        <Box style={[s.meterFill, { flex: other / total }]} />
        {app > 0 ? (
          <Box
            style={[
              s.meterFill,
              // A film on a terabyte of flash is a fraction of a pixel; a
              // download that exists must stay visible.
              { flex: app / total, minWidth: 6, backgroundColor: colors.accent },
            ]}
          />
        ) : null}
        <Box style={{ flex: free / total }} />
      </Box>
      <Box style={s.meterLegend}>
        {app > 0 ? (
          <LegendItem color={colors.accent} label={`KROMA · ${formatBytes(app)}`} />
        ) : null}
        <LegendItem
          color={colors.borderStrong}
          label={`${t('offline.storageOther')} · ${formatBytes(other)}`}
        />
        <LegendItem outlined label={`${t('offline.storageFree')} · ${formatBytes(free)}`} />
      </Box>
    </Box>
  );
}

export default function Downloads() {
  const t = useT();
  const downloads = useDownloads();
  const hasAnything =
    downloads.entries.length > 0 ||
    downloads.downloading.length > 0 ||
    downloads.paused.length > 0 ||
    downloads.queuedItems.length > 0;

  return (
    <Screen padded={false}>
      <PageHeader title={t('offline.downloads')} />
      {hasAnything ? (
        <FlatList
          data={downloads.entries}
          keyExtractor={(e) => e.itemId}
          renderItem={({ item }) => <DownloadRow entry={item} />}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            downloads.downloading.length > 0 ||
            downloads.paused.length > 0 ||
            downloads.queuedItems.length > 0 ? (
              <Box style={s.activeBlock}>
                {downloads.downloading.map(({ item, progress }) => (
                  <ActiveRow key={item.id} item={item} progress={progress} mode="downloading" />
                ))}
                {downloads.paused.map(({ item, progress }) => (
                  <ActiveRow key={item.id} item={item} progress={progress} mode="paused" />
                ))}
                {downloads.queuedItems.map((item) => (
                  <ActiveRow key={item.id} item={item} progress={-1} mode="queued" />
                ))}
              </Box>
            ) : null
          }
          ListFooterComponent={<StorageMeter />}
        />
      ) : (
        <EmptyState
          icon={<Icon name="download" size={34} stroke={2} color={colors.textDim} />}
          title={t('offline.downloads')}
          hint={t('offline.empty')}
        />
      )}
    </Screen>
  );
}

const s = styles({
  list: { gap: 4, px: spacing.md, pb: spacing.xl, ...boxed(contentWidth.reading) },
  activeBlock: { gap: 4, mb: spacing.sm },
  row: { row: true, align: 'center', gap: 12, p: 8, bg: 'bg', radius: radius.md },
  thumb: { w: 130, h: 73 },
  playBadge: { absolute: true, top: 0, right: 0, bottom: 0, left: 0, center: true },
  playCircle: { center: true, w: 32, h: 32, bg: 'bg/55', radius: 16 },
  text: { flex: true, gap: 3 },
  rowTitle: { ...type.body, fontWeight: '600' },
  rowSub: { ...type.small },
  ringBox: { pr: 4 },
  pausedRing: { center: true },
  pausedRingGlyph: { absolute: true, top: 0, right: 0, bottom: 0, left: 0, center: true },
  deleteAction: { center: true, gap: 4, w: 92, ml: 8, bg: 'danger', radius: radius.md },
  deleteLabel: { ...type.small, color: 'text', fontWeight: '700' },
  meter: { gap: 10, px: 8, mt: spacing.lg },
  meterTrack: { row: true, gap: 2, h: 8, bg: 'surface2', radius: 999, overflow: 'hidden' },
  meterFill: { bg: 'borderStrong', radius: 999 },
  meterLegend: { row: true, wrap: true, justify: 'center', columnGap: spacing.md, rowGap: 6 },
  legendItem: { row: true, align: 'center', gap: 6 },
  legendDot: { w: 8, h: 8, radius: 4 },
  legendText: { ...type.small, color: 'textMuted' },
});
