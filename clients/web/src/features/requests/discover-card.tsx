// A TMDB discovery result as a poster tile: real art or gradient, overlaid
// rating + availability/request chip, and a hover "request" affordance.
// Clicks route to the local fiche when owned, else the discover detail.

import { type DiscoverEntry, posterColors, sizedImageUrl } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  backdropBlur,
  color,
  Focusable,
  gradient,
  Icon,
  Img,
  Row,
  styles,
  Text,
} from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { RequestStatusChip } from '#web/shared/ui/request-status-chip';

const RATING_PILL = backdropBlur(4);
const RATING_LABEL = { fontSize: 10.5, fontWeight: '700' } as const;
const REQUEST_LABEL = { fontSize: 12.5, fontWeight: '700' } as const;

// A touch screen has no hover, so what a pointer reveals is always up there.
const COARSE =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

const s = styles({
  art: { aspect: 2 / 3, radius: 'lg', overflow: 'hidden', shadow: 'card' },
  artLit: { shadow: 'pop' },
  overlay: { opacity: 0, pointerEvents: 'none' },
  overlayLit: { opacity: 1 },
});

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
  const tint = `linear-gradient(158deg, ${c1} 0%, ${c2} 70%)`;

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
    <div style={{ width: width ?? 'var(--card-w)', flexShrink: 0 }}>
      <Focusable label={entry.title} onPress={open} focusScale={1.03}>
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

              {/* top gradient scrim keeps the chips legible over bright art */}
              <Box
                absolute
                left={0}
                right={0}
                top={0}
                h={64}
                style={[s.overlay, lit ? s.overlayLit : null, TOP_SCRIM]}
              />

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
                  <Text color="accent" style={RATING_LABEL}>
                    {entry.rating.toFixed(1)}
                  </Text>
                </Row>
              ) : null}

              {/* Visual only: the press opens the detail where the real request action lives. */}
              {canRequest ? (
                <Row
                  absolute
                  left={0}
                  right={0}
                  bottom={0}
                  justify="center"
                  gap={6}
                  pt={32}
                  pb={12}
                  style={[s.overlay, lit ? s.overlayLit : null, CTA_SCRIM]}
                >
                  <Icon name="plus" size={14} thickness={2.6} color="white" />
                  <Text color="white" style={REQUEST_LABEL}>
                    {t('discover.request')}
                  </Text>
                </Row>
              ) : null}
            </Box>
          );
        }}
      </Focusable>
      <Box mt={8} px={2}>
        <Text variant="label" lines={1}>
          {entry.title}
        </Text>
        <Row gap={6} mt={2}>
          <Text variant="meta" color="textDim">
            {entry.kind === 'show' ? t('discover.kindShow') : t('discover.kindMovie')}
          </Text>
          {entry.year ? (
            <>
              <Text variant="meta" color="white/20">
                ·
              </Text>
              <Text variant="meta" color="textDim">
                {entry.year}
              </Text>
            </>
          ) : null}
        </Row>
      </Box>
    </div>
  );
}

const TOP_SCRIM = gradient(`linear-gradient(to bottom, ${color('black/55')}, transparent)`);

const CTA_SCRIM = gradient(`linear-gradient(to top, ${color('black/75')}, transparent)`);
