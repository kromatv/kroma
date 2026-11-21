// The device picker, as an imperative callable: `const id = await castPicker()`.
//
// A callable rather than a popover because the answer is what every caller
// actually wants - "which screen" - and none of them should have to hold open
// state to ask. Its single root is mounted in the app shell.

import type { DeviceId } from '@kromatv/client';
import { useCast, useT } from '@kromatv/ui';
import { Dialog, EmptyState, ListRow } from '@kromatv/ui/kit';
import { createCallable } from 'react-call';
import { CastReceiverRow, DeviceRow } from './cast-receiver-row.component';

export interface CastPickerProps {
  offerLocal?: boolean;
}

type Picked = DeviceId | null | undefined;

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
            <CastReceiverRow
              key={r.id}
              receiver={r}
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

/** Ask which screen to play on. Resolves the receiver id, `null` for "this
 * device", or `undefined` when dismissed. */
export const castPicker = (props: CastPickerProps = {}): Promise<Picked> => CastPicker.call(props);
