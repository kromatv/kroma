import { type GenreCount, type MessageKey, SORT_MODES, type SortMode } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Chip, color, type IconName, Row, Select, useBreakpoint } from '@kroma/ui/kit';
import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

const SORT_LABEL_KEY: Record<SortMode, MessageKey> = {
  added: 'browse.sort.added',
  release: 'browse.sort.release',
  title: 'browse.sort.title',
  rating: 'browse.sort.rating',
};

const SORT_ICON: Record<SortMode, IconName> = {
  added: 'history',
  release: 'calendar',
  title: 'sort-ascending-letters',
  rating: 'star',
};

// Matches the mobile topbar's height, so the pinned bar docks under it below lg
// and flush with the window at lg, where that topbar is not rendered.
const DOCK_TOP = 'calc(max(0.625rem, env(safe-area-inset-top)) + 2.75rem)';

// `position: sticky` and `env()` have no React Native spelling, so the bar's own
// box stays CSS; everything it contains is the kit's.
const BAR: CSSProperties = {
  position: 'sticky',
  zIndex: 30,
  marginLeft: 'calc(var(--gutter-web) * -1)',
  marginRight: 'calc(var(--gutter-web) * -1)',
  marginTop: 24,
  marginBottom: 24,
  paddingLeft: 'var(--gutter-web)',
  paddingRight: 'var(--gutter-web)',
  paddingTop: 10,
  paddingBottom: 10,
  borderBottomWidth: 1,
  borderBottomStyle: 'solid',
  borderBottomColor: 'transparent',
  transition: 'background-color .3s, border-color .3s, box-shadow .3s',
};

const BAR_STUCK: CSSProperties = {
  ...BAR,
  borderBottomColor: color('white/6'),
  background: 'color-mix(in srgb, var(--kroma-bg) 72%, transparent)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  boxShadow: `0 16px 32px -20px ${color('black/85')}`,
};

// `scrollbar-width` only; the legacy `::-webkit-scrollbar` rule it used to pair
// with needs a stylesheet, which an inline style has no way to reach.
const STRIP: CSSProperties = {
  display: 'flex',
  minWidth: 0,
  flex: 1,
  gap: 8,
  overflowX: 'auto',
  paddingTop: 2,
  paddingBottom: 2,
  scrollbarWidth: 'none',
};

// The "no genre picked" sentinel: Select treats '' as nothing-picked.
const ALL_GENRES = '*';

// Roomier than the kit's sm chip: these are the page's primary filter, not a
// tag row.
const CHIP_PAD = { paddingVertical: 8, paddingHorizontal: 18 } as const;

const GENRE_TRIGGER = { flexShrink: 0, minWidth: 150 } as const;
const SORT_TRIGGER = { flexShrink: 0, minWidth: 196 } as const;

/** True once a `position: sticky` element has docked at its `top` offset. */
function useStuck(bar: RefObject<HTMLDivElement | null>): boolean {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = bar.current;
      if (!el) return;
      const top = Number.parseFloat(getComputedStyle(el).top) || 0;
      setStuck(el.getBoundingClientRect().top <= top + 1);
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
  }, [bar]);
  return stuck;
}

/** Which edges of a horizontal scroller are clipping content, so the strip can
 * fade exactly the sides that hide more chips. */
function useEdgeFades(strip: RefObject<HTMLDivElement | null>, deps: readonly unknown[]) {
  const [fades, setFades] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });
  const update = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
    setFades((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, [strip]);
  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [update, ...deps]);
  return { fades, update };
}

function fadeMask({ left, right }: { left: boolean; right: boolean }): string | undefined {
  if (!(left || right)) return undefined;
  const from = left ? 'transparent, #000 32px' : '#000';
  const to = right ? '#000 calc(100% - 32px), transparent' : '#000';
  return `linear-gradient(90deg, ${from}, ${to})`;
}

