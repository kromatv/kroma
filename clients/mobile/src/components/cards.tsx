// Poster + continue-watching cards and the horizontal media rail. Cards are
// pure presentation; navigation targets are resolved by the small helpers at
// the top so every screen routes titles the same way.

import {
  type ContinueItem,
  episodeTag,
  type KromaClient,
  type MediaItem,
  type SectionItem,
  type Show,
  sizedImageUrl,
} from '@kroma/core';
import { VirtualRail } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useGutters } from '#mobile/lib/layout';
import { usePlay } from '#mobile/lib/play';
import { colors, posterWidth, radius, type } from '#mobile/lib/theme';
import { FadeImage } from './FadeImage';

const GAP = 12;

export interface CardModel {
  key: string;
  title: string;
  subtitle?: string;
  poster: string | null;
  route: string;
}

export function movieCard(item: MediaItem, client: KromaClient, width: number): CardModel {
  return {
    key: item.id,
    title: item.metadata?.title ?? item.title,
    subtitle: item.year ? String(item.year) : undefined,
    poster: sizedImageUrl(client.posterFor(item), width),
    route: `/item/${item.id}`,
  };
}

export function showCard(show: Show, client: KromaClient, width: number): CardModel {
  return {
    key: show.id,
    title: show.metadata?.title ?? show.title,
    subtitle: show.year ? String(show.year) : undefined,
    poster: sizedImageUrl(client.showPosterFor(show), width),
    route: `/show/${show.id}`,
  };
}

export function sectionCard(entry: SectionItem, client: KromaClient, width: number): CardModel {
  return entry.type === 'movie'
    ? movieCard(entry.item, client, width)
    : showCard(entry.show, client, width);
}

export const PosterCard = memo(function PosterCard({
  card,
  width,
}: Readonly<{
  card: CardModel;
  width: number | '100%';
}>) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(card.route as never)}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.75 : 1 }]}
    >
      <FadeImage
        uri={card.poster}
        seed={card.key}
        radius={radius.sm}
        style={{ width, aspectRatio: 2 / 3 }}
      />
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
  const backdrop = sizedImageUrl(client.backdropFor(item) ?? client.posterFor(item), artWidth);
  const tag = episodeTag(item) || undefined;
  return (
    <Pressable
      onPress={() => void play(item.id)}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.75 : 1 }]}
    >
      <View>
        <FadeImage
          uri={backdrop}
          seed={item.id}
          radius={radius.sm}
          style={{ width, aspectRatio: 16 / 9 }}
        />
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${frac * 100}%` }]} />
        </View>
      </View>
      <Text numberOfLines={1} style={styles.cardTitle}>
        {item.showTitle ?? item.metadata?.title ?? item.title}
      </Text>
      {tag ? <Text style={styles.cardSub}>{tag}</Text> : null}
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

const styles = StyleSheet.create({
  cardTitle: { ...type.caption, color: colors.text, marginTop: 6 },
  cardSub: { ...type.small, marginTop: 1 },
  progressTrack: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(244, 243, 240, 0.3)',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
});
