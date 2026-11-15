import type { KromaClient } from '@kromatv/client';
import { ItemId, type SectionItem, ShowId } from '@kromatv/client/media';
import { Box } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useWindowDimensions } from 'react-native';
import { MediaRail, sectionCard } from '#mobile/components/cards';
import { SectionTitle } from '#mobile/components/ui';
import { filterEntries, type TitleFilter } from '#mobile/lib/home-filter';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { posterWidth } from '#mobile/lib/theme';

const MAX_TITLES = 24;

async function savedTitle(client: KromaClient, id: string): Promise<SectionItem | null> {
  const movie = await client.media.item(ItemId.parse(id)).catch(() => null);
  if (movie) {
    return { type: 'movie', item: movie };
  }
  const detail = await client.media.show(ShowId.parse(id)).catch(() => null);
  return detail ? { type: 'show', show: detail.show } : null;
}

function useMyListItems() {
  const client = useClient();
  const ids = useQuery(client.query.playback.myList());
  return useQuery({
    queryKey: ['myListItems', ids.data],
    enabled: (ids.data?.length ?? 0) > 0,
    queryFn: async (): Promise<SectionItem[]> => {
      const found = await Promise.all(
        (ids.data ?? []).slice(0, MAX_TITLES).map((id) => savedTitle(client, id)),
      );
      return found.filter((entry) => entry !== null);
    },
  });
}

/** The saved titles, assembled one request per title: only for a server whose
 *  home carries no section of them. */
export function MyListRail({ filter }: Readonly<{ filter: TitleFilter }>) {
  const t = useT();
  const client = useClient();
  const { width } = useWindowDimensions();
  const cardW = posterWidth(width);
  const items = useMyListItems();
  const entries = filterEntries(items.data ?? [], filter);
  if (entries.length === 0) {
    return null;
  }
  return (
    <Box>
      <SectionTitle>{t('nav.myList')}</SectionTitle>
      <MediaRail cards={entries.map((entry) => sectionCard(entry, client, cardW))} />
    </Box>
  );
}
