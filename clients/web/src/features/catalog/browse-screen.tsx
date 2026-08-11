import {
  collectGenres,
  hasGenre,
  type LetterMark,
  letterMarks,
  type MessageKey,
  type Sortable,
  type SortMode,
  sortTitles,
  titleLetter,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, EmptyState, type IconName } from '@kroma/ui/kit';
import {
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlphabetRail, type LetterRange } from '#web/features/catalog/alphabet-rail';
import { BrowseBar } from '#web/features/catalog/browse-bar';
import { BrowseHero } from '#web/features/catalog/browse-hero';
import { tileAt } from '#web/features/catalog/tile-grid';
import { PAGE_MAIN } from '#web/shared/ui';

// Below this the whole grid fits a couple of screens and the rail is noise.
const RAIL_MIN_ITEMS = 24;

// The rail's footprint plus breathing room on the right, whatever the fluid
// gutter currently is. Nothing to reserve where the rail does not render.
const RAIL_RESERVE = { base: 0, md: 48, lg: 32, tv: 24 } as const;

const tileOf = (gridWrap: RefObject<HTMLDivElement | null>, index: number): HTMLElement | null =>
  tileAt(gridWrap.current, index);

// Docked bar bottom edge + breathing room = where a jumped-to row should land.
const jumpOffset = (bar: RefObject<HTMLDivElement | null>): number => {
  const el = bar.current;
  if (!el) return 72;
  const top = Number.parseFloat(getComputedStyle(el).top) || 0;
  return top + el.getBoundingClientRect().height + 8;
};

/** The stretch of buckets whose grid sections intersect the viewport (a tall
 * screen shows several letters at once), so the rail's capsule can cover
 * exactly what is on screen. A bucket's section runs from its first tile to
 * the next bucket's first tile, or to the grid's end for the last one. */
