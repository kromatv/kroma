import { watchableList } from '@kromatv/client/query';
import { watchableTargets } from '@kromatv/core';
import { Box } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useWindowDimensions } from 'react-native';
import { MediaRail } from '#mobile/components/cards';
import { SectionTitle } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { posterWidth } from '#mobile/lib/theme';
import { useWatchable, watchableCard } from '#mobile/lib/watchable';

const ARRIVING_MS = 10_000;

export function WatchableRail() {
  const t = useT();
  const client = useClient();
  const { api } = useWatchable();
  const { width } = useWindowDimensions();
  const { data } = useQuery({ ...watchableList(api), refetchInterval: ARRIVING_MS });

  const cardW = posterWidth(width);
  const cards = watchableTargets(data?.entries ?? []).map((target) =>
    watchableCard(target, client, cardW),
  );

  if (!api || cards.length === 0) return null;
  return (
    <Box>
      <SectionTitle>{t('requests.watchNow')}</SectionTitle>
      <MediaRail cards={cards} />
    </Box>
  );
}
