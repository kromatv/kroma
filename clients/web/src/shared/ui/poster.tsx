import { sizedImageUrl, type Translate } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  ArtScrim,
  Box,
  type HostElement,
  Img,
  Progress,
  rhythm,
  Text,
  VirtualRail,
} from '@kroma/ui/kit';
import { type ReactElement, useState } from 'react';
import type { PosterAction } from '#web/shared/ui/poster-action-bar';
import { ART_FADE, PosterTile } from '#web/shared/ui/poster-tile';

export interface PosterProps {
  title: string;
  genre?: string;
  colors?: [string, string];
  poster?: string | null;
  progress?: number | null;
  watched?: boolean | null;
  onToggleWatched?: () => void;
  inList?: boolean | null;
  onToggleList?: () => void;
  width?: number;
  caption?: boolean;
  as?: HostElement;
}

const RAIL_TILE = rhythm.cardWidth;
const RAIL_GAP = rhythm.rowGap;
const RAIL_PAD = 12;

export interface PosterRailProps<T> {
  data: readonly T[];
  renderItem: (item: T, index: number) => ReactElement;
  extraHeight?: number;
  onEndReached?: () => void;
}

export function PosterRail<T>({
  data,
  renderItem,
  extraHeight = 0,
  onEndReached,
}: Readonly<PosterRailProps<T>>) {
  return (
    <VirtualRail
      data={data}
      itemWidth={RAIL_TILE + RAIL_GAP}
      gap={RAIL_GAP}
      style={{ height: Math.round(RAIL_TILE * 1.5) + extraHeight + RAIL_PAD * 2 }}
      contentStyle={{ paddingVertical: RAIL_PAD }}
      onEndReached={onEndReached}
      renderItem={(item, index) => (
        <Box w="100%" maxW={RAIL_TILE} self="center">
          {renderItem(item, index)}
        </Box>
      )}
    />
  );
}

type TileToggles = Pick<PosterProps, 'inList' | 'onToggleList' | 'watched' | 'onToggleWatched'>;

function tileActions(
  t: Translate,
  { inList, onToggleList, watched, onToggleWatched }: Readonly<TileToggles>,
): PosterAction[] {
  const actions: PosterAction[] = [];
  if (inList != null && onToggleList) {
    actions.push({
      key: 'list',
      icon: inList ? 'bookmark-filled' : 'bookmark',
      label: t(inList ? 'content.removeFromList' : 'content.addToList'),
      active: inList,
      onSelect: onToggleList,
    });
  }
  if (watched != null && onToggleWatched) {
    actions.push({
      key: 'watched',
      icon: 'eye',
      label: t(watched ? 'content.markUnwatched' : 'content.markWatched'),
      active: watched,
      onSelect: onToggleWatched,
    });
  }
  return actions;
}

export function Poster({
  title,
  genre,
  colors = ['#3A2E5C', '#0E1430'],
  poster = null,
  progress = null,
  watched = null,
  onToggleWatched,
  inList = null,
  onToggleList,
  width,
  caption = true,
  as,
}: Readonly<PosterProps>) {
  const t = useT();
  const [imgOk, setImgOk] = useState(true);
  const showImg = Boolean(poster) && imgOk;

  return (
    <PosterTile
      label={title}
      as={as}
      width={width}
      background={`linear-gradient(158deg, ${colors[0]} 0%, ${colors[1]} 70%)`}
      watched={watched === true}
      actions={tileActions(t, { inList, onToggleList, watched, onToggleWatched })}
    >
      {(engaged) => {
        const revealed = !showImg || engaged;
        return (
          <>
            <Img
              src={poster ? sizedImageUrl(poster, width ?? RAIL_TILE) : null}
              alt={title}
              fit="cover"
              radius="lg"
              fill
              onError={() => setImgOk(false)}
            />
            {caption ? (
              <>
                <Box fill pointerEvents="none" opacity={revealed ? 1 : 0} style={ART_FADE}>
                  <ArtScrim variant="deep" radius="lg" />
                </Box>
                <Box
                  absolute
                  left={14}
                  right={14}
                  bottom={14}
                  align="flex-start"
                  opacity={revealed ? 1 : 0}
                  style={ART_FADE}
                >
                  {genre ? (
                    <Text variant="overline" color="white/60" mb={4}>
                      {genre}
                    </Text>
                  ) : null}
                  <Text variant="title" color="white">
                    {title}
                  </Text>
                </Box>
              </>
            ) : null}
            {progress != null ? (
              <Box absolute left={0} right={0} bottom={0}>
                <Progress
                  value={progress / 100}
                  thickness={5}
                  trackColor="white/20"
                  rounded={false}
                />
              </Box>
            ) : null}
          </>
        );
      }}
    </PosterTile>
  );
}
