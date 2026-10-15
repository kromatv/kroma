import type { PlaybackSession } from '@kromatv/client/admin';
import type { ItemId } from '@kromatv/client/media';
import { Box } from '@kromatv/ui/kit';
import { type ReactNode, useState } from 'react';
import { imageUrl, kromaClient } from '#web/shared/lib/api';
import { posterScrim } from '#web/shared/lib/art-styles';
import { useStoryboard } from '#web/shared/lib/use-storyboard';
import { Image } from '#web/shared/ui';

const THUMB_W = 132;

function Frame({
  title,
  poster,
  children,
}: Readonly<{ title: string; poster: string | null; children?: ReactNode }>) {
  const [posterFailed, setPosterFailed] = useState(false);
  return (
    <Box w={THUMB_W} aspect={16 / 9} shrink={0} self="flex-start" radius="xs" overflow="hidden">
      <Box fill style={posterScrim(title)} />
      {poster && !posterFailed ? (
        <Image src={poster} fit="cover" fill onError={() => setPosterFailed(true)} />
      ) : null}
      {children}
    </Box>
  );
}

function CatalogueThumb({ s, itemId }: Readonly<{ s: PlaybackSession; itemId: ItemId }>) {
  // Never kick lazy ffmpeg generation just to paint a 132px thumb: use the
  // sheet only if it already exists.
  const story = useStoryboard(itemId, { generate: false });
  const frame = story.tile(s.positionMs / 1000, THUMB_W);
  return (
    <Frame title={s.title} poster={kromaClient().media.artwork.posterUrl(itemId)}>
      {frame ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("${frame.sheet}")`,
            backgroundPosition: `${frame.offsetX}px ${frame.offsetY}px`,
            backgroundSize: `${frame.sheetWidth * frame.scale}px ${frame.sheetHeight * frame.scale}px`,
            backgroundRepeat: 'no-repeat',
          }}
        />
      ) : null}
    </Frame>
  );
}

/** The picture of a live session: a catalogue item's current frame or poster,
 * a watch download's poster, and a title-seeded gradient under either. */
export function NowPlayingThumb({ s }: Readonly<{ s: PlaybackSession }>) {
  if (s.watch) return <Frame title={s.title} poster={imageUrl(s.watch.poster)} />;
  return <CatalogueThumb s={s} itemId={s.itemId} />;
}
