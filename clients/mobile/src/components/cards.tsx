import type { KromaClient } from '@kromatv/client';
import type { MediaCard, Show } from '@kromatv/client/media';
import { sizedImageUrl } from '@kromatv/core';
import { Box, styles, Text, useStyles, VirtualRail, WatchedBadge } from '@kromatv/ui/kit';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import type { HomeEntry } from '#mobile/lib/home-sections';
import { useGutters } from '#mobile/lib/layout';
import { posterWidth, radius, type } from '#mobile/lib/theme';
import { FadeImage } from './FadeImage';

const GAP = 12;

export interface CardModel {
  key: string;
  title: string;
  subtitle?: string;
  poster: string | null;
  route: string;
  watched?: boolean;
}

export function movieCard(item: MediaCard, client: KromaClient, width: number): CardModel {
  return {
    key: item.id,
    title: item.metadata?.title ?? item.title,
    subtitle: item.year ? String(item.year) : undefined,
    poster: sizedImageUrl(client.media.artwork.posterFor(item), width),
    route: `/item/${item.id}`,
  };
}

export function showCard(show: Show, client: KromaClient, width: number): CardModel {
  return {
    key: show.id,
    title: show.metadata?.title ?? show.title,
    subtitle: show.year ? String(show.year) : undefined,
    poster: sizedImageUrl(client.media.artwork.showPosterFor(show), width),
    route: `/show/${show.id}`,
  };
}

export function sectionCard(entry: HomeEntry, client: KromaClient, width: number): CardModel {
  return entry.type === 'movie'
    ? movieCard(entry.item, client, width)
    : showCard(entry.show, client, width);
}

/** A poster's height at a width, on whole points so a grid of them stacks
 * without drift. */
export const posterHeight = (width: number): number => Math.round(width * 1.5);

/** The label block under a labelled poster: two title lines and a year, at a
 * fixed height so every row of a grid is the same. */
export const POSTER_LABEL_H =
  6 + 2 * (type.caption.lineHeight ?? 18) + (type.small.lineHeight ?? 16);

// The fold keeps its share of the poster, so a phone's tile wears the same
// silhouette as a desktop's.
const badgeSize = (width: number | '100%') =>
  typeof width === 'number' ? Math.round(Math.min(40, Math.max(24, width * 0.27))) : 32;

export const PosterCard = memo(function PosterCard({
  card,
  width,
  labelled = false,
}: Readonly<{
  card: CardModel;
  width: number | '100%';
  labelled?: boolean;
}>) {
  const s = useStyles(sDefinition);

  const router = useRouter();
  const size =
    typeof width === 'number'
      ? { width, height: posterHeight(width) }
      : { width, aspectRatio: 2 / 3 };
  return (
    <Pressable
      onPress={() => router.push(card.route as never)}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.75 : 1 }]}
    >
      <Box style={[size, s.art]}>
        <FadeImage
          uri={card.poster}
          seed={card.key}
          radius={radius.sm}
          style={StyleSheet.absoluteFill}
        />
        {card.watched ? <WatchedBadge size={badgeSize(width)} /> : null}
      </Box>
      {labelled ? (
        <Box style={s.label}>
          <Text lines={2} style={s.labelTitle}>
            {card.title}
          </Text>
          {card.subtitle ? (
            <Text lines={1} style={s.labelSub}>
              {card.subtitle}
            </Text>
          ) : null}
        </Box>
      ) : null}
    </Pressable>
  );
});

export function MediaRail({ cards }: Readonly<{ cards: CardModel[] }>) {
  const { width: windowWidth } = useWindowDimensions();
  const gutters = useGutters();
  const width = posterWidth(windowWidth);
  return (
    <VirtualRail
      data={cards}
      itemWidth={width + GAP}
      gap={GAP}
      // The pitch only ever tightens on the phone, so the authored poster
      // height is the rail's ceiling.
      style={{ height: Math.ceil(width * 1.5) }}
      contentStyle={gutters.style}
      renderItem={(card) => <PosterCard card={card} width="100%" />}
    />
  );
}

const sDefinition = styles({
  art: { radius: radius.sm, overflow: 'hidden' },
  label: { h: POSTER_LABEL_H, pt: 6 },
  labelTitle: { ...type.caption, color: 'text', fontWeight: '600' },
  labelSub: { ...type.small },
});
