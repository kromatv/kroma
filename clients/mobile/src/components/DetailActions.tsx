// Netflix-style action block for the detail pages: full-width accent play,
// full-width quiet download bar, then a centered row of equal-width icon-label
// actions (my list / watched / report) with an amber icon + label active state.

import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { MediaItem } from '@kroma/core';
import { useCast } from '@kroma/ui';
import { Button, Icon } from '@kroma/ui/kit';
import { useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { CastSheet } from '#mobile/components/cast/CastSheet';
import { type DownloadState, useDownloads } from '#mobile/lib/downloads';
import { useT } from '#mobile/lib/i18n';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

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
    return <Icon name="check" size={20} stroke={2.4} color={colors.accent} />;
  if (state.status === 'paused')
    return <Icon name="player-pause-filled" size={18} color={colors.textDim} />;
  return (
    <Icon
      name="download"
      size={20}
      stroke={2}
      color={state.status === 'downloading' ? colors.accent : colors.text}
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
  // Always offered, like the cast control in the app's chrome: a button that
  // shows up only when a set happens to be awake is one nobody learns exists.
  // With no TV the picker says so in a line.
  const { playOn } = useCast();
  const devices = useRef<BottomSheetModal>(null);
  return (
    <View style={styles.actions}>
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
        style={({ pressed }) => [styles.downloadBar, pressed && { opacity: 0.85 }]}
      >
        {(state.status === 'downloading' || state.status === 'paused') && state.progress > 0 ? (
          <View
            style={[styles.downloadBarFill, { width: `${Math.round(state.progress * 100)}%` }]}
            pointerEvents="none"
          />
        ) : null}
        {barIcon(state)}
        <Text style={[styles.downloadBarLabel, bar.done && { color: colors.accent }]}>
          {bar.label}
        </Text>
      </Pressable>
      <View style={styles.secondaryRow}>
        <Pressable
          onPress={onToggleList}
          style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}
        >
          {inList ? (
            <Icon name="check" size={24} stroke={2.4} color={colors.accent} />
          ) : (
            <Icon name="plus" size={24} stroke={2.2} />
          )}
          <Text numberOfLines={1} style={[styles.secondaryLabel, inList && styles.secondaryActive]}>
            {t('nav.myList')}
          </Text>
        </Pressable>
        {onToggleWatched ? (
          <Pressable
            onPress={onToggleWatched}
            style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}
          >
            {watched ? (
              <Icon name="eye-check" size={24} stroke={1.8} color={colors.accent} />
            ) : (
              <Icon name="eye" size={24} stroke={1.8} />
            )}
            <Text
              numberOfLines={1}
              style={[styles.secondaryLabel, watched && styles.secondaryActive]}
            >
              {t('content.watched')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => devices.current?.present()}
          style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}
        >
          <Icon name="cast" size={24} stroke={1.8} />
          <Text numberOfLines={1} style={styles.secondaryLabel}>
            {t('cast.title')}
          </Text>
        </Pressable>
        {onReport ? (
          <Pressable
            onPress={onReport}
            style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}
          >
            <Icon name="flag" size={24} stroke={1.8} />
            <Text numberOfLines={1} style={styles.secondaryLabel}>
              {t('reports.sheet')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {/* Picking a TV here STARTS the title on it - the position is the account's
          own resume point, which the receiver already knows. */}
      <CastSheet
        ref={devices}
        offerLocal={false}
        onPick={(id) => {
          devices.current?.dismiss();
          if (id) void playOn(id, item.id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
  downloadBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  downloadBarLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  downloadBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  secondary: { alignItems: 'center', gap: 5, width: 84, paddingVertical: 2 },
  secondaryLabel: { ...type.small, color: colors.textDim },
  secondaryActive: { color: colors.accent },
});
