// The card that stands in for a season the library does not fully hold: press it
// to request the gap. The whole card is the control, so its trailing badge is a
// face rather than a second stop.

import { useT } from '@kroma/ui';
import { Box, color, Focusable, sv, Text } from '@kroma/ui/kit';
import { IconPlus } from '@tabler/icons-react';
import type { CSSProperties } from 'react';
import { RequestStatusChip } from '#web/features/requests/request-status-chip';
import type { TitleSeason } from '#web/shared/lib/titleView';

const BOLD = { fontWeight: '700' } as const;

// The page gutter is a fluid CSS custom property, which no style number can
// carry, so anything indented by it stays a plain element.
const GUTTER: CSSProperties = {
  paddingLeft: 'var(--gutter-web)',
  paddingRight: 'var(--gutter-web)',
};

const seasonCard = sv({
  base: {
    row: true,
    align: 'center',
    gap: 12,
    radius: 'xl',
    px: 16,
    py: 12,
    w: '100%',
    maxW: 448,
    border: 'white/8',
    bg: 'white/3',
    _hover: { border: 'accent/50', bg: 'white/6' },
  },
  variants: {
    tone: {
      normal: {},
      partial: {
        border: 'accent/30',
        bg: 'accent/6',
        _hover: { border: 'accent/60', bg: 'accent/10' },
      },
      locked: {
        border: 'white/5',
        bg: 'white/2',
        _hover: { border: 'white/5', bg: 'white/2' },
      },
    },
  },
  defaults: { tone: 'normal' },
});

export interface SeasonRequestCardProps {
  season: TitleSeason;
  /** Whether the viewer may request at all; without it the card only reports. */
  canRequest: boolean;
  onPick: () => void;
}

/** One season's request affordance. */
export function SeasonRequestCard({
  season,
  canRequest,
  onPick,
}: Readonly<SeasonRequestCardProps>) {
  const t = useT();
  const partial = !season.available && season.episodesAvailable > 0;
  const locked = season.available || season.requested || !canRequest;
  const epLabel = partial
    ? t('discover.episodesPartial', {
        have: String(season.episodesAvailable),
        total: String(season.episodeCount),
      })
    : t('discover.episodesN', { n: String(season.episodeCount) });

  let tone: 'normal' | 'partial' | 'locked' = 'normal';
  if (locked) tone = 'locked';
  else if (partial) tone = 'partial';

  const name = season.name ?? t('discover.seasonN', { n: String(season.number) });

  return (
    <div style={GUTTER}>
      <Focusable sv={seasonCard} vars={{ tone }} disabled={locked} label={name} onPress={onPick}>
        {({ hovered }) => (
          <>
            <Box minW={0} flex>
              <Text variant="meta" lines={1} style={BOLD}>
                {name}
              </Text>
              <Text variant="meta" color={partial ? 'accent' : 'white/45'} lines={1} mt={2}>
                {epLabel}
              </Text>
            </Box>
            <SeasonTrailing
              season={season}
              canRequest={canRequest}
              partial={partial}
              hovered={hovered}
            />
          </>
        )}
      </Focusable>
    </div>
  );
}

function SeasonTrailing({
  season,
  canRequest,
  partial,
  hovered,
}: Readonly<{ season: TitleSeason; canRequest: boolean; partial: boolean; hovered: boolean }>) {
  if (season.available || season.requested) {
    return <RequestStatusChip status={season.available ? 'available' : 'pending'} size="card" />;
  }
  if (!canRequest) return null;
  const idle = partial ? 'accent/15' : 'accent/12';
  const ink = partial ? 'black' : 'accentInk';
  return (
    <Box w={28} h={28} shrink={0} center radius="circle" bg={hovered ? 'accent' : idle}>
      <IconPlus size={16} stroke={2.6} color={color(hovered ? ink : 'accent')} />
    </Box>
  );
}
