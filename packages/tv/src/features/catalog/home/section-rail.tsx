import type { CardSection } from '@kromatv/client/media';
import { genreLabels } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { MediaCard, Rail } from '@kromatv/ui/kit';
import { useClient } from '#tv/app/router';
import { HomeRow } from '#tv/features/catalog/home/home-row';
import { entryBackdrop, entryId, entryMetadata } from '#tv/features/catalog/home/sectionEntry';
import { RAIL_LIMIT, ROW_TILE, TILE_ART_W } from '#tv/features/catalog/home/tile-metrics';
import { useHomeTile } from '#tv/features/catalog/home/use-home-tile';
import type { HeldTitle } from '#tv/features/catalog/TitleMenu';

interface SectionRailProps {
  section: CardSection;
  onHold: (title: HeldTitle) => void;
}

/** A home section as a rail of 16:9 cards. A `wide` section's cards say what
 * the server noted about each entry where a plain rail names its genre. */
export function SectionRail({ section, onHold }: Readonly<SectionRailProps>) {
  const client = useClient();
  const t = useT();
  const tileOf = useHomeTile(onHold);
  const noted = section.layout === 'wide';

  return (
    <HomeRow title={section.title} reason={section.reason}>
      <Rail.List {...ROW_TILE}>
        {section.items.slice(0, RAIL_LIMIT).map((entry) => {
          const id = entryId(entry);
          const kind = t(entry.type === 'show' ? 'content.series' : 'content.film');
          return (
            <MediaCard
              key={id}
              {...tileOf(entry)}
              overline={
                (noted ? section.notes[id] : undefined) ??
                genreLabels(t, entryMetadata(entry))[0] ??
                kind
              }
              art={entryBackdrop(entry, client, TILE_ART_W)}
            />
          );
        })}
      </Rail.List>
    </HomeRow>
  );
}
