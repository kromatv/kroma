import type { ContinueItem } from '@kromatv/client/media';
import { episodeTag, posterColors } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { MediaCard, Rail } from '@kromatv/ui/kit';
import { useClient, useNav } from '#tv/app/router';
import { HomeRow } from '#tv/features/catalog/home/home-row';
import { ROW_TILE, TILE_ART_W } from '#tv/features/catalog/home/tile-metrics';
import type { HeldTitle } from '#tv/features/catalog/TitleMenu';

const watchedFraction = (positionMs: number, duration: number) =>
  duration > 0 ? Math.min(100, Math.round((positionMs / duration) * 100)) / 100 : 0;

interface ContinueTileProps {
  entry: ContinueItem;
  onHold: (title: HeldTitle) => void;
}

function ContinueTile({
  entry: { item, positionMs, durationMs },
  onHold,
}: Readonly<ContinueTileProps>) {
  const client = useClient();
  const { go } = useNav();
  const t = useT();
  const progress = watchedFraction(positionMs, durationMs ?? item.durationMs ?? 0);

  return (
    <MediaCard
      title={item.title}
      overline={
        item.kind === 'episode' && item.showTitle
          ? `${item.showTitle} · ${episodeTag(item)}`
          : t('content.film')
      }
      art={
        client.media.artwork.backdropFor(item, TILE_ART_W) ??
        client.media.artwork.posterFor(item, TILE_ART_W)
      }
      tint={posterColors(item.id)}
      progress={progress}
      onPress={() => go('player', { item })}
      onLongPress={() => onHold({ kind: 'resume', item, progress })}
    />
  );
}

interface ContinueRailProps {
  items: readonly ContinueItem[];
  onHold: (title: HeldTitle) => void;
}

/** The titles the viewer is part way through; OK resumes one where it stopped. */
export function ContinueRail({ items, onHold }: Readonly<ContinueRailProps>) {
  const t = useT();

  return (
    <HomeRow title={t('content.continueWatching')}>
      <Rail.List {...ROW_TILE}>
        {items.map((entry) => (
          <ContinueTile key={entry.item.id} entry={entry} onHold={onHold} />
        ))}
      </Rail.List>
    </HomeRow>
  );
}