export interface BrowseBarProps {
  sort: SortMode;
  onSort: (mode: SortMode) => void;
  genres: GenreCount[];
  genre?: string;
  onGenre: (genre: string | undefined) => void;
  /** The bar's root element, for callers that need its docked height (the
   *  letter-jump scroll offset). A wrapper div would break `position: sticky`. */
  innerRef?: RefObject<HTMLDivElement | null>;
}

// Inline chips carry only the head of the genre list; the complete list with
// counts lives in the Genres select, so the strip stays scannable.
const INLINE_GENRES = 10;

/** The controls above a catalogue grid: a line of quick genre chips, a Genres
 * select carrying the full list, and a sort select, pinned as a glass toolbar
 * once the page scrolls. Purely presentational the parent owns the state (URL
 * search params), so it stays shareable and survives a refresh. */
export function BrowseBar({
  sort,
  onSort,
  genres,
  genre,
  onGenre,
  innerRef,
}: Readonly<BrowseBarProps>) {
  const t = useT();
  const fallbackRef = useRef<HTMLDivElement>(null);
  const bar = innerRef ?? fallbackRef;
  const strip = useRef<HTMLDivElement>(null);
  const stuck = useStuck(bar);
  const step = useBreakpoint();
  const wide = step === 'lg' || step === 'tv';
  const inline = genres.slice(0, INLINE_GENRES);
  if (genre && !inline.some((g) => g.name === genre)) {
    const extra = genres.find((g) => g.name === genre);
    if (extra) inline.push(extra);
  }
  const { fades, update } = useEdgeFades(strip, [inline.length]);
  const mask = fadeMask(fades);

  // Keep the picked chip in sight: a deep pick from a long strip would
  // otherwise sit scrolled out of view after a reload or a back-navigation.
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const index = genre ? [...el.children].findIndex((c) => c.textContent === genre) : 0;
    const chip = el.children[Math.max(index, 0)];
    if (chip instanceof HTMLElement) {
      chip.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [genre]);

  return (
    <div ref={bar} style={{ ...(stuck ? BAR_STUCK : BAR), top: wide ? 0 : DOCK_TOP }}>
      <Row gap={12}>
        {genres.length > 0 ? (
          <div
            ref={strip}
            onScroll={update}
            style={{ ...STRIP, maskImage: mask, WebkitMaskImage: mask }}
          >
            <Chip
              active={!genre}
              variant="subtle"
              label={t('browse.allGenres')}
              style={CHIP_PAD}
              onPress={() => onGenre(undefined)}
            />
            {inline.map((g) => (
              <Chip
                key={g.name}
                active={g.name === genre}
                variant="subtle"
                label={g.name}
                style={CHIP_PAD}
                onPress={() => onGenre(g.name === genre ? undefined : g.name)}
              />
            ))}
          </div>
        ) : (
          <Box flex />
        )}
        {genres.length > 0 ? (
          <Select.Root
            label={t('browse.genres')}
            placeholder={t('browse.genres')}
            value={genre ?? ALL_GENRES}
            onValueChange={(v) => onGenre(v === ALL_GENRES ? undefined : v)}
          >
            <Select.Trigger size="sm" style={GENRE_TRIGGER} />
            <Select.Item value={ALL_GENRES} label={t('browse.allGenres')} />
            {genres.map((g) => (
              <Select.Item key={g.name} value={g.name} label={g.name} note={String(g.count)} />
            ))}
          </Select.Root>
        ) : null}
        <Select.Root
          label={t('browse.sortBy')}
          value={sort}
          onValueChange={(v) => onSort(v as SortMode)}
        >
          <Select.Trigger size="sm" style={SORT_TRIGGER} />
          {SORT_MODES.map((mode) => (
            <Select.Item
              key={mode}
              value={mode}
              label={t(SORT_LABEL_KEY[mode])}
              icon={SORT_ICON[mode]}
            />
          ))}
        </Select.Root>
      </Row>
    </div>
  );
}
