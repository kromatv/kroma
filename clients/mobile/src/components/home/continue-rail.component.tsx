import type { ContinueItem } from '@kromatv/client/media';
import { episodeTag, sizedImageUrl } from '@kromatv/core';
import { useWindowDimensions } from 'react-native';
import { usePlay } from '#mobile/lib/play.hook';
import { useClient } from '#mobile/lib/session';
import { LandscapeRail, landscapeWidth } from './landscape-rail.component';

const fraction = ({ item, positionMs, durationMs }: ContinueItem): number => {
  const total = durationMs ?? item.durationMs ?? 0;
  return total > 0 ? Math.min(1, positionMs / total) : 0;
};

/** What the viewer left unfinished: a tap resumes it, here or on the TV being
 *  driven. */
export function ContinueRail({ entries }: Readonly<{ entries: readonly ContinueItem[] }>) {
  const client = useClient();
  const { play } = usePlay();
  const { width: windowWidth } = useWindowDimensions();
  const artWidth = landscapeWidth(windowWidth);

  return (
    <LandscapeRail
      tiles={entries.map((entry) => ({
        key: entry.item.id,
        title: entry.item.showTitle ?? entry.item.metadata?.title ?? entry.item.title,
        detail: episodeTag(entry.item) || null,
        art: sizedImageUrl(
          client.media.artwork.backdropFor(entry.item) ??
            client.media.artwork.posterFor(entry.item),
          artWidth,
        ),
        progress: fraction(entry),
        onPress: () => void play(entry.item.id),
      }))}
    />
  );
}
