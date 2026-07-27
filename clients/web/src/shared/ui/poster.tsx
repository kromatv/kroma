import { Image } from '@kroma/admin-kit';
import { sizedImageUrl } from '@kroma/core';
import { useT } from '@kroma/ui';
import { IconButton, VirtualRail } from '@kroma/ui/kit';
import { type ReactElement, useState } from 'react';

export interface PosterProps {
  title: string;
  genre?: string;
  /** Two-stop gradient fallback when no artwork is available. */
  colors?: [string, string];
  /** Real poster artwork (WebP) falls back to the gradient. */
  poster?: string | null;
  progress?: number | null;
  /** When set, renders the "watched" marker/toggle: true = seen (persistent
   * check badge), false = unseen (check appears on hover). Omit to hide it. */
  watched?: boolean | null;
  /** Toggle the watched flag. Required for the marker to be interactive. */
  onToggleWatched?: () => void;
  /** Fixed tile width in px; omit for the fluid default (`--card-w`, which
   * scales from phone to desktop). */
  width?: number;
  onClick?: () => void;
}

/** Poster-rail geometry: the pitch targets the desktop `--card-w` maximum, and
 * the kit rail fits a whole number of tiles into whatever width it gets. */
const RAIL_TILE = 208;
const RAIL_GAP = 18;
/** Vertical room for the tiles' hover lift (6px) + amber ring shadow. */
const RAIL_PAD = 12;

export interface PosterRailProps<T> {
  data: readonly T[];
  /** One tile. The cell stretches it to its own width (same `*:w-full!`
   * override as the poster grids), so tiles need no width prop. */
  renderItem: (item: T, index: number) => ReactElement;
  /** Extra tile height below the 2:3 artwork (a caption strip). */
  extra?: number;
  onEndReached?: () => void;
}

/**
 * The design system's `VirtualRail` sized for poster tiles: wheel pan, hover
 * paging arrows and edge fades come from the kit. The pitch is a target - the
 * rail shares its width out into whole cells - so each tile fills its cell and
 * a wrapper caps growth back at the design width on the odd viewport where a
 * cell comes out wider.
 */
export function PosterRail<T>({
  data,
  renderItem,
  extra = 0,
  onEndReached,
}: Readonly<PosterRailProps<T>>) {
  return (
    <VirtualRail
      data={data}
      itemWidth={RAIL_TILE + RAIL_GAP}
      gap={RAIL_GAP}
      style={{ height: Math.round(RAIL_TILE * 1.5) + extra + RAIL_PAD * 2 }}
      contentStyle={{ paddingVertical: RAIL_PAD }}
      onEndReached={onEndReached}
      renderItem={(item, index) => (
        <div className="mx-auto w-full max-w-52 *:w-full!">{renderItem(item, index)}</div>
      )}
    />
  );
}

/**
 * Poster tile. Hover lifts the card and rings it in amber (KROMA design).
 * When real artwork is present the text overlay is hidden (the poster already
 * carries the title) and only reveals on hover; for gradient placeholders it
 * always shows.
 *
 * The tile is a `<div>` wrapper (not a `<button>`) so the watched toggle can be
 * a real, focusable `<button>` sibling without nesting interactive elements.
 */
export function Poster({
  title,
  genre,
  colors = ['#3A2E5C', '#0E1430'],
  poster = null,
  progress = null,
  watched = null,
  onToggleWatched,
  width,
  onClick,
}: Readonly<PosterProps>) {
  const t = useT();
  const [imgOk, setImgOk] = useState(true);
  const showImg = Boolean(poster) && imgOk;
  const gradient = `linear-gradient(158deg, ${colors[0]} 0%, ${colors[1]} 70%)`;
  const showToggle = watched != null && Boolean(onToggleWatched);

  return (
    <div
      style={{ width: width ?? 'var(--card-w)' }}
      className="group relative block shrink-0 text-left transition-transform duration-200 ease-out hover:-translate-y-1.5"
    >
      <button type="button" onClick={onClick} className="block w-full text-left focus:outline-none">
        <div
          className="relative aspect-2/3 overflow-hidden rounded-lg shadow-card transition-shadow duration-200
            group-hover:shadow-[0_0_0_3px_var(--kroma-accent),var(--shadow-pop)]
            group-focus-within:shadow-[0_0_0_3px_var(--kroma-accent),var(--shadow-pop)]"
          style={{ background: gradient }}
        >
          <Image
            src={poster ? sizedImageUrl(poster, width ?? 208) : null}
            fit="cover"
            fill
            onError={() => setImgOk(false)}
          />
          <div className="absolute inset-0 bg-linear-to-b from-black/5 via-transparent to-black/70" />
          <div
            className={`absolute inset-x-3.5 bottom-3.5 ${
              showImg ? 'opacity-0 transition-opacity duration-200 group-hover:opacity-100' : ''
            }`}
          >
            {genre ? (
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[.12em] text-white/60">
                {genre}
              </div>
            ) : null}
            <div className="font-display text-[20px] font-bold text-white">{title}</div>
          </div>
          {progress != null ? (
            <div className="absolute inset-x-0 bottom-0 h-1.25 bg-white/20">
              <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
          ) : null}
        </div>
      </button>
      {showToggle ? (
        // The kit disc floats over the card exactly where the old toggle sat;
        // the wrapper keeps the reveal-on-hover behaviour (persistent when
        // watched, appearing with the card's hover/focus otherwise).
        <div
          className={`absolute left-2.5 top-2.5 z-2 transition-opacity duration-150 ${
            watched ? '' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
        >
          <IconButton
            variant={watched ? 'primary' : 'scrim'}
            size={28}
            glyph={15}
            icon="check"
            label={watched ? t('content.markUnwatched') : t('content.markWatched')}
            onPress={() => onToggleWatched?.()}
          />
        </div>
      ) : null}
    </div>
  );
}
