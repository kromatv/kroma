import type {} from '@kromatv/client/monitoring';
import type { LedgerEpisode, SearchScope } from '@kromatv/client/requests';
import { type SlotProps, useAdminHost, useCap, useT } from '@kromatv/module-sdk';
import { Button, IconButton, Row } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAcquisitionApi } from './api';
import type { SearchUnit } from './judgement-schemas';
import { SearchResultsDialog } from './search-results-dialog';
import { useSearchNow } from './use-search-now';
import { useTitleSearch } from './use-title-search';

/** Nothing is fetched until one of the two searches is pressed: the library
 *  index renders one of these per row. */
export function MonitoringSearch({
  kind,
  tmdbId,
  title,
  season,
  episode,
  compact,
}: Readonly<SlotProps['monitoring.search']>) {
  const t = useT();
  const { client } = useAdminHost();
  const acquisition = useAcquisitionApi();
  const searchNow = useSearchNow();
  const search = useTitleSearch(kind, tmdbId);
  const [opened, setOpened] = useState(false);
  const library = useCap('library.manage');
  const requests = useCap('requests.manage');
  const settings = useCap('settings.manage');
  const canGrab = library || requests || settings;
  const what = subject(t, title, season, episode);

  const improve = () =>
    searchNow.start(async () => {
      const units = await unitsOf(client, kind, tmdbId, season, episode);
      return acquisition.searchNow(kind, tmdbId, units);
    });

  const manual = () => {
    setOpened(true);
    search.run(scopeOf(kind, season, episode));
  };

  return (
    <Row wrap={!compact} gap={6} align="center">
      {compact ? (
        <>
          <IconButton
            control="sm"
            radius="sm"
            variant="ghost"
            icon="sparkles"
            label={t('acq.improveOf', { name: what })}
            disabled={searchNow.busy}
            onPress={improve}
          />
          <IconButton
            control="sm"
            radius="sm"
            variant="ghost"
            icon="search"
            label={t('acq.manualSearchOf', { name: what })}
            disabled={search.state.busy}
            onPress={manual}
          />
        </>
      ) : (
        <>
          <Button
            size="sm"
            variant="glass"
            icon="sparkles"
            label={t('acq.improveNow')}
            loading={searchNow.busy}
            onPress={improve}
          />
          <Button
            size="sm"
            variant="glass"
            icon="search"
            label={t('acq.manualSearch')}
            loading={search.state.busy}
            onPress={manual}
          />
        </>
      )}
      {opened ? (
        <SearchResultsDialog
          state={search.state}
          canGrab={canGrab}
          onGrab={search.grab}
          onClose={() => {
            search.reset();
            setOpened(false);
          }}
        />
      ) : null}
    </Row>
  );
}

function scopeOf(
  kind: 'movie' | 'show',
  season: number | null,
  episode: number | null,
): SearchScope {
  if (kind === 'movie') return { scope: 'movie' };
  if (season === null) return { scope: 'all' };
  if (episode === null) return { scope: 'season', season };
  return { scope: 'episode', season, episode };
}

type Client = ReturnType<typeof useAdminHost>['client'];

/** The server matches a unit on its season AND its episode, so a season is
 *  sent as the episodes its ledger holds rather than as a season on its own,
 *  which would match nothing. */
async function unitsOf(
  client: Client,
  kind: 'movie' | 'show',
  tmdbId: number,
  season: number | null,
  episode: number | null,
): Promise<SearchUnit[]> {
  if (kind === 'movie' || season === null) return [];
  if (episode !== null) return [{ season, episode }];
  const ledger = await client.monitoring.seasonLedger(tmdbId, season);
  return ledger.episodes.map((one: LedgerEpisode) => ({ season, episode: one.episode }));
}

function subject(
  t: ReturnType<typeof useT>,
  title: string,
  season: number | null,
  episode: number | null,
): string {
  if (season === null) return title;
  const unit =
    episode === null
      ? t('requests.seasonNumber', { season })
      : `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
  return `${title} ${unit}`;
}
