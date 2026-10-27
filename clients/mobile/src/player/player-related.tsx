import type { MediaItem } from '@kromatv/client/media';
import { episodeTag, sizedImageUrl } from '@kromatv/core';
import { Box, Icon, styles, Text, useStyles } from '@kromatv/ui/kit';
import { Pressable, ScrollView } from 'react-native';
import { FadeImage } from '#mobile/components/FadeImage';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';

export function PlayerRelated({
  next,
  similar,
  onPlay,
}: Readonly<{
  next?: MediaItem | null;
  similar: MediaItem[];
  onPlay(item: MediaItem): void;
}>) {
  const s = useStyles(definition);
  const t = useT();
  const client = useClient();
  if (next)
    return (
      <Box style={s.nextSection}>
        <Text style={s.sectionTitle}>{t('player.upNextTitle')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('player.nextEpisode')}
          onPress={() => onPlay(next)}
          style={({ pressed }) => [s.next, pressed && s.pressed]}
        >
          <FadeImage
            seed={next.id}
            uri={sizedImageUrl(client.media.artwork.backdropFor(next), 320)}
            style={s.nextArt}
            radius={radius.sm}
          />
          <Box style={s.nextText}>
            <Text style={s.episode}>{episodeTag(next)}</Text>
            <Text lines={2} style={s.cardTitle}>
              {next.metadata?.title ?? next.title}
            </Text>
          </Box>
          <Icon name="player-play-filled" size={20} color="text" />
        </Pressable>
      </Box>
    );
  if (!similar.length) return null;
  return (
    <Box style={s.section}>
      <Text style={[s.sectionTitle, s.inset]}>{t('content.similarTitles')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
        {similar.slice(0, 8).map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${t('player.play')} ${item.metadata?.title ?? item.title}`}
            onPress={() => onPlay(item)}
            style={s.card}
          >
            <FadeImage
              seed={item.id}
              uri={sizedImageUrl(client.media.artwork.posterFor(item), 240)}
              style={s.poster}
              radius={radius.sm}
            />
            <Text lines={2} style={s.cardTitle}>
              {item.metadata?.title ?? item.title}
            </Text>
            {item.year ? <Text style={s.year}>{item.year}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </Box>
  );
}

const definition = styles({
  section: { gap: spacing.sm + spacing.xs },
  sectionTitle: { ...type.section },
  inset: { px: spacing.md },
  rail: { px: spacing.md, gap: spacing.sm + spacing.xs },
  card: { w: 112, gap: spacing.xs },
  poster: { w: 112, h: 168 },
  cardTitle: { ...type.caption, color: 'text', fontWeight: '600' },
  year: { ...type.small },
  nextSection: { px: spacing.md, gap: spacing.sm + spacing.xs },
  next: {
    row: true,
    align: 'center',
    gap: spacing.sm + spacing.xs,
    p: spacing.sm + spacing.xs,
    radius: radius.lg,
    bg: 'surface1',
  },
  nextArt: { w: 104, h: 62 },
  nextText: { flex: true, minW: 0, gap: spacing.xs },
  episode: { ...type.small },
  pressed: { bg: 'surface2' },
});
