import {
  Box,
  FocusScroll,
  FocusSlot,
  ScrollMask,
  styles,
  TopFade,
  useFocusNav,
  useGrowingCount,
  useStyles,
} from '@kromatv/ui/kit';
import { type ReactNode, useCallback, useEffect, useMemo } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { useContinue } from '#tv/app/providers/continue';
import { useMyList } from '#tv/app/providers/mylist';
import { useRecommend } from '#tv/app/providers/recommend';
import { useWatched } from '#tv/app/providers/watched';
import { useClient, useNav } from '#tv/app/router';
import { useRootBack } from '#tv/app/use-root-back.hook';
import { usePlayTitle } from '#tv/features/catalog/full-item';
import { ContinueRail } from '#tv/features/catalog/home/continue-rail';
import { Hero } from '#tv/features/catalog/home/Hero';
import { heroSlides } from '#tv/features/catalog/home/hero-slides';
import { HomeSection } from '#tv/features/catalog/home/home-section';
import type { HomeEntry } from '#tv/features/catalog/home/sectionEntry';
import { useTitleMenu } from '#tv/features/catalog/TitleMenu';

const ROW_CHUNK = 3;

const NAV_BOTTOM = 104;

const sDefinition = styles({
  pageScroll: { flex: true, minH: 0 },
  // Padding belongs on the content, not the scroller box.
  pageContent: { pb: 40 },
});

/** The 10-foot home: a cinematic hero over a vertical stack of rows, each drawn
 * the way the server's section asks. Films, Séries and Search live on their own
 * screens via the shared top nav. */
export function TvHome() {
  const s = useStyles(sDefinition);

  const { movies } = useConnection();
  const { items: continueItems, refresh: refreshContinue } = useContinue();
  const { sections, featured } = useRecommend();
  const { refresh: refreshWatched } = useWatched();
  const { refresh: refreshMyList } = useMyList();
  const { go } = useNav();
  const client = useClient();
  useEffect(() => refreshContinue(), [refreshContinue]);
  // Re-pull the watched + my-list sets on entry so a title finished in the player
  // (auto-marked) or added on another device shows up the moment we land on Home.
  useEffect(() => refreshWatched(), [refreshWatched]);
  useEffect(() => refreshMyList(), [refreshMyList]);
  const titleMenu = useTitleMenu(useRootBack());
  useFocusNav({ onBack: titleMenu.onBack });
  const hold = titleMenu.open;

  const playTitle = usePlayTitle();
  const onSelectEntry = useCallback(
    (e: HomeEntry) =>
      e.type === 'show' ? go('show', { show: e.show }) : go('movie', { item: e.item }),
    [go],
  );

  const slides = useMemo(
    () => heroSlides({ sections, featured, movies }, client),
    [sections, featured, movies, client],
  );

  const rows = useMemo<ReactNode[]>(() => {
    const drawn: ReactNode[] = [];
    if (continueItems.length) {
      drawn.push(<ContinueRail items={continueItems} onHold={hold} />);
    }
    for (const section of sections) {
      if (section.layout === 'hero' || section.items.length === 0) {
        continue;
      }
      drawn.push(<HomeSection section={section} onHold={hold} />);
    }
    return drawn;
  }, [continueItems, sections, hold]);

  // the rest arrive as the focus comes down (see <FocusSlot onActive>).
  const {
    count: rowCount,
    isNearEnd: nearLastRow,
    grow: growRows,
  } = useGrowingCount(rows.length, ROW_CHUNK);

  return (
    <Box fill overflow="hidden">
      <TopFade inset={NAV_BOTTOM} masked style={s.pageScroll}>
        <FocusScroll style={s.pageScroll} contentStyle={s.pageContent} offsetFromStart={120}>
          {/* A permanent slot for the hero row: it arrives from the server after
            the first rails have already mounted, and the navigator orders rows
            by the order they mount. */}
          <FocusSlot>
            <Hero
              slides={slides}
              onPlay={playTitle}
              onSelectEntry={onSelectEntry}
              maskInset={NAV_BOTTOM}
            />
          </FocusSlot>

          <ScrollMask inset={NAV_BOTTOM} ground>
            {/* Rails below the fold mount only once focus comes near them. Bench
              (clients/tv-build/perf-bench.ts, TV-throttled CPU): 480 mounted
              controls run at 46fps/73ms frames, 128 runs clean. */}
            {rows.slice(0, rowCount).map((row, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- the index IS the slot - see <FocusSlot>.
              <FocusSlot key={index} onActive={nearLastRow(index) ? growRows : undefined}>
                {row}
              </FocusSlot>
            ))}
          </ScrollMask>
        </FocusScroll>
      </TopFade>

      {titleMenu.menu}
    </Box>
  );
}
