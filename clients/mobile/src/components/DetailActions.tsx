import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { MediaItem } from '@kroma/core';
import { useCast } from '@kroma/ui';
import { Box, Button, Icon, styles, Text } from '@kroma/ui/kit';
import { useRef } from 'react';
import { Alert, Pressable } from 'react-native';
import { CastSheet } from '#mobile/components/cast/CastSheet';
import { type DownloadState, useDownloads } from '#mobile/lib/downloads';
import { useT } from '#mobile/lib/i18n';
import { radius, spacing, type } from '#mobile/lib/theme';

function downloadBarLabel(
  state: DownloadState,
  t: ReturnType<typeof useT>,
): { label: string; done: boolean } {
  if (state.status === 'done') return { label: t('offline.downloaded'), done: true };
  if (state.status === 'downloading')
    return {
      label:
        state.progress >= 0
          ? t('offline.downloading', { percent: Math.round(state.progress * 100) })
          : t('offline.downloading', { percent: '' }).replace('%', '').trim(),
      done: false,
    };
  if (state.status === 'paused')
    return {
      label:
        state.progress >= 0
          ? `${t('offline.paused')} · ${Math.round(state.progress * 100)}%`
          : t('offline.paused'),
      done: false,
    };
  if (state.status === 'queued') return { label: t('offline.queued'), done: false };
  return { label: t('offline.download'), done: false };
}

function barIcon(state: DownloadState) {
  if (state.status === 'done')
    return <Icon name="check" size={20} thickness={2.4} color="accentText" />;
  if (state.status === 'paused')
    return <Icon name="player-pause-filled" size={18} color="textMuted" />;
  return (
    <Icon
      name="download"
      size={20}
      thickness={2}
      color={state.status === 'downloading' ? 'accent' : 'text'}
    />
  );
}

export function DetailActions({
  playLabel,
  onPlay,
  inList,
  onToggleList,
  watched,
  onToggleWatched,
  onReport,
  item,
}: Readonly<{
  playLabel: string;
  onPlay(): void;
  inList: boolean;
  onToggleList(): void;
  watched?: boolean;
  onToggleWatched?(): void;
  onReport?(): void;
  item: MediaItem;
}>) {
  const t = useT();
  const downloads = useDownloads();
  const state = downloads.stateFor(item.id);
  const bar = downloadBarLabel(state, t);
  // Always offered: a cast button that appears only when a receiver happens to be
  // awake is one nobody learns exists. With no TV the picker says so.
  const { playOn } = useCast();
  const devices = useRef<BottomSheetModal>(null);
  return (
    <Box style={s.actions}>
      <Button icon="player-play-filled" label={playLabel} onPress={onPlay} />
      <Pressable
        onPress={() => {
          const title = item.metadata?.title ?? item.title;
          if (state.status === 'none') downloads.start(item);
          else if (state.status === 'queued') downloads.cancel(item.id);
          else if (state.status === 'downloading') {
            Alert.alert(title, undefined, [
              { text: t('offline.pause'), onPress: () => downloads.pause(item.id) },
              {
                text: t('offline.cancelDownload'),
                style: 'destructive',
                onPress: () => downloads.cancel(item.id),
              },
              { text: t('common.back'), style: 'cancel' },
            ]);
          } else if (state.status === 'paused') {
            Alert.alert(title, undefined, [
              { text: t('offline.resume'), onPress: () => downloads.resume(item.id) },
              {
                text: t('offline.cancelDownload'),
                style: 'destructive',
                onPress: () => downloads.cancel(item.id),
              },
              { text: t('common.back'), style: 'cancel' },
            ]);
          } else if (state.status === 'done') void downloads.remove(item.id);
        }}
        style={({ pressed }) => [s.downloadBar, pressed && { opacity: 0.85 }]}
      >
        {(state.status === 'downloading' || state.status === 'paused') && state.progress > 0 ? (
          <Box
            style={[s.downloadBarFill, { width: `${Math.round(state.progress * 100)}%` }]}
            pointerEvents="none"
          />
        ) : null}
        {barIcon(state)}
        <Text style={[s.downloadBarLabel, bar.done && s.downloadBarLabelDone]}>{bar.label}</Text>
      </Pressable>
      <Box style={s.secondaryRow}>
        <Pressable
          onPress={onToggleList}
          style={({ pressed }) => [s.secondary, pressed && { opacity: 0.7 }]}
        >
          {inList ? (
            <Icon name="check" size={24} thickness={2.4} color="accentText" />
          ) : (
            <Icon name="plus" size={24} thickness={2.2} />
          )}
          <Text lines={1} style={[s.secondaryLabel, inList && s.secondaryActive]}>
            {t('nav.myList')}
          </Text>
        </Pressable>
        {onToggleWatched ? (
          <Pressable
            onPress={onToggleWatched}
            style={({ pressed }) => [s.secondary, pressed && { opacity: 0.7 }]}
          >
            {watched ? (
              <Icon name="eye-check" size={24} thickness={1.8} color="accentText" />
            ) : (
              <Icon name="eye" size={24} thickness={1.8} />
            )}
            <Text lines={1} style={[s.secondaryLabel, watched && s.secondaryActive]}>
              {t('content.watched')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => devices.current?.present()}
          style={({ pressed }) => [s.secondary, pressed && { opacity: 0.7 }]}
        >
          <Icon name="cast" size={24} thickness={1.8} />
          <Text lines={1} style={s.secondaryLabel}>
            {t('cast.title')}
          </Text>
        </Pressable>
        {onReport ? (
          <Pressable
            onPress={onReport}
            style={({ pressed }) => [s.secondary, pressed && { opacity: 0.7 }]}
          >
            <Icon name="flag" size={24} thickness={1.8} />
            <Text lines={1} style={s.secondaryLabel}>
              {t('reports.sheet')}
            </Text>
          </Pressable>
        ) : null}
      </Box>
      {/* Picking a TV starts the title on it, from the account's own resume
          point, which the receiver already knows. */}
      <CastSheet
        ref={devices}
        offerLocal={false}
        onPick={(id) => {
          devices.current?.dismiss();
          if (id) void playOn(id, item.id);
        }}
      />
    </Box>
  );
}

const s = styles({
  actions: { gap: spacing.sm },
  downloadBar: {
    row: true,
    center: true,
    gap: 10,
    minH: 48,
    bg: 'surface2',
    radius: radius.md,
    overflow: 'hidden',
  },
  downloadBarLabel: { color: 'text', fontSize: 15, fontWeight: '700' },
  downloadBarLabelDone: { color: 'accentText' },
  downloadBarFill: {
    absolute: true,
    top: 0,
    bottom: 0,
    left: 0,
    bg: 'accentSoft',
    radius: radius.md,
  },
  secondaryRow: { row: true, justify: 'center', gap: spacing.lg, mt: spacing.xs },
  secondary: { align: 'center', gap: 5, w: 84, py: 2 },
  secondaryLabel: { ...type.small, color: 'textMuted' },
  secondaryActive: { color: 'accentText' },
});
