import { type DiscoverEntry, posterColors, sizedImageUrl } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Img, rhythm, Text } from '@kroma/ui/kit';
import { type ReactNode, useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';
import { useMyList } from '#web/shared/lib/mylist';
import { useWatched } from '#web/shared/lib/watched';
import type { PosterAction } from '#web/shared/ui/poster-action-bar';
import { PosterTile } from '#web/shared/ui/poster-tile';
import { RequestStatusChip } from '#web/shared/ui/request-status-chip';
import { RouteLink } from '#web/shared/ui/route-link';
import { TileCaption } from '#web/shared/ui/tile-caption';

export function DiscoverCard({ entry, width }: Readonly<{ entry: DiscoverEntry; width?: number }>) {
  const t = useT();
  const { client } = useAuth();
  const { isWatched, toggleWatched } = useWatched();
  const { inList, toggle: toggleMyList } = useMyList();
  const [imgOk, setImgOk] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState(entry.requestStatus);
  const [c1, c2] = posterColors(String(entry.tmdbId));
  const art = sizedImageUrl(entry.posterUrl, width ?? rhythm.cardWidth);
  const showImg = Boolean(art) && imgOk;
  const owned = entry.inLibrary && entry.localId;
  const canRequest = !owned && !optimisticStatus;
  // One id for both owned and discover titles, so a bookmark on a title that is
  // not in the library yet survives the rescan that brings it in.
  const listId = owned ? (entry.localId ?? '') : `tmdb:${entry.tmdbId}`;
  const tint = `linear-gradient(158deg, ${c1} 0%, ${c2} 70%)`;

  let statusChip: ReactNode = null;
  if (owned) {
    statusChip = <RequestStatusChip status="available" size="card" />;
  } else if (optimisticStatus) {
    statusChip = (
      <RequestStatusChip status={optimisticStatus} size="card" progress={entry.requestProgress} />
    );
  }

  const fiche = owned ? (
    <RouteLink
      to={entry.kind === 'show' ? '/shows/$id' : '/movies/$id'}
      params={{ id: entry.localId ?? '' }}
    />
  ) : (
    <RouteLink
      to="/discover/$type/$tmdbId"
      params={{ type: entry.kind === 'show' ? 'tv' : 'movie', tmdbId: String(entry.tmdbId) }}
    />
  );

  const request = () => {
    setRequesting(true);
    client
      .createRequest({ kind: entry.kind, tmdbId: entry.tmdbId, seasons: null })
      .then((req) => setOptimisticStatus(req.status))
      .catch(() => undefined)
      .finally(() => setRequesting(false));
  };

  const bookmarked = inList(listId);
  const seen = isWatched(listId);
  const actions: PosterAction[] = [];
  if (canRequest) {
    actions.push({
      key: 'request',
      icon: 'download',
      label: t('discover.request'),
      disabled: requesting,
      onSelect: request,
    });
  }
  actions.push(
    {
      key: 'list',
      icon: bookmarked ? 'bookmark-filled' : 'bookmark',
      label: t(bookmarked ? 'content.removeFromList' : 'content.addToList'),
      active: bookmarked,
      onSelect: () => toggleMyList(listId),
    },
    {
      key: 'watched',
      icon: 'eye',
      label: t(seen ? 'content.markUnwatched' : 'content.markWatched'),
      active: seen,
      onSelect: () => toggleWatched(listId),
    },
  );

  return (
    <PosterTile
      label={entry.title}
      as={fiche}
      width={width}
      background={tint}
      watched={seen}
      actions={actions}
      footer={
        <TileCaption
          title={entry.title}
          kind={entry.kind}
          year={entry.year ?? null}
          rating={entry.rating ?? null}
        />
      }
    >
      {() => (
        <>
          {showImg ? (
            <Img src={art} alt={entry.title} radius="lg" fill onError={() => setImgOk(false)} />
          ) : (
            <Box fill justify="flex-end" p={12}>
              <Text variant="label" color="white/90" lines={3}>
                {entry.title}
              </Text>
            </Box>
          )}
          <Box absolute left={12} top={12} gap={8}>
            {statusChip}
          </Box>
        </>
      )}
    </PosterTile>
  );
}
