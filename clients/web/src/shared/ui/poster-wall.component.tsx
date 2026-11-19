import { sizedImageUrl } from '@kromatv/core';
import { KROMA_WHEEL_COLORS, useBreakpoint, useReducedMotion } from '@kromatv/ui/kit';
import { type CSSProperties, useEffect, useRef } from 'react';
import { imageUrl } from '#web/shared/lib/api';

const ROWS = 5;
const LAPS = 3;
const WIDE_COLUMNS = 8;
const NARROW_COLUMNS = 4;
const GAP = 18;
const POSTER_WIDTH = 240;
const LAP_MS = 120_000;
const SLOWER_BY_MS = 11_000;

const ONE_LAP = `translateY(calc(-100% / ${LAPS}))`;
const UPWARD = [{ transform: 'translateY(0)' }, { transform: ONE_LAP }];
const DOWNWARD = [{ transform: ONE_LAP }, { transform: 'translateY(0)' }];

const ROW_NUMBERS = Array.from({ length: ROWS }, (_, row) => row);
const LAP_NUMBERS = Array.from({ length: LAPS }, (_, lap) => lap);

const WALL: CSSProperties = {
  position: 'absolute',
  inset: '-28% -12%',
  display: 'flex',
  gap: GAP,
  transform: 'perspective(1800px) rotateX(18deg) rotateZ(-9deg)',
  pointerEvents: 'none',
};

const COLUMN: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 0',
  minWidth: 0,
  alignSelf: 'flex-start',
  willChange: 'transform',
};

const LAP: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: GAP,
  paddingBottom: GAP,
};

const TILE: CSSProperties = {
  display: 'block',
  width: '100%',
  aspectRatio: '2 / 3',
  borderRadius: 'var(--radius-tile)',
  objectFit: 'cover',
  backgroundColor: 'var(--kroma-surface-2)',
};

const ARRIVING: CSSProperties = { ...TILE, animation: 'fade-in 900ms ease-out both' };

/** How many posters a wall of `columns` shows before one repeats. */
export function wallSize(columns: number): number {
  return columns * ROWS;
}

/** The posters one column shows, top to bottom: every `columns`-th poster from
 * the column's own start, round the list as often as it takes to fill it. */
export function columnPosters(
  posters: readonly string[],
  column: number,
  columns: number,
): string[] {
  if (posters.length === 0) {
    return [];
  }
  return ROW_NUMBERS.flatMap((row) => posters.at((column + row * columns) % posters.length) ?? []);
}

function posterSrc(poster: string): string {
  return imageUrl(sizedImageUrl(poster, POSTER_WIDTH)) ?? poster;
}

function useDrift(column: number) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const strip = ref.current;
    if (!strip || reduced) {
      return undefined;
    }
    const drift = strip.animate(column % 2 === 0 ? UPWARD : DOWNWARD, {
      duration: LAP_MS + column * SLOWER_BY_MS,
      iterations: Number.POSITIVE_INFINITY,
      easing: 'linear',
    });
    return () => drift.cancel();
  }, [column, reduced]);
  return ref;
}

function blankTile(column: number, row: number): CSSProperties {
  const colour = KROMA_WHEEL_COLORS[(column + row) % KROMA_WHEEL_COLORS.length];
  return {
    ...TILE,
    backgroundImage: `linear-gradient(160deg, color-mix(in srgb, ${colour} 46%, transparent), transparent 78%)`,
  };
}

function WallTile({
  poster,
  column,
  row,
}: Readonly<{ poster: string | undefined; column: number; row: number }>) {
  if (!poster) {
    return <div style={blankTile(column, row)} />;
  }
  return <img key={poster} alt="" decoding="async" src={posterSrc(poster)} style={ARRIVING} />;
}

function WallColumn({ shown, column }: Readonly<{ shown: readonly string[]; column: number }>) {
  const ref = useDrift(column);
  return (
    <div ref={ref} style={COLUMN}>
      {LAP_NUMBERS.map((lap) => (
        <div key={lap} style={LAP}>
          {ROW_NUMBERS.map((row) => (
            <WallTile key={row} poster={shown[row]} column={column} row={row} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A wall of posters in perspective, each column drifting slowly against its
 * neighbour and never jumping: a column is the same lap of posters three
 * times over, and one turn of the loop moves it by exactly one lap. With no
 * poster to show it is a wall of tiles in the wheel's colours, so the screen
 * behind a form is never empty. Decoration only: it takes no pointer and names
 * nothing to assistive tech. */
export function PosterWall({ posters }: Readonly<{ posters: readonly string[] }>) {
  const columns = useBreakpoint() === 'base' ? NARROW_COLUMNS : WIDE_COLUMNS;
  const numbers = Array.from({ length: columns }, (_, column) => column);
  return (
    <div aria-hidden style={WALL}>
      {numbers.map((column) => (
        <WallColumn key={column} shown={columnPosters(posters, column, columns)} column={column} />
      ))}
    </div>
  );
}
