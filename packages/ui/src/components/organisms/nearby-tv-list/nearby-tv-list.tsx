// The televisions waiting on this network, as rows.
//
// One list drawn by both shells that have one: the browser's connect screen and
// the phone's. What each of them keeps is genuinely its own (the browser wraps
// this in a section with a heading, the phone in an empty state and a "still
// looking" footer), but a ROW is a row, and it was written twice - down to the
// tick, the spinner and the badge - which is two places for the two to drift
// apart in front of the same person holding both devices.
//
// It renders the rows and nothing around them. Everything a tap DOES lives in
// `useHandoffPicker` (@kroma/core/react); this only says what a row looks like
// while it is doing it.
//
// `t` is a prop rather than the kit's own `useT`, because the phone mounts its
// own translator and would otherwise read an empty catalogue here.

import type { DiscoveredTv, Translate } from '@kroma/core';
import type { HandoffOutcome } from '@kroma/core/react';
import { handoffRowHint } from '@kroma/core/react';
import type { ReactNode } from 'react';
import { Badge } from '#ui/components/atoms/badge';
import { Icon } from '#ui/components/atoms/icon';
import { Spinner } from '#ui/components/atoms/spinner';
import { ListRow } from '#ui/components/molecules/list-row';

export interface NearbyTvListProps {
  devices: readonly DiscoveredTv[];
  /** The row a grant is in flight for, if any. */
  connectingHandle?: string | null;
  /** How the tap on this row ended, or null while it has not been tapped. */
  outcomeFor: (device: DiscoveredTv) => HandoffOutcome | null;
  onSelect: (device: DiscoveredTv) => void;
  t: Translate;
}

export function NearbyTvList({
  devices,
  connectingHandle,
  outcomeFor,
  onSelect,
  t,
}: Readonly<NearbyTvListProps>) {
  return (
    <ListRow.Group>
      {devices.map((device) => {
        const busy = connectingHandle === device.handle;
        const outcome = outcomeFor(device);
        const hint = handoffRowHint(device, busy, outcome, t);
        return (
          <ListRow.Root
            key={device.handle}
            size="sm"
            icon="device-tv"
            // A finished row is not a row to press again: the beacon behind it
            // is spent, and the row is only still here to be read.
            onPress={outcome ? undefined : () => onSelect(device)}
            busy={busy || undefined}
          >
            <ListRow.Label>{device.name}</ListRow.Label>
            {hint ? <ListRow.Hint>{hint}</ListRow.Hint> : null}
            <ListRow.Trailing>
              <RowEnd device={device} busy={busy} outcome={outcome} />
            </ListRow.Trailing>
          </ListRow.Root>
        );
      })}
    </ListRow.Group>
  );
}

// The check string is what the row carries when nothing is happening to it: it
// is there so a television that named itself after yours can be told from yours,
// not because anyone is usually asked to type it.
function RowEnd({
  device,
  busy,
  outcome,
}: Readonly<{ device: DiscoveredTv; busy: boolean; outcome: HandoffOutcome | null }>): ReactNode {
  if (busy) return <Spinner size={18} thickness={2} />;
  if (outcome === 'done') return <Icon name="check" size={18} thickness={2.4} color="success" />;
  if (outcome) return <Icon name="alert-triangle" size={18} thickness={2.2} color="danger" />;
  return <Badge tone="neutral">{device.check}</Badge>;
}
