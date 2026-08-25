// A TMDB discovery result as a poster tile: real art or gradient and an
// availability/request chip, wearing the same hover action bar a library poster
// does. Clicks route to the local fiche when owned, else the discover detail.

import { type DiscoverEntry, posterColors, sizedImageUrl } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Focusable, gradient, Img, styles, Text, WatchedBadge } from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';
import { useMyList } from '#web/shared/lib/mylist';
import { useWatched } from '#web/shared/lib/watched';
import { type PosterAction, PosterActionBar } from '#web/shared/ui/poster-action-bar';
import { RequestStatusChip } from '#web/shared/ui/request-status-chip';
import { TileCaption } from '#web/shared/ui/tile-caption';

// A touch screen has no hover, so what a pointer reveals is always up there.
const COARSE =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

const s = styles({
  // The ring is an outline and takes the corners of the element it is on, so
  // the tile carries the art's radius rather than leaving a square ring on it.
  tile: { w: '100%', radius: 'lg' },
  art: { aspect: 2 / 3, radius: 'lg', overflow: 'hidden', shadow: 'card' },
  artLit: { shadow: 'pop' },
});

export function DiscoverCard({ entry, width }: Readonly<{ entry: DiscoverEntry; width?: number }>) {
  const t = useT();
  const navigate = useNavigate();
  const { client } = useAuth();
  const { isWatched, toggleWatched } = useWatched();
  const { inList, toggle: toggleMyList } = useMyList();
  const [imgOk, setImgOk] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState(entry.requestStatus);
  const [c1, c2] = posterColors(String(entry.tmdbId));
  const art = sizedImageUrl(entry.posterUrl, width ?? 208);
  const showImg = Boolean(art) && imgOk;
  const owned = entry.inLibrary && entry.localId;
  const canRequest = !owned && !optimisticStatus;
  // Watched and bookmark use one id for both owned and discover titles: the
  // local item id when owned, else `tmdb:<id>` so membership survives a library
  // rescan — which is what lets a not-yet-available title be bookmarked.
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

  const open = () => {
    if (owned) {
      navigate({
        to: entry.kind === 'show' ? '/show/$id' : '/movie/$id',
        params: { id: entry.localId ?? '' },
      });
    } else {
      navigate({
        to: '/discover/$type/$tmdbId',
        params: { type: entry.kind === 'show' ? 'tv' : 'movie', tmdbId: String(entry.tmdbId) },
      });
    }
  };

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
    <div className="poster-frame" style={{ width: width ?? 'var(--card-w)', flexShrink: 0 }}>
      <Focusable label={entry.title} onPress={open} focusScale={1.03} style={s.tile}>
        {(state) => {
          const lit = COARSE || state.hovered || state.focused;
          return (
            <Box style={[s.art, lit ? s.artLit : null]}>
              {showImg ? (
                <Img
                  src={art}
                  alt={entry.title}
                  background={tint}
                  radius="lg"
                  fill
                  onError={() => setImgOk(false)}
                />
              ) : (
                <Box fill justify="flex-end" p={12} radius="lg" style={gradient(tint)}>
                  <Text variant="label" color="white/90" lines={3}>
                    {entry.title}
                  </Text>
                </Box>
              )}

              {seen ? <WatchedBadge /> : null}
              {/* Clear of the fold when there is one: it owns the top-left 40px. */}
              <Box absolute left={12} top={seen ? 46 : 12} gap={8}>
                {statusChip}
              </Box>

              <PosterActionBar actions={actions} />
            </Box>
          );
        }}
      </Focusable>
      <TileCaption
        title={entry.title}
        kind={entry.kind}
        year={entry.year ?? null}
        rating={entry.rating ?? null}
      />
    </div>
  );
}
