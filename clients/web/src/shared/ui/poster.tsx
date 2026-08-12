import { sizedImageUrl } from '@kroma/core';
import { useT } from '@kroma/ui';
import { ArtScrim, Box, Ground, IconButton, Progress, Text, VirtualRail } from '@kroma/ui/kit';
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
      renderItem={(item, index) => <div className="poster-cell">{renderItem(item, index)}</div>}
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
    <div style={{ width: width ?? 'var(--card-w)' }} className="poster-tile">
      <button type="button" onClick={onClick} className="poster-hit">
        <div className="poster-art" style={{ background: gradient }}>
          <Image
            src={poster ? sizedImageUrl(poster, width ?? 208) : null}
            fit="cover"
            fill
            onError={() => setImgOk(false)}
          />
          <ArtScrim radius="lg" />
          <div className="poster-caption" data-reveal={showImg ? '' : undefined}>
            {genre ? (
              <Text variant="overline" color="white/60" mb={4}>
                {genre}
              </Text>
            ) : null}
            <Text variant="title" color="white">
              {title}
            </Text>
          </div>
          {progress != null ? (
            <Box absolute left={0} right={0} bottom={0}>
              <Progress value={progress / 100} thickness={5} trackColor="white/20" />
            </Box>
          ) : null}
        </div>
      </button>
      {showToggle ? (
        <div className="poster-toggle" data-reveal={watched ? undefined : ''}>
          <Ground tone="dark">
            <IconButton
              variant={watched ? 'primary' : 'scrim'}
              size={28}
              glyph={15}
              icon="check"
              label={watched ? t('content.markUnwatched') : t('content.markWatched')}
              onPress={() => onToggleWatched?.()}
            />
          </Ground>
        </div>
      ) : null}
    </div>
  );
}