function useVisibleLetters(
  enabled: boolean,
  marks: readonly LetterMark[],
  gridWrap: RefObject<HTMLDivElement | null>,
  bar: RefObject<HTMLDivElement | null>,
): LetterRange | undefined {
  const [range, setRange] = useState<LetterRange | undefined>();
  useEffect(() => {
    if (!enabled || marks.length === 0) {
      setRange(undefined);
      return;
    }
    let raf = 0;
    const measure = () => {
      raf = 0;
      const grid = gridWrap.current?.firstElementChild;
      if (!(grid instanceof HTMLElement)) return;
      const line = jumpOffset(bar) + 4;
      const viewBottom = window.innerHeight;
      const visible: string[] = [];
      marks.forEach((mark, i) => {
        const tile = tileOf(gridWrap, mark.index);
        if (!tile) return;
        const next = marks[i + 1];
        // The section ends at the BOTTOM of its last tile's row: a bucket
        // sharing its final row with the next one still owns that row.
        const lastTile = next === undefined ? null : tileOf(gridWrap, next.index - 1);
        const sectionTop = tile.getBoundingClientRect().top;
        const sectionBottom = lastTile
          ? lastTile.getBoundingClientRect().bottom
          : grid.getBoundingClientRect().bottom;
        if (sectionTop < viewBottom && sectionBottom > line) visible.push(mark.letter);
      });
      const first = visible[0];
      const last = visible.at(-1);
      setRange((prev) => {
        if (first === undefined || last === undefined) return undefined;
        return prev?.first === first && prev?.last === last ? prev : { first, last };
      });
    };
    const onScroll = () => {
      if (raf === 0) raf = requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    measure();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [enabled, marks, gridWrap, bar]);
  return range;
}

export interface BrowseScreenProps<T extends Sortable & { backdrop: string | null }> {
  heading: string;
  items: readonly T[];
  /** Plural count line under the heading ('browse.count.movies' or '.series'). */
  countKey: MessageKey;
  emptyIcon: IconName;
  emptyTitle: string;
  sort: SortMode;
  genre?: string;
  /** `resetScroll: false` marks a rail jump: the screen lands on the letter
   *  itself, so the router must not scroll back to the top. */
  onSort: (mode: SortMode, opts?: { resetScroll?: boolean }) => void;
  onGenre: (genre: string | undefined) => void;
  renderGrid: (view: T[]) => ReactElement;
}

/** A whole catalogue browse page: the artwork hero, the pinned filter bar,
 * the grid, and the A-Z fast-scroll rail. Films and Series render the same
 * screen over a different view model; sort/genre live in the caller's URL
 * search. */
export function BrowseScreen<T extends Sortable & { backdrop: string | null }>({
  heading,
  items,
  countKey,
  emptyIcon,
  emptyTitle,
  sort,
  genre,
  onSort,
  onGenre,
  renderGrid,
}: Readonly<BrowseScreenProps<T>>) {
  const t = useT();
  const gridWrap = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<string | null>(null);

  const genres = useMemo(() => collectGenres(items), [items]);
  const filtered = useMemo(
    () => (genre ? items.filter((item) => hasGenre(item, genre)) : [...items]),
    [items, genre],
  );
  const view = useMemo(() => sortTitles(filtered, sort), [filtered, sort]);
  const marks = useMemo(() => (sort === 'title' ? letterMarks(view) : []), [view, sort]);
  const letters = useMemo(() => new Set(filtered.map((f) => titleLetter(f.title))), [filtered]);

  // The hero's artwork rotates through the current view's best-rated titles,
  // so picking a genre visibly repaints the page and a long stay keeps it alive.
  const featuredPool = useMemo(
    () =>
      filtered
        .filter((item) => item.backdrop)
        .sort((a, b) => (b.metadata?.rating ?? -1) - (a.metadata?.rating ?? -1))
        .slice(0, 6),
    [filtered],
  );
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    setSlide(0);
    if (featuredPool.length < 2) return;
    const timer = setInterval(() => setSlide((s) => s + 1), 8000);
    return () => clearInterval(timer);
  }, [featuredPool]);
  const featured = featuredPool[slide % Math.max(featuredPool.length, 1)];

  const scrollToLetter = useCallback(
    (letter: string) => {
      const mark = marks.find((m) => m.letter === letter);
      const tile = mark === undefined ? null : tileOf(gridWrap, mark.index);
      if (!tile) return;
      const top = tile.getBoundingClientRect().top + window.scrollY - jumpOffset(bar);
      window.scrollTo({ top: Math.max(top, 0) });
    },
    [marks],
  );

  // A jump from another sort first flips to title order, then lands once the
  // re-sorted grid is in the DOM.
  const jump = useCallback(
    (letter: string) => {
      if (sort === 'title') {
        scrollToLetter(letter);
      } else {
        setPending(letter);
        onSort('title', { resetScroll: false });
      }
    },
    [sort, scrollToLetter, onSort],
  );

  useLayoutEffect(() => {
    if (pending === null || sort !== 'title') return;
    scrollToLetter(pending);
    setPending(null);
  }, [pending, sort, scrollToLetter]);

  const visibleLetters = useVisibleLetters(sort === 'title', marks, gridWrap, bar);
  const showRail = filtered.length >= RAIL_MIN_ITEMS && letters.size > 1;

  return (
    <main className={PAGE_MAIN}>
      <BrowseHero
        heading={heading}
        eyebrow={genre ?? t('browse.library')}
        countText={items.length > 0 ? t(countKey, { count: view.length }) : undefined}
        backdrop={featured?.backdrop}
        creditTitle={featured?.title}
      />
      {items.length === 0 ? (
        <EmptyState.Root icon={emptyIcon} title={emptyTitle} />
      ) : (
        <>
          <BrowseBar
            innerRef={bar}
            sort={sort}
            onSort={onSort}
            genres={genres}
            genre={genre}
            onGenre={onGenre}
          />
          {view.length === 0 ? (
            <EmptyState.Root icon={emptyIcon} title={t('search.noResults')} />
          ) : (
            <Box pr={showRail ? RAIL_RESERVE : undefined}>
              <div ref={gridWrap}>{renderGrid(view)}</div>
            </Box>
          )}
          {showRail ? (
            <AlphabetRail available={letters} range={visibleLetters} onJump={jump} />
          ) : null}
        </>
      )}
    </main>
  );
}
