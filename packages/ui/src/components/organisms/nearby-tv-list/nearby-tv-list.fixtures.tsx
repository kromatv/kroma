import type { DiscoveredTv } from '@kroma/core';

import type { HandoffOutcome } from '@kroma/core/react';

import { Box } from '#ui/components/atoms/box';

import { Text } from '#ui/components/atoms/text';

import { useT } from '#ui/services/i18n';

import { NearbyTvList } from './nearby-tv-list';

export const SALON: DiscoveredTv = {
  handle: 'h-4f2a91',
  name: 'Salon',
  platform: 'tvOS',
  check: 'K7QMR',
  confirmRequired: false,
  via: 'server',
};

export const CHAMBRE: DiscoveredTv = {
  handle: 'h-9c0b73',
  name: 'Chambre',
  platform: 'Tizen',
  check: 'B4XRT',
  confirmRequired: false,
  via: 'server',
};

export // Heard on this link and never placed by the server, which is what makes it ask
// for its check string, and carrying its platform as its name, which is what a
// set nobody has renamed publishes. The row prints the word once.
const SPARE: DiscoveredTv = {
  handle: 'h-1de55c',
  name: 'webOS',
  platform: 'webOS',
  check: 'M2NDV',
  confirmRequired: true,
  via: 'lan',
  proof: 'e3c17b90',
};

export const DEVICES: DiscoveredTv[] = [SALON, CHAMBRE, SPARE];

export type RowState = 'resting' | 'connecting' | HandoffOutcome;

export const STATES: RowState[] = ['resting', 'connecting', 'done', 'gone', 'checkTooMany'];

export const finished = (state: RowState): HandoffOutcome | null =>
  state === 'resting' || state === 'connecting' ? null : state;

export function Demo({ state }: Readonly<{ state: RowState }>) {
  const t = useT();
  return (
    <NearbyTvList
      devices={DEVICES}
      connectingHandle={state === 'connecting' ? SALON.handle : null}
      outcomeFor={(device) => (device.handle === SALON.handle ? finished(state) : null)}
      onSelect={() => {}}
      t={t}
    />
  );
}

export function EveryEnding() {
  const t = useT();
  const outcomes: Record<string, HandoffOutcome> = {
    [CHAMBRE.handle]: 'done',
    [SPARE.handle]: 'gone',
  };
  return (
    <NearbyTvList
      devices={DEVICES}
      connectingHandle={SALON.handle}
      outcomeFor={(device) => outcomes[device.handle] ?? null}
      onSelect={() => {}}
      t={t}
    />
  );
}

export function Nothing() {
  const t = useT();
  return (
    <Box gap={10}>
      <NearbyTvList devices={[]} outcomeFor={() => null} onSelect={() => {}} t={t} />
      <Text variant="meta" color="textDim">
        An empty card. Both shells guard this case before they render the list.
      </Text>
    </Box>
  );
}
