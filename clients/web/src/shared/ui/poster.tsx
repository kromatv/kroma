import { sizedImageUrl } from '@kroma/core';
import { useT } from '@kroma/ui';
import { IconButton, Progress, VirtualRail } from '@kroma/ui/kit';
import { type ReactElement, useState } from 'react';
import { Image } from '#web/shared/ui/image';

export interface PosterProps {
  title: string;
  genre?: string;
  colors?: [string, string];
  poster?: string | null;
  progress?: number | null;
  watched?: boolean | null;
  onToggleWatched?: () => void;
  width?: number;
  onClick?: () => void;
}

const RAIL_TILE = 208;
const RAIL_GAP = 18;
const RAIL_PAD = 12;

export interface PosterRailProps<T> {
  data: readonly T[];
  renderItem: (item: T, index: number) => ReactElement;
  extra?: number;
  onEndReached?: () => void;
}

/**
 * `VirtualRail` sized for poster tiles. The pitch is a target: the rail shares
 * its width into whole cells, and a wrapper caps a wider cell back at the
 * design width.
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
 * The tile wrapper is a `<div>`, not a `<button>`, so the watched toggle can be
 * a focusable `<button>` sibling without nesting interactive elements.
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
        {/* The accent ring is an outline, not a second box-shadow: a shadow list
            interpolates item by item, so growing [card] into [ring, pop] faded the
            card's 28px blur into the ring's slot and the ring arrived as a halo
            before it snapped. An outline has no blur radius at any frame. */}
        <div
          className="relative aspect-2/3 overflow-hidden rounded-lg shadow-card outline-3 outline-transparent transition-[box-shadow,outline-color] duration-200
            group-hover:shadow-pop group-hover:outline-accent
            group-focus-within:shadow-pop group-focus-within:outline-accent"
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
            <div className="absolute inset-x-0 bottom-0">
              <Progress value={progress / 100} size={5} trackColor="white/20" />
            </div>
          ) : null}
        </div>
      </button>
      {showToggle ? (
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
