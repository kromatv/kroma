import type { MediaItem } from '@kromatv/client/media';
import { episodeTag, formatRuntime, qualityBadge } from '@kromatv/core';
import { Box, Icon, type IconName, styles, Text, useStyles } from '@kromatv/ui/kit';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { ExpandableText } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { radius, spacing, type } from '#mobile/lib/theme';
import { PlayerRelated } from './player-related';
import type { SheetView } from './TrackSheet';

export function PlayerDetails({
  item,
  audio,
  subtitle,
  rate,
  next,
  similar,
  onOpenSheet,
  onPip,
  onPlay,
}: Readonly<{
  item: MediaItem;
  audio: string;
  subtitle: string;
  rate: number;
  next?: MediaItem | null;
  similar: MediaItem[];
  onOpenSheet(view: SheetView): void;
  onPip(): void;
  onPlay(item: MediaItem): void;
}>) {
  const s = useStyles(definition);
  const t = useT();
  const title = item.showTitle ?? item.metadata?.title ?? item.title;
  const episode = item.showTitle
    ? [episodeTag(item), item.metadata?.title ?? item.title].filter(Boolean).join(' · ')
    : null;
  const meta = [item.year, formatRuntime(item.durationMs), qualityBadge(item)]
    .filter(Boolean)
    .join(' · ');
  return (
    <ScrollView
      style={s.body}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.content}
    >
      <Box style={s.information}>
        <Box style={s.heading}>
          <Text style={s.title}>{title}</Text>
          {episode ? <Text style={s.episode}>{episode}</Text> : null}
          <Box style={s.metadata}>
            {meta ? <Text style={s.meta}>{meta}</Text> : null}
            {item.metadata?.rating ? (
              <Box style={s.rating}>
                <Icon name="star-filled" size={12} color="accentText" />
                <Text style={s.ratingText}>{item.metadata.rating.toFixed(1)}</Text>
              </Box>
            ) : null}
          </Box>
        </Box>
        {item.metadata?.overview ? (
          <ExpandableText lines={3}>{item.metadata.overview}</ExpandableText>
        ) : null}
        <Box>
          <Box style={s.preferences}>
            <SelectionRow
              icon="wave-sine"
              label={t('player.audioTrack')}
              value={audio}
              onPress={() => onOpenSheet('audio')}
            />
            <Box style={s.divider} />
            <SelectionRow
              icon="badge-cc"
              label={t('player.subtitles')}
              value={subtitle}
              onPress={() => onOpenSheet('subtitles')}
            />
          </Box>
          <Box style={s.tools}>
            <QuickControl
              icon="gauge"
              label={`${t('player.speed')} · ${rate}×`}
              onPress={() => onOpenSheet('speed')}
            />
            <QuickControl icon="picture-in-picture" label={t('player.pip')} onPress={onPip} />
          </Box>
        </Box>
      </Box>
      <PlayerRelated next={next} similar={similar} onPlay={onPlay} />
    </ScrollView>
  );
}

function SelectionRow({
  icon,
  label,
  value,
  onPress,
}: Readonly<{
  icon: IconName;
  label: string;
  value: string;
  onPress(): void;
}>) {
  const s = useStyles(definition);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [s.selection, pressed && s.pressed]}
    >
      <Box style={s.selectionIcon}>
        <Icon name={icon} size={22} color="textMuted" />
      </Box>
      <Box style={s.selectionText}>
        <Text style={s.selectionLabel}>{label}</Text>
        <Text lines={1} style={s.selectionValue}>
          {value}
        </Text>
      </Box>
      <Icon name="chevron-right" size={18} color="textDim" />
    </Pressable>
  );
}

function QuickControl({
  icon,
  label,
  onPress,
}: Readonly<{ icon: IconName; label: string; onPress(): void }>) {
  const s = useStyles(definition);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.tool, pressed && s.pressed]}
    >
      <Icon name={icon} size={18} color="textMuted" />
      <Text lines={1} style={s.toolLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const definition = styles({
  body: { flex: true },
  content: { pt: spacing.sm, pb: spacing.xl, gap: spacing.lg },
  information: { px: spacing.md, gap: spacing.lg },
  heading: { gap: spacing.sm },
  title: { ...type.title },
  episode: { ...type.caption, color: 'text' },
  metadata: { row: true, wrap: true, align: 'center', gap: spacing.sm + spacing.xs },
  meta: { ...type.caption },
  rating: { row: true, align: 'center', gap: spacing.xs },
  ratingText: { ...type.caption, color: 'accentText', fontWeight: '600' },
  preferences: { bg: 'surface1', radius: radius.lg, overflow: 'hidden' },
  selection: { row: true, align: 'center', gap: spacing.sm + spacing.xs, p: spacing.md },
  selectionIcon: { w: spacing.lg, align: 'center' },
  selectionText: { flex: true, minW: 0, gap: spacing.xs },
  selectionLabel: { ...type.small },
  selectionValue: { ...type.body, fontWeight: '600' },
  divider: {
    h: StyleSheet.hairlineWidth,
    bg: 'border',
    ml: spacing.md + spacing.lg + spacing.sm + spacing.xs,
    mr: spacing.md,
  },
  tools: { row: true, mt: spacing.sm, gap: spacing.sm },
  tool: {
    flex: true,
    minW: 0,
    row: true,
    align: 'center',
    justify: 'center',
    gap: spacing.sm,
    minH: 44,
    radius: radius.md,
  },
  toolLabel: { ...type.caption, shrink: 1 },
  pressed: { bg: 'surface2' },
});
