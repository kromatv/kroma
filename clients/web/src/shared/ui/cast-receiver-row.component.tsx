// One television in a list of screens to play on: its name, what it is doing,
// and whether it is the one being driven. Shared by the picker and the connect
// page, so a set reads the same wherever it is listed.

import type { CastReceiver } from '@kromatv/client/cast';
import { type CastRowState, castRowState, useCast, useT } from '@kromatv/ui';
import { Icon, type IconName, ListRow, Spinner, StatusDot } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';

const OFF_HINT = {
  waking: 'cast.waking',
  needsPower: 'cast.needsPower',
  asleep: 'cast.asleep',
} as const;

function detailOf(r: CastReceiver, state: CastRowState, t: ReturnType<typeof useT>): string {
  if (state !== 'playing' && state !== 'idle') {
    return t(OFF_HINT[state]);
  }
  const playing = r.nowPlaying?.item;
  return playing ? (playing.metadata?.title ?? playing.title) : t('cast.idle');
}

interface DeviceRowProps {
  icon: IconName;
  name: string;
  detail: string;
  selected: boolean;
  state?: CastRowState;
  onPick: () => void;
}

export function DeviceRow(props: Readonly<DeviceRowProps>) {
  const { icon, name, detail, selected, state = 'idle', onPick } = props;
  return (
    <ListRow.Root
      size="sm"
      role="option"
      aria-selected={selected}
      selected={selected}
      icon={icon}
      chevron={false}
      onPress={onPick}
    >
      <ListRow.Label>{name}</ListRow.Label>
      <ListRow.Hint>{detail}</ListRow.Hint>
      <ListRow.Trailing>{rowMark({ selected, state })}</ListRow.Trailing>
    </ListRow.Root>
  );
}

function rowMark(row: { selected: boolean; state: CastRowState }): ReactNode {
  if (row.state === 'waking') {
    return <Spinner size={18} thickness={2} />;
  }
  if (row.selected) {
    return <Icon name="check" size={18} thickness={2.4} color="accent" />;
  }
  return <StatusDot online={row.state === 'playing' || row.state === 'idle'} />;
}

export function CastReceiverRow({
  receiver,
  selected,
  onPick,
}: Readonly<{ receiver: CastReceiver; selected: boolean; onPick: () => void }>) {
  const t = useT();
  const state = castRowState(receiver, useCast());
  return (
    <DeviceRow
      icon="device-tv"
      name={receiver.name}
      detail={detailOf(receiver, state, t)}
      state={state}
      selected={selected}
      onPick={onPick}
    />
  );
}
