// The device picker, as an imperative callable: `const id = await castPicker()`.
//
// A callable rather than a popover because the answer is what every caller
// actually wants - "which screen" - and none of them should have to hold open
// state to ask. Its single root is mounted in the app shell.

import { useCast, useT } from '@kroma/ui';
import { Dialog, EmptyState, Icon, type IconName, ListRow } from '@kroma/ui/kit';
import { createCallable } from 'react-call';

export interface CastPickerProps {
  offerLocal?: boolean;
}

// `undefined` = dismissed · `null` = this device · a string = that receiver.
type Picked = string | null | undefined;

export const CastPicker = createCallable<CastPickerProps, Picked>(({ call, offerLocal }) => {
  const t = useT();
  const { receivers, active } = useCast();
  return (
    <Dialog.Root open title={t('cast.title')} onClose={() => call.end(undefined)} width="md">
      {offerLocal || receivers.length > 0 ? (
        <ListRow.Group size="sm">
          {offerLocal ? (
            <DeviceRow
              icon="device-desktop"
              name={t('cast.thisDevice')}
              detail={t('cast.playHere')}
              selected={!active}
              onPick={() => call.end(null)}
            />
          ) : null}
          {receivers.map((r) => (
            <DeviceRow
              key={r.id}
              icon="device-tv"
              name={r.name}
              detail={
                r.nowPlaying
                  ? (r.nowPlaying.item.metadata?.title ?? r.nowPlaying.item.title)
                  : `${r.username} · ${t('cast.idle')}`
              }
              selected={active?.id === r.id}
              onPick={() => call.end(r.id)}
            />
          ))}
        </ListRow.Group>
      ) : null}
      {receivers.length === 0 ? (
        <EmptyState.Root size="sm">
          <EmptyState.Title>{t('cast.noDevices')}</EmptyState.Title>
          <EmptyState.Hint>{t('cast.noDevicesHint')}</EmptyState.Hint>
        </EmptyState.Root>
      ) : null}
    </Dialog.Root>
  );
});

function DeviceRow({
  icon,
  name,
  detail,
  selected,
  onPick,
}: Readonly<{
  icon: IconName;
  name: string;
  detail: string;
  selected: boolean;
  onPick: () => void;
}>) {
  return (
    <ListRow.Root size="sm" role="option" selected={selected} chevron={false} onPress={onPick}>
      <ListRow.Label>{name}</ListRow.Label>
      <ListRow.Hint>{detail}</ListRow.Hint>
      <ListRow.Leading>
        <Icon name={icon} size={22} thickness={1.8} color={selected ? 'accent' : 'text'} />
      </ListRow.Leading>
      {selected ? (
        <ListRow.Trailing>
          <Icon name="check" size={18} thickness={2.4} color="accent" />
        </ListRow.Trailing>
      ) : null}
    </ListRow.Root>
  );
}

/** Ask which screen to play on. Resolves the receiver id, `null` for "this
 * device", or `undefined` when dismissed. */
export const castPicker = (props: CastPickerProps = {}): Promise<Picked> => CastPicker.call(props);
