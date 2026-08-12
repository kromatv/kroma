// Shows a suggested list while the query is empty; debounced results render
// as a poster grid.

import { type MediaItem, sizedImageUrl } from '@kroma/core';
import { Box, Field, Icon, styles, Text } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type CardModel, movieCard, showCard } from '#mobile/components/cards';
import { FadeImage } from '#mobile/components/FadeImage';
import { gridMetrics, PosterGrid } from '#mobile/components/PosterGrid';
import { EmptyState, Loading } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { usePlay } from '#mobile/lib/play';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, TAB_BAR_CLEARANCE, type } from '#mobile/lib/theme';

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function SuggestedRow({ item }: Readonly<{ item: MediaItem }>) {
  const client = useClient();
  const router = useRouter();
  const { play } = usePlay();
  const gutters = useGutters();
  return (
    <Pressable
      onPress={() => router.push(`/item/${item.id}` as never)}
      style={({ pressed }) => [s.suggestRow, gutters.style, pressed && s.suggestRowPressed]}
    >
      <FadeImage
        uri={sizedImageUrl(client.backdropFor(item) ?? client.posterFor(item), 480)}
        seed={item.id}
        radius={radius.sm}
        style={s.suggestThumb}
      />
      <Text lines={2} style={s.suggestTitle}>
        {item.metadata?.title ?? item.title}
      </Text>
      <Pressable
        onPress={() => void play(item.id)}
        hitSlop={8}
        style={({ pressed }) => [s.suggestPlay, pressed && s.suggestPlayPressed]}
      >
        <Icon name="player-play-filled" size={16} />
      </Pressable>
    </Pressable>
  );
}

export default function Search() {
  const t = useT();
  const client = useClient();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const gutters = useGutters();
  const { cardW } = gridMetrics(width, gutters.left + gutters.right);
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 300);

  const results = useQuery({
    queryKey: ['search', q],
    queryFn: () => client.search(q, { limit: 60 }),
    enabled: q.length >= 2,
    placeholderData: (prev) => prev,
  });
  const suggested = useQuery({
    queryKey: ['forYou'],
    queryFn: () => client.forYou(),
    staleTime: 10 * 60_000,
  });

  const cards: CardModel[] = (results.data?.results ?? []).map((hit) =>
    hit.type === 'show' ? showCard(hit.show, client, cardW) : movieCard(hit.item, client, cardW),
  );

  function searchBody(): React.ReactElement | null {
    if (q.length >= 2 && results.isPending) return <Loading label={t('common.loading')} />;
    if (q.length >= 2 && cards.length > 0) return <PosterGrid cards={cards} gutters={gutters} />;
    if (q.length >= 2 && results.isSuccess)
      return (
        <EmptyState
          icon={<Icon name="search" size={34} thickness={1.8} color="textMuted" />}
          title={t('search.noResults')}
          hint={t('search.placeholder')}
        />
      );
    return (
      <FlatList
        data={(suggested.data ?? []).slice(0, 12)}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SuggestedRow item={item} />}
        ListHeaderComponent={
          <Text style={[s.suggestHeader, gutters.style]}>{t('content.forYou')}</Text>
        }
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        keyboardShouldPersistTaps="handled"
      />
    );
  }

  return (
    <Box style={[s.screen, { paddingTop: insets.top + spacing.sm }]}>
      <Box style={[s.inputBox, gutters.style]}>
        <Text style={s.pageTitle}>{t('nav.search')}</Text>
        <Field.Root
          label={t('search.placeholder')}
          hideLabel
          value={query}
          onValueChange={setQuery}
        >
          <Field.Input icon="search" placeholder={t('search.placeholder')} />
        </Field.Root>
      </Box>
      {searchBody()}
    </Box>
  );
}

const s = styles({
  screen: { flex: true, bg: 'bg' },
  inputBox: { gap: spacing.sm, pb: spacing.md },
  pageTitle: { ...type.display, fontSize: 30 },
  suggestHeader: { ...type.section, mb: spacing.sm },
  suggestRow: { row: true, align: 'center', gap: 12, py: 6 },
  suggestRowPressed: { bg: 'surface1' },
  suggestThumb: { w: 130, h: 73 },
  suggestTitle: { ...type.body, flex: true, fontWeight: '600' },
  suggestPlay: { center: true, w: 38, h: 38, radius: 19, border: 'textMuted', borderWidth: 1.5 },
  suggestPlayPressed: { border: 'text', bg: 'surface2' },
});
