import type { ContinueItem } from '@kromatv/client/media';
import { Box, radius as cornerRadius, styles, useStyles } from '@kromatv/ui/kit';
import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { HeroBillboard } from '#mobile/components/HeroBillboard';
import { featuredProgress } from '#mobile/lib/featured';
import { entryId, entryTitle, type HomeRow } from '#mobile/lib/home-sections';
import { useT } from '#mobile/lib/i18n';
import { nextPage, pageAt } from '#mobile/lib/pager';
import { spacing } from '#mobile/lib/theme';

const TURN_EVERY_MS = 8000;
const DOT = 6;

/** The titles a home opens on, one to a page. It turns its own page while
 *  nobody is touching it, the screen is in front and the system has not asked
 *  for less motion. */
export function HeroCarousel({
  row,
  resumable,
}: Readonly<{ row: HomeRow; resumable: readonly ContinueItem[] }>) {
  const s = useStyles(sDefinition);

  const t = useT();
  const { width } = useWindowDimensions();
  const inFront = useIsFocused();
  const still = useReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [touched, setTouched] = useState(false);
  const [dragged, setDragged] = useState(false);
  const count = row.entries.length;
  const held = touched || dragged;

  const turnTo = (next: number, animated = true) => {
    scroller.current?.scrollTo({ x: next * width, y: 0, animated });
  };
  const turn = useEffectEvent(() => turnTo(nextPage(page, count)));
  const realign = useEffectEvent(() => turnTo(page, false));

  useEffect(() => {
    if (count < 2 || held || still || !inFront) {
      return;
    }
    const timer = setTimeout(turn, TURN_EVERY_MS);
    return () => clearTimeout(timer);
  }, [count, held, still, inFront, page]);

  useEffect(() => {
    realign();
  }, [width]);

  const follow = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(pageAt(event.nativeEvent.contentOffset.x, width, count));

  return (
    <Box>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        scrollEnabled={count > 1}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={follow}
        onMomentumScrollEnd={follow}
        onTouchStart={() => setTouched(true)}
        onTouchEnd={() => setTouched(false)}
        onTouchCancel={() => setTouched(false)}
        onScrollBeginDrag={() => setDragged(true)}
        onScrollEndDrag={() => setDragged(false)}
        contentContainerStyle={s.pages}
      >
        {row.entries.map(({ entry, note }) => (
          <Box key={entryId(entry)} style={{ width }}>
            <HeroBillboard
              entry={entry}
              note={note ?? row.title}
              progress={featuredProgress(entry, resumable)}
            />
          </Box>
        ))}
      </ScrollView>
      {count > 1 ? (
        <Box style={s.dots} accessibilityRole="tablist">
          {row.entries.map(({ entry }, index) => (
            <Pressable
              key={entryId(entry)}
              onPress={() => turnTo(index)}
              hitSlop={spacing.sm}
              accessibilityRole="tab"
              aria-selected={index === page}
              accessibilityLabel={t('content.heroShow', { title: entryTitle(entry) })}
              style={[s.dot, index === page && s.dotCurrent]}
            />
          ))}
        </Box>
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
