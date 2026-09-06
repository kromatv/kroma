// Poster + continue-watching cards and the horizontal media rail. Cards are
// pure presentation; navigation targets are resolved by the small helpers at
// the top so every screen routes titles the same way.

import type { KromaClient } from '@kroma/client';
import type { ContinueItem, MediaItem, SectionItem, Show } from '@kroma/client/media';
import { episodeTag, sizedImageUrl } from '@kroma/core';
import { Box, styles, Text, VirtualRail, WatchedBadge } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useGutters } from '#mobile/lib/layout';
import { usePlay } from '#mobile/lib/play';
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

export function movieCard(item: MediaItem, client: KromaClient, width: number): CardModel {
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

export function sectionCard(entry: SectionItem, client: KromaClient, width: number): CardModel {
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

/** Landscape resume tile: backdrop, remaining-progress bar, episode tag. */
export function ContinueCard({
  entry,
  client,
  width,
  artWidth,
}: Readonly<{
  entry: ContinueItem;
  client: KromaClient;
  width: number | '100%';
  artWidth: number;
}>) {
  const { play } = usePlay();
  const { item, positionMs, durationMs } = entry;
  const total = durationMs ?? item.durationMs ?? 0;
  const frac = total > 0 ? Math.min(1, positionMs / total) : 0;
  const backdrop = sizedImageUrl(
    client.media.artwork.backdropFor(item) ?? client.media.artwork.posterFor(item),
    artWidth,
  );
  const tag = episodeTag(item) || undefined;
  return (
    <Pressable
      onPress={() => void play(item.id)}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.75 : 1 }]}
    >
      <Box>
        <FadeImage
          uri={backdrop}
          seed={item.id}
          radius={radius.sm}
          style={{ width, aspectRatio: 16 / 9 }}
        />
        <Box style={s.progressTrack}>
          <Box style={[s.progressFill, { width: `${frac * 100}%` }]} />
        </Box>
      </Box>
      <Text lines={1} style={s.cardTitle}>
        {item.showTitle ?? item.metadata?.title ?? item.title}
      </Text>
      {tag ? <Text style={s.cardSub}>{tag}</Text> : null}
    </Pressable>
  );
}

const CONTINUE_TEXT = 42;

export function ContinueRail({
  entries,
  client,
}: Readonly<{
  entries: ContinueItem[];
  client: KromaClient;
}>) {
  const { width: windowWidth } = useWindowDimensions();
  const gutters = useGutters();
  const width = Math.min(300, windowWidth * 0.55);
  return (
    <VirtualRail
      data={entries}
      itemWidth={width + GAP}
      gap={GAP}
      style={{ height: Math.ceil((width * 9) / 16) + CONTINUE_TEXT }}
      contentStyle={gutters.style}
      renderItem={(entry) => (
        <ContinueCard entry={entry} client={client} width="100%" artWidth={width} />
      )}
    />
  );
}

const s = styles({
  art: { radius: radius.sm, overflow: 'hidden' },
  label: { h: POSTER_LABEL_H, pt: 6 },
  labelTitle: { ...type.caption, color: 'text', fontWeight: '600' },
  labelSub: { ...type.small },
  cardTitle: { ...type.caption, mt: 6, color: 'text' },
  cardSub: { ...type.small, mt: 1 },
  progressTrack: { absolute: true, right: 6, bottom: 6, left: 6, h: 3, bg: 'text/30', radius: 2 },
  progressFill: { h: 3, bg: 'accent', radius: 2 },
});
