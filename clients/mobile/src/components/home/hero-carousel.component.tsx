import type { ContinueItem } from '@kromatv/client/media';
import { Box, radius as cornerRadius, styles, useStyles } from '@kromatv/ui/kit';
import { useIsFocused } from 'expo-router';
import { type RefObject, useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { HeroBillboard } from '#mobile/components/hero-billboard.component';
import { featuredProgress } from '#mobile/lib/featured';
import { entryId, entryTitle, type HomeRow, type RowEntry } from '#mobile/lib/home-sections';
import { useT } from '#mobile/lib/i18n';
import { nextPage, pageAt } from '#mobile/lib/pager';
import { spacing } from '#mobile/lib/theme';

const TURN_EVERY_MS = 8000;
const DOT = 6;

function usePager(count: number) {
  const { width } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const scrollToPage = (target: { page: number; animated: boolean }) => {
    scroller.current?.scrollTo({ x: target.page * width, y: 0, animated: target.animated });
  };
  const realign = useEffectEvent((at: number) =>
    scroller.current?.scrollTo({ x: page * at, y: 0, animated: false }),
  );

  useEffect(() => {
    realign(width);
  }, [width]);

  const follow = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(pageAt(event.nativeEvent.contentOffset.x, width, count));

  return { scroller, width, page, scrollToPage, follow };
}

function useHold() {
  const [touched, setTouched] = useState(false);
  const [dragged, setDragged] = useState(false);
  const handlers = {
    onTouchStart: () => setTouched(true),
    onTouchEnd: () => setTouched(false),
    onTouchCancel: () => setTouched(false),
    onScrollBeginDrag: () => setDragged(true),
    onScrollEndDrag: () => setDragged(false),
  };
  return { held: touched || dragged, handlers };
}

function useAutoTurn({
  count,
  page,
  held,
  scrollToPage,
}: Readonly<{
  count: number;
  page: number;
  held: boolean;
  scrollToPage: (target: { page: number; animated: boolean }) => void;
}>) {
  const inFront = useIsFocused();
  const still = useReducedMotion();
  const turn = useEffectEvent((from: number) =>
    scrollToPage({ page: nextPage(from, count), animated: true }),
  );

  useEffect(() => {
    if (count < 2 || held || still || !inFront) {
      return undefined;
    }
    const timer = setTimeout(() => turn(page), TURN_EVERY_MS);
    return () => clearTimeout(timer);
  }, [count, held, still, inFront, page]);
}

const PAGER = {
  horizontal: true,
  pagingEnabled: true,
  showsHorizontalScrollIndicator: false,
  scrollEventThrottle: 16,
} as const;

function HeroPage({
  slot: { entry, note },
  fallbackNote,
  width,
  resumable,
}: Readonly<{
  slot: RowEntry;
  fallbackNote: string;
  width: number;
  resumable: readonly ContinueItem[];
}>) {
  return (
    <Box style={{ width }}>
      <HeroBillboard
        entry={entry}
        note={note ?? fallbackNote}
        progress={featuredProgress(entry, resumable)}
      />
    </Box>
  );
}

interface HeroPagesProps {
  row: HomeRow;
  resumable: readonly ContinueItem[];
  scroller: RefObject<ScrollView | null>;
  width: number;
  onPage: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  hold: ReturnType<typeof useHold>;
}

function HeroPages({ row, resumable, scroller, width, onPage, hold }: Readonly<HeroPagesProps>) {
  const s = useStyles(sDefinition);

  return (
    <ScrollView
      {...PAGER}
      ref={scroller}
      scrollEnabled={row.entries.length > 1}
      onScroll={onPage}
      onMomentumScrollEnd={onPage}
      {...hold.handlers}
      contentContainerStyle={s.pages}
    >
      {row.entries.map((slot) => (
        <HeroPage
          key={entryId(slot.entry)}
          slot={slot}
          fallbackNote={row.title}
          width={width}
          resumable={resumable}
        />
      ))}
    </ScrollView>
  );
}

function HeroDots({
  entries,
  page,
  onSelect,
}: Readonly<{
  entries: HomeRow['entries'];
  page: number;
  onSelect: (index: number) => void;
}>) {
  const s = useStyles(sDefinition);
  const t = useT();

  return (
    <Box style={s.dots} accessibilityRole="tablist">
      {entries.map(({ entry }, index) => (
        <Pressable
          key={entryId(entry)}
          onPress={() => onSelect(index)}
          hitSlop={spacing.sm}
          accessibilityRole="tab"
          aria-selected={index === page}
          accessibilityLabel={t('content.heroShow', { title: entryTitle(entry) })}
          style={[s.dot, index === page && s.dotCurrent]}
        />
      ))}
    </Box>
  );
}

/** The titles a home opens on, one to a page. It turns its own page while
 *  nobody is touching it, the screen is in front and the system has not asked
 *  for less motion. */
export function HeroCarousel({
  row,
  resumable,
}: Readonly<{ row: HomeRow; resumable: readonly ContinueItem[] }>) {
  const count = row.entries.length;
  const { scroller, width, page, scrollToPage, follow } = usePager(count);
  const hold = useHold();
  useAutoTurn({ count, page, held: hold.held, scrollToPage });

  return (
    <Box>
      <HeroPages
        row={row}
        resumable={resumable}
        scroller={scroller}
        width={width}
        onPage={follow}
        hold={hold}
      />
      {count > 1 ? (
        <HeroDots
          entries={row.entries}
          page={page}
          onSelect={(index) => scrollToPage({ page: index, animated: true })}
        />
      ) : null}
    </Box>
  );
}

const sDefinition = styles({
  pages: { align: 'center' },
  dots: { row: true, center: true, gap: DOT, mt: spacing.sm + spacing.xs },
  dot: { w: DOT, h: DOT, bg: 'text/30', radius: cornerRadius.indicator },
  dotCurrent: { w: DOT * 3, bg: 'text' },
});
