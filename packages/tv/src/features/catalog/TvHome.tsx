import { episodeTag, type MediaItem, posterColors, type SectionItem, type Show } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  FocusScroll,
  FocusSlot,
  MediaCard,
  RAIL_GAP,
  Rail,
  styles,
  useFocusNav,
  useGrowingCount,
} from '@kroma/ui/kit';
import { useCallback, useEffect, useMemo } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { useContinue } from '#tv/app/providers/continue';
import { useMyList } from '#tv/app/providers/mylist';
import { useRecommend } from '#tv/app/providers/recommend';
import { useWatched } from '#tv/app/providers/watched';
import { useClient, useNav } from '#tv/app/router';
import { computeHero, Hero } from '#tv/features/catalog/home/Hero';
import { HintBar } from '#tv/features/catalog/home/HintBar';
import { entryId } from '#tv/features/catalog/home/sectionEntry';

const RAIL_LIMIT = 20;

const ROW_CHUNK = 3;

// What one home tile occupies, so the row can be virtualised: a <MediaCard>
// at its default 328 width, 16:9, plus the 24px gap after it.
const ROW_TILE = { pitch: 328 + RAIL_GAP, height: Math.round((328 * 9) / 16) };

// The design sizes the hero with viewport units and clamps; on the fixed
// 1920x1080 stage those resolve to the values below.
const s = styles({
  pageScroll: { flex: true, minH: 0 },
  // Padding belongs on the content, not the scroller box.
  pageContent: { pb: 40 },
  rowTitle: { fontSize: 28, lineHeight: 30, fontWeight: '700', letterSpacing: -0.56 },
});

interface Row {
  key: string;
  title: string;
  cards: React.ReactNode[];
}

/** The 10-foot home: a cinematic hero over a vertical stack of horizontal
 * rails. Films, Séries and Search live on their own screens via the shared
 * top nav. */
