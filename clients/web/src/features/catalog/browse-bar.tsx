import { type GenreCount, type MessageKey, SORT_MODES, type SortMode } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Chip, type IconName, Select } from '@kroma/ui/kit';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

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

// Matches the mobile topbar's height, so the pinned bar docks under it below lg.
const BAR_POSITION =
  'sticky top-0 z-30 max-lg:top-[calc(max(0.625rem,env(safe-area-inset-top))+2.75rem)]';

// The "no genre picked" sentinel: Select treats '' as nothing-picked.
const ALL_GENRES = '*';

// Roomier than the kit's sm chip: these are the page's primary filter, not a
// tag row.
const CHIP_PAD = { paddingVertical: 8, paddingHorizontal: 18 } as const;

const BAR_SKIN: Record<'floating' | 'stuck', string> = {
  floating: 'border-transparent',
  stuck:
    'border-white/6 bg-[color-mix(in_srgb,var(--kroma-bg)_72%,transparent)] backdrop-blur-xl shadow-[0_16px_32px_-20px_rgba(0,0,0,.85)]',
};

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
    <div
      ref={bar}
      className={`${BAR_POSITION} -mx-(--gutter-web) mb-6 mt-6 border-b px-(--gutter-web) py-2.5 transition-[background-color,border-color,box-shadow] duration-300 ${BAR_SKIN[stuck ? 'stuck' : 'floating']}`}
    >
      <div className="flex items-center gap-3">
        {genres.length > 0 ? (
          <div
            ref={strip}
            onScroll={update}
            className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ maskImage: mask, WebkitMaskImage: mask }}
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
          <div className="flex-1" />
        )}
        {genres.length > 0 ? (
          <Select
            label={t('browse.genres')}
            placeholder={t('browse.genres')}
            value={genre ?? ALL_GENRES}
            size="sm"
            onChange={(v) => onGenre(v === ALL_GENRES ? undefined : v)}
            options={[
              { value: ALL_GENRES, label: t('browse.allGenres') },
              ...genres.map((g) => ({ value: g.name, label: g.name, note: String(g.count) })),
            ]}
            style={{ flexShrink: 0, minWidth: 150 }}
          />
        ) : null}
        <Select
          label={t('browse.sortBy')}
          value={sort}
          size="sm"
          onChange={(v) => onSort(v as SortMode)}
          options={SORT_MODES.map((mode) => ({
            value: mode,
            label: t(SORT_LABEL_KEY[mode]),
            icon: SORT_ICON[mode],
          }))}
          style={{ flexShrink: 0, minWidth: 196 }}
        />
      </div>
    </div>
  );
}
