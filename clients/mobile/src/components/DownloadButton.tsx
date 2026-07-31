// Offline download affordance: idle arrow, live progress ring, done check.
// Long-press (or tap when done) removes the download.

import type { MediaItem } from '@kroma/core';
import { Icon, IconButton, styles } from '@kroma/ui/kit';
import { useMemo } from 'react';
import { Alert, View } from 'react-native';
import { useDownloads } from '#mobile/lib/downloads';
import { useT } from '#mobile/lib/i18n';
import { colors } from '#mobile/lib/theme';
import { ProgressRing } from './ProgressRing';

const RING = 34;

export function DownloadButton({ item, size = 22 }: Readonly<{ item: MediaItem; size?: number }>) {
  const t = useT();
  const downloads = useDownloads();
  const state = downloads.stateFor(item.id);
  const eligible = useMemo(() => downloads.canDownload(item), [downloads, item]);
  if (!eligible && state.status === 'none') return null;

  const onPress = () => {
    if (state.status === 'none') downloads.start(item);
    else if (state.status === 'queued') downloads.cancel(item.id);
    else if (state.status === 'downloading') {
      Alert.alert(item.metadata?.title ?? item.title, undefined, [
        { text: t('offline.pause'), onPress: () => downloads.pause(item.id) },
        {
          text: t('offline.cancelDownload'),
          style: 'destructive',
          onPress: () => downloads.cancel(item.id),
        },
        { text: t('common.back'), style: 'cancel' },
      ]);
    } else if (state.status === 'paused') {
      Alert.alert(item.metadata?.title ?? item.title, t('offline.paused'), [
        { text: t('offline.resume'), onPress: () => downloads.resume(item.id) },
        {
          text: t('offline.cancelDownload'),
          style: 'destructive',
          onPress: () => downloads.cancel(item.id),
        },
        { text: t('common.back'), style: 'cancel' },
      ]);
    } else if (state.status === 'done') {
      Alert.alert(t('offline.downloaded'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('offline.remove'),
          style: 'destructive',
          onPress: () => void downloads.remove(item.id),
        },
      ]);
    }
  };

  let glyph = <Icon name="download" size={size} stroke={2} />;
  if (state.status === 'downloading') glyph = <ProgressRing progress={state.progress} />;
  else if (state.status === 'paused')
    glyph = (
      <View style={s.pausedBox}>
        <ProgressRing progress={Math.max(0.02, state.progress)} />
        <View pointerEvents="none" style={s.pausedGlyph}>
          <Icon name="player-pause-filled" size={11} color={colors.textDim} />
        </View>
      </View>
    );
  else if (state.status === 'queued') glyph = <ProgressRing progress={-1} />;
  else if (state.status === 'done')
    glyph = (
      <View style={s.doneBadge}>
        <Icon name="check" size={size - 6} stroke={2.4} color={colors.accentInk} />
      </View>
    );

  return (
    <IconButton variant="ghost" size={RING} hitSlop={10} onPress={onPress}>
      {glyph}
    </IconButton>
  );
}

const s = styles({
  pausedBox: { center: true },
  pausedGlyph: { absolute: true, top: 0, right: 0, bottom: 0, left: 0, center: true },
  doneBadge: { center: true, w: RING - 6, h: RING - 6, bg: 'accent', radius: (RING - 6) / 2 },
});
