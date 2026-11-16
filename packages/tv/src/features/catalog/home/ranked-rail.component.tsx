import type { CardSection } from '@kromatv/client/media';
import { Rail } from '@kromatv/ui/kit';
import { useClient } from '#tv/app/router';
import { HomeRow } from '#tv/features/catalog/home/home-row.component';
import { RankedTile } from '#tv/features/catalog/home/ranked-tile.component';
import { entryId, entryPortrait } from '#tv/features/catalog/home/section-entry';
import { RANKED_TILE, TILE_ART_W } from '#tv/features/catalog/home/tile-metrics';
import { useHomeTile } from '#tv/features/catalog/home/use-home-tile.hook';
import type { HeldTitle } from '#tv/features/catalog/title-menu.hook';

interface RankedRailProps {
  section: CardSection;
  onHold: (title: HeldTitle) => void;
}

/** A home section whose order is a ranking: each poster wears its place. */
export function RankedRail({ section, onHold }: Readonly<RankedRailProps>) {
  const client = useClient();
  const tileOf = useHomeTile(onHold);

  return (
    <HomeRow title={section.title} reason={section.reason}>
      <Rail.List {...RANKED_TILE}>
        {section.items.map((entry, at) => (
          <RankedTile
            key={entryId(entry)}
            rank={at + 1}
            {...tileOf(entry)}
            art={entryPortrait(entry, client, TILE_ART_W)}
          />
        ))}
      </Rail.List>
    </HomeRow>
  );
}
