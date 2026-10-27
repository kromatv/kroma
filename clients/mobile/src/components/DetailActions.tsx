import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { MediaItem } from '@kromatv/client/media';
import { useCast } from '@kromatv/ui';
import { Box, Button, Icon, type IconName, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useRef } from 'react';
import { Alert, Pressable } from 'react-native';
import { CastSheet } from '#mobile/components/cast/CastSheet';
import { type DownloadState, useDownloads } from '#mobile/lib/downloads';
import { useT } from '#mobile/lib/i18n';
import { radius, spacing, type } from '#mobile/lib/theme';

function downloadBarLabel(state: DownloadState, t: ReturnType<typeof useT>): string {
  if (state.status === 'done') return t('offline.downloaded');
  if (state.status === 'downloading')
    return state.progress >= 0
      ? t('offline.downloading', { percent: Math.round(state.progress * 100) })
      : t('offline.downloading', { percent: '' }).replace('%', '').trim();
  if (state.status === 'paused')
    return state.progress >= 0
      ? `${t('offline.paused')} · ${Math.round(state.progress * 100)}%`
      : t('offline.paused');
  if (state.status === 'queued') return t('offline.queued');
  return t('offline.download');
}

function downloadIcon(state: DownloadState): IconName {
  if (state.status === 'done') return 'check';
  if (state.status === 'paused') return 'player-pause-filled';
  return 'download';
}

function DetailActionButton({
  primary = false,
  icon,
  label,
  onPress,
  progress = 0,
}: Readonly<{
  primary?: boolean;
  icon: IconName;
  label: string;
  onPress(): void;
  progress?: number;
}>) {
  const s = useStyles(sDefinition);
  return (
    <Box style={[s.actionFrame, !primary && s.downloadFrame]}>
      {progress > 0 ? (
        <Box
          style={[s.downloadFill, { width: `${Math.min(100, Math.round(progress * 100))}%` }]}
          pointerEvents="none"
        />
      ) : null}
      <Button
        block
        variant={primary ? 'primary' : 'ghost'}
        size="md"
        focusScale={1}
        style={s.actionButton}
        icon={icon}
        label={label}
        onPress={onPress}
      />
    </Box>
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
  const s = useStyles(sDefinition);

  const t = useT();
  const downloads = useDownloads();
  const state = downloads.stateFor(item.id);
  // Always offered: a cast button that appears only when a receiver happens to be
  // awake is one nobody learns exists. With no TV the picker says so.
  const { playOn } = useCast();
  const devices = useRef<BottomSheetModal>(null);
  return (
    <Box style={s.actions}>
      <DetailActionButton primary icon="player-play-filled" label={playLabel} onPress={onPlay} />
      <DetailActionButton
        icon={downloadIcon(state)}
        label={downloadBarLabel(state, t)}
        progress={state.status === 'downloading' || state.status === 'paused' ? state.progress : 0}
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
      />
      <Box style={s.secondaryRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: inList }}
          onPress={onToggleList}
          style={({ pressed }) => [s.secondary, pressed && s.secondaryPressed]}
        >
          {inList ? (
            <Icon name="bookmark-filled" size={24} color="accentText" />
          ) : (
            <Icon name="bookmark" size={24} thickness={2.2} />
          )}
          <Text lines={1} style={[s.secondaryLabel, inList && s.secondaryActive]}>
            {t('nav.myList')}
          </Text>
        </Pressable>
        {onToggleWatched ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: watched }}
            onPress={onToggleWatched}
            style={({ pressed }) => [s.secondary, pressed && s.secondaryPressed]}
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
          accessibilityRole="button"
          onPress={() => devices.current?.present()}
          style={({ pressed }) => [s.secondary, pressed && s.secondaryPressed]}
        >
          <Icon name="cast" size={24} thickness={1.8} />
          <Text lines={1} style={s.secondaryLabel}>
            {t('cast.title')}
          </Text>
        </Pressable>
        {onReport ? (
          <Pressable
            accessibilityRole="button"
            onPress={onReport}
            style={({ pressed }) => [s.secondary, pressed && s.secondaryPressed]}
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

const sDefinition = styles({
  actions: { gap: spacing.sm + spacing.xs },
  actionFrame: { radius: radius.lg, overflow: 'hidden' },
  actionButton: { radius: radius.lg },
  downloadFrame: { bg: 'surface2' },
  downloadFill: {
    absolute: true,
    top: 0,
    bottom: 0,
    left: 0,
    bg: 'accentSoft',
  },
  secondaryRow: { row: true, gap: spacing.xs, mt: spacing.xs },
  secondary: {
    flex: true,
    minW: 0,
    align: 'center',
    gap: spacing.sm,
    py: spacing.sm,
    radius: radius.md,
  },
  secondaryPressed: { bg: 'surface2' },
  secondaryLabel: { ...type.small, color: 'textMuted' },
  secondaryActive: { color: 'accentText' },
});
