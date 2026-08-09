// A TMDB discovery result as a poster tile: real art or gradient, overlaid
// rating + availability/request chip, and a hover "request" affordance.
// Clicks route to the local fiche when owned, else the discover detail.

import { type DiscoverEntry, posterColors, sizedImageUrl } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, backdropBlur, Icon, Row, Txt } from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { RequestStatusChip } from '#web/features/requests/request-status-chip';
import { Image } from '#web/shared/ui';

const RATING_PILL = backdropBlur(4);
const RATING_LABEL = { fontSize: 10.5, fontWeight: '700' } as const;
const REQUEST_LABEL = { fontSize: 12.5, fontWeight: '700' } as const;

export function DiscoverCard({ entry, width }: Readonly<{ entry: DiscoverEntry; width?: number }>) {
  const t = useT();
  const navigate = useNavigate();
  const [imgOk, setImgOk] = useState(true);
  const [c1, c2] = posterColors(String(entry.tmdbId));
  // 208 = the fluid --card-w maximum, so the art stays sharp at every size.
  const art = sizedImageUrl(entry.posterUrl, width ?? 208);
  const showImg = Boolean(art) && imgOk;
  const owned = entry.inLibrary && entry.localId;
  const canRequest = !owned && !entry.requestStatus;

  // The overlaid availability/request chip: owned titles show "available",
  // requested ones show their live request status, and the rest show nothing.
  let statusChip: ReactNode = null;
  if (owned) {
    statusChip = <RequestStatusChip status="available" size="card" />;
  } else if (entry.requestStatus) {
    statusChip = (
      <RequestStatusChip
        status={entry.requestStatus}
        size="card"
        progress={entry.requestProgress}
      />
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

  return (
    <div
      style={{ width: width ?? 'var(--card-w)' }}
      className="group/card relative block shrink-0 text-left transition-transform duration-200 ease-out hover:-translate-y-1.5"
    >
      <button type="button" onClick={open} className="block w-full text-left focus:outline-none">
        <div
          className="relative aspect-2/3 overflow-hidden rounded-lg shadow-card outline-3 outline-transparent transition-[box-shadow,outline-color] duration-200 group-hover/card:shadow-pop group-hover/card:outline-accent"
          style={{ background: `linear-gradient(158deg, ${c1} 0%, ${c2} 70%)` }}
        >
          {showImg ? (
            <Image src={art} alt={entry.title} fit="cover" fill onError={() => setImgOk(false)} />
          ) : (
            <Box fill justify="flex-end" p={12}>
              <Txt variant="label" color="white/90" lines={3}>
                {entry.title}
              </Txt>
            </Box>
          )}

          {/* top gradient scrim keeps the chips legible over bright art */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-black/55 to-transparent opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100 pointer-coarse:opacity-100" />

          <Box absolute left={8} top={8} gap={6}>
            {statusChip}
          </Box>

          {entry.rating ? (
            <Row
              absolute
              top={8}
              right={8}
              gap={2}
              px={6}
              py={2}
              radius="pill"
              bg="black/55"
              style={RATING_PILL}
            >
              <Icon name="star-filled" size={9} color="accent" />
              <Txt color="accent" style={RATING_LABEL}>
                {entry.rating.toFixed(1)}
              </Txt>
            </Row>
          ) : null}

          {/* Visual only: the click opens the detail where the real request action lives. */}
          {canRequest ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-center gap-1.5 bg-linear-to-t from-black/75 to-transparent pb-3 pt-8 opacity-0 transition-all duration-200 group-hover/card:translate-y-0 group-hover/card:opacity-100 group-focus-within/card:translate-y-0 group-focus-within/card:opacity-100 pointer-coarse:translate-y-0 pointer-coarse:opacity-100">
              <Icon name="plus" size={14} stroke={2.6} color="white" />
              <Txt color="white" style={REQUEST_LABEL}>
                {t('discover.request')}
              </Txt>
            </div>
          ) : null}
        </div>
      </button>
      <Box mt={8} px={2}>
        <Txt variant="label" lines={1}>
          {entry.title}
        </Txt>
        <Row gap={6} mt={2}>
          <Txt variant="meta" color="textDim">
            {entry.kind === 'show' ? t('discover.kindShow') : t('discover.kindMovie')}
          </Txt>
          {entry.year ? (
            <>
              <Txt variant="meta" color="white/20">
                ·
              </Txt>
              <Txt variant="meta" color="textDim">
                {entry.year}
              </Txt>
            </>
          ) : null}
        </Row>
      </Box>
    </div>
  );
}