export function TvHome() {
  const { movies, shows } = useConnection();
  const { items: continueItems, refresh: refreshContinue } = useContinue();
  const { sections, featured } = useRecommend();
  const { has: isWatched, refresh: refreshWatched } = useWatched();
  const { refresh: refreshMyList } = useMyList();
  const { go } = useNav();
  const client = useClient();
  const t = useT();
  useEffect(() => refreshContinue(), [refreshContinue]);
  // Re-pull the watched + my-list sets on entry so a title finished in the player
  // (auto-marked) or added on another device shows up the moment we land on Home.
  useEffect(() => refreshWatched(), [refreshWatched]);
  useEffect(() => refreshMyList(), [refreshMyList]);
  useFocusNav({});

  const onSelectMovie = useCallback((m: MediaItem) => go('movie', { item: m }), [go]);
  const onSelectShow = useCallback((s: Show) => go('show', { show: s }), [go]);
  const onPlay = useCallback((m: MediaItem) => go('player', { item: m }), [go]);
  // Open a recommendation entry: play page for movies, detail for shows.
  const onSelectEntry = useCallback(
    (e: SectionItem) => (e.type === 'show' ? onSelectShow(e.show) : onSelectMovie(e.item)),
    [onSelectMovie, onSelectShow],
  );

  // Render one rail entry (movie or show) as a 16:9 card.
  const entryCard = useCallback(
    (key: string, e: SectionItem): React.ReactNode => {
      if (e.type === 'show') {
        const show = e.show;
        return (
          <MediaCard
            key={`${key}-${show.id}`}
            title={show.title}
            overline={show.metadata?.genres?.[0] ?? t('content.series')}
            art={client.backdropFor(show, TILE_W) ?? client.showPosterFor(show, TILE_W)}
            tint={posterColors(show.id)}
            watched={isWatched(show.id)}
            progress={show.progress == null ? null : show.progress / 100}
            onPress={() => onSelectShow(show)}
          />
        );
      }
      const m = e.item;
      return (
        <MediaCard
          key={`${key}-${m.id}`}
          title={m.title}
          overline={m.metadata?.genres?.[0] ?? t('content.film')}
          art={client.backdropFor(m, TILE_W) ?? client.posterFor(m, TILE_W)}
          tint={posterColors(m.id)}
          watched={isWatched(m.id)}
          onPress={() => onSelectMovie(m)}
        />
      );
    },
    [client, onSelectMovie, onSelectShow, isWatched, t],
  );

  // One 16:9 rail per server section: empty list in → null out, so the home drops
  // it. `title` arrives already localized from the server rendered as-is.
  const mediaRow = useCallback(
    (key: string, title: string, items: SectionItem[]): Row | null =>
      items.length
        ? { key, title, cards: items.slice(0, RAIL_LIMIT).map((e) => entryCard(key, e)) }
        : null,
    [entryCard],
  );

  // Featured spotlight (hero) + its backdrop art and quality badge, computed once.
  const heroInfo = computeHero(featured, sections, movies, client);
  const heroId = heroInfo.heroId;

  const rows = useMemo<Row[]>(() => {
    const continueRow: Row | null = continueItems.length
      ? {
          key: 'continue',
          title: t('content.continueWatching'),
          cards: continueItems.map(({ item, positionMs, durationMs }) => {
            const dur = durationMs ?? item.durationMs ?? 0;
            const pct = dur > 0 ? Math.min(100, Math.round((positionMs / dur) * 100)) : 0;
            const genre =
              item.kind === 'episode' && item.showTitle
                ? `${item.showTitle} · ${episodeTag(item)}`
                : t('content.film');
            return (
              <MediaCard
                key={`continue-${item.id}`}
                title={item.title}
                overline={genre}
                art={client.backdropFor(item, TILE_W) ?? client.posterFor(item, TILE_W)}
                tint={posterColors(item.id)}
                progress={pct / 100}
                onPress={() => onPlay(item)}
              />
            );
          }),
        }
      : null;
    // One rail per server section, in the server's order. The hero is picked
    // independently of the sections, so drop it from every row to avoid showing
    // the same title twice (the server already de-dupes rows against each other).
    const sectionRows = sections.map((section) =>
      mediaRow(
        section.id,
        section.title,
        heroId ? section.items.filter((e) => entryId(e) !== heroId) : section.items,
      ),
    );
    const showRow: Row | null = shows.length
      ? {
          key: 'series',
          title: t('nav.series'),
          cards: shows
            .slice(0, RAIL_LIMIT)
            .map((show) => (
              <MediaCard
                key={show.id}
                title={show.title}
                overline={
                  show.metadata?.genres?.[0] ??
                  t('content.seasonCount', { count: show.seasonCount })
                }
                art={client.backdropFor(show, TILE_W) ?? client.showPosterFor(show, TILE_W)}
                tint={posterColors(show.id)}
                watched={isWatched(show.id)}
                progress={show.progress == null ? null : show.progress / 100}
                onPress={() => onSelectShow(show)}
              />
            )),
        }
      : null;
    return [continueRow, ...sectionRows, showRow].filter((r): r is Row => r !== null);
  }, [
    shows,
    continueItems,
    sections,
    heroId,
    mediaRow,
    client,
    onPlay,
    onSelectShow,
    isWatched,
    t,
  ]);

  // How many rails are mounted. Three is already more than fits on screen, and
  // the rest arrive as the focus comes down (see <FocusSlot onActive>).
  const {
    count: rowCount,
    isNearEnd: nearLastRow,
    grow: growRows,
  } = useGrowingCount(rows.length, ROW_CHUNK);

  return (
    <Box fill bg="bg" overflow="hidden">
      <FocusScroll style={s.pageScroll} contentStyle={s.pageContent} offsetFromStart={120}>
        {/* A permanent slot for the hero row: it arrives from the server after
            the first rails have already mounted, and the navigator orders rows
            by the order they mount. */}
        <FocusSlot>
          <Hero
            info={heroInfo}
            onPlay={onPlay}
            onSelectShow={onSelectShow}
            onSelectEntry={onSelectEntry}
          />
        </FocusSlot>

        {/* Rails below the fold mount only once focus comes near them. Bench
            (clients/tv-build/perf-bench.ts, TV-throttled CPU): 480 mounted
            controls run at 46fps/73ms frames, 128 runs clean. */}
        {rows.slice(0, rowCount).map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the index IS the slot - see <FocusSlot>.
          <FocusSlot key={index} onActive={nearLastRow(index) ? growRows : undefined}>
            <Box mb={8} mt={18}>
              <Rail.Root>
                <Rail.Title style={s.rowTitle}>{row.title}</Rail.Title>
                <Rail.List {...ROW_TILE}>{row.cards}</Rail.List>
              </Rail.Root>
            </Box>
          </FocusSlot>
        ))}
      </FocusScroll>

      <HintBar browseKey="content.hintBrowse" />
    </Box>
  );
}

// A rail tile is drawn 330pt wide, but the server's next rendition bucket above
// 320 is 480: those pixels cost more than the 3% upscale shows.
const TILE_W = 320;
